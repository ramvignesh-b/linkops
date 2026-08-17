import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  a2uiEnvelopeSchema,
  type A2uiCreateSurface,
} from '@linkops/shared/a2ui-protocol';
import {
  LINK_REPOSITORY,
  type LinkRecord,
  type LinkRepository,
} from '@linkops/server/links-data-access';
import { TELEMETRY_PORT, type TelemetryPort } from '@linkops/server/telemetry';
import type {
  FleetSummary,
  LinkId,
  TelemetrySample,
} from '@linkops/shared/domain';
import { A2UI_AGENT } from './a2ui-agent.token';
import { GeminiAgent } from './gemini-agent';
import { ServerA2uiAgentModule } from './server-a2ui-agent.module';

/** The reading a Link is currently giving, in the terms Status is derived in. */
type Reading = 'healthy' | 'degraded' | 'bad';

/**
 * Telemetry, faked at the port — the one edge this library reads that a test
 * cannot otherwise pin, since the real one is a Simulator producing whatever
 * it produces. The Roster underneath stays real and seeded.
 */
class FakeTelemetryPort implements TelemetryPort {
  readonly samples = new Map<LinkId, TelemetrySample>();

  latestSample(id: LinkId): TelemetrySample | null {
    return this.samples.get(id) ?? null;
  }

  latestSamples(): ReadonlyMap<LinkId, TelemetrySample> {
    return this.samples;
  }

  history(): readonly TelemetrySample[] {
    return [];
  }

  summary(): FleetSummary {
    // Not a stub returning zeros: the Assistant deriving its own view of the
    // Fleet from the Summary would be a second opinion about Status, and
    // this is what makes that a failing test rather than a review comment.
    throw new Error('the Assistant does not read the Fleet Summary');
  }

  dropLink(): void {
    // Nothing to drop: this double holds one Sample per Link.
  }
}

function useServer(): {
  http: () => ReturnType<INestApplication['getHttpServer']>;
  roster: () => LinkRecord[];
  report: (record: LinkRecord, reading: Reading) => void;
} {
  let app: INestApplication;
  let repository: LinkRepository;
  const telemetry = new FakeTelemetryPort();

  beforeEach(async () => {
    vi.stubEnv('ASSISTANT_PROVIDER', 'stub');
    telemetry.samples.clear();
    const moduleRef = await Test.createTestingModule({
      imports: [ServerA2uiAgentModule],
    })
      .overrideProvider(TELEMETRY_PORT)
      .useValue(telemetry)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    repository = moduleRef.get(LINK_REPOSITORY);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  return {
    http: () => app.getHttpServer(),
    roster: () => repository.findAll(),
    report: (record, reading) => {
      const ratio = { healthy: 0.8, degraded: 0.3, bad: 0.05 }[reading];
      const snrDb = { healthy: 25, degraded: 12, bad: 5 }[reading];

      telemetry.samples.set(record.id, {
        linkId: record.id,
        // Stamped as the request is about to be made, so nothing here is ever
        // stale — staleness is a different Status with a different meaning.
        ts: new Date().toISOString(),
        rssiDbm: -60,
        snrDb,
        throughputMbps: ratio * record.capacityMbps,
      });
    },
  };
}

/** The Surface out of a reply, refusing to read one that is not valid A2UI. */
function surfaceOf(body: unknown): A2uiCreateSurface {
  const envelope = a2uiEnvelopeSchema.parse(body);
  if (!('createSurface' in envelope)) {
    throw new Error('the reply carried no Surface');
  }

  return envelope.createSurface;
}

/** The labels a Select offers, in the order the Surface lists them. */
function optionLabels(body: unknown, componentId: string): string[] {
  const component = surfaceOf(body).components.find(
    (candidate) => candidate.id === componentId,
  );
  const options = (component?.['options'] ?? []) as { label: string }[];

  return options.map((option) => option.label);
}

describe('the provider seam', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails to boot when ASSISTANT_PROVIDER selects the unshipped anthropic provider, with its key present and coherent', async () => {
    vi.stubEnv('ASSISTANT_PROVIDER', 'anthropic');
    vi.stubEnv('ASSISTANT_PROVIDER_KEY', 'sk-dummy');

    await expect(
      Test.createTestingModule({
        imports: [ServerA2uiAgentModule],
      }).compile(),
    ).rejects.toThrow(/no model client ships/);
  });

  it('boots the GeminiAgent when ASSISTANT_PROVIDER=gemini and its key is present', async () => {
    vi.stubEnv('ASSISTANT_PROVIDER', 'gemini');
    vi.stubEnv('ASSISTANT_PROVIDER_KEY', 'sk-dummy');

    const moduleRef = await Test.createTestingModule({
      imports: [ServerA2uiAgentModule],
    }).compile();

    expect(moduleRef.get(A2UI_AGENT)).toBeInstanceOf(GeminiAgent);
  });
});

describe('POST /agent/ui', () => {
  const server = useServer();

  it('answers the open request with a Surface the Console would accept', async () => {
    const response = await request(server.http())
      .post('/agent/ui')
      .send({ kind: 'open' });

    expect(response.status).toBe(200);
    // The Console validates every reply against this schema before rendering
    // it, so a Surface that fails here is one the Assistant could never show.
    const parsed = a2uiEnvelopeSchema.safeParse(response.body);
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it('offers the Links whose telemetry samples need attention, and no others', async () => {
    const [healthy, degraded, bad, ...untouched] = server.roster();
    server.report(healthy, 'healthy');
    server.report(degraded, 'degraded');
    server.report(bad, 'bad');
    // The remaining seven have never reported at all, which is down for want
    // of data — a Link to go and look at, not one to reconfigure.
    expect(untouched).toHaveLength(7);

    const response = await request(server.http())
      .post('/agent/ui')
      .send({ kind: 'open' });

    expect(optionLabels(response.body, 'link')).toEqual([
      degraded.name,
      bad.name,
    ]);
  });

  it('says so when nothing needs attention, rather than offering an empty picker', async () => {
    for (const record of server.roster()) server.report(record, 'healthy');

    const response = await request(server.http())
      .post('/agent/ui')
      .send({ kind: 'open' });

    const components = surfaceOf(response.body).components;
    expect(components.map((one) => one.component)).toEqual([
      'Surface',
      'Card',
      'Text',
    ]);
    expect(components[2]['text']).toContain(
      'No Link is reporting telemetry samples that a configuration change would help',
    );
  });

  it('answers the same Fleet with the same Surface, twice', async () => {
    const [, degraded] = server.roster();
    server.report(degraded, 'degraded');

    const first = await request(server.http())
      .post('/agent/ui')
      .send({ kind: 'open' });
    const second = await request(server.http())
      .post('/agent/ui')
      .send({ kind: 'open' });

    // A pure function of the request and the Roster: no timestamp, no
    // counter and no random id leaks into a Surface, which is what makes the
    // reply reviewable and this test worth having.
    expect(second.text).toBe(first.text);
  });

  it('references only components it also carries, from a root that comes first', async () => {
    const [, degraded] = server.roster();
    server.report(degraded, 'degraded');

    const response = await request(server.http())
      .post('/agent/ui')
      .send({ kind: 'open' });

    const { components } = surfaceOf(response.body);
    const ids = new Set(components.map((one) => one.id));
    const referenced = components.flatMap((one) => one.children ?? []);

    // A child id naming nothing renders as a labelled fallback in a Console
    // the operator is looking at, so the Server not authoring one is the
    // half of that contract this side owns.
    expect(referenced.filter((id) => !ids.has(id))).toEqual([]);
    expect(components[0].component).toBe('Surface');
    expect(components).toHaveLength(ids.size);
  });
});

/**
 * An Action against the offer's one Button, overridable per test — the
 * `surfaceId`, `componentId` and `event` a real Console would send are
 * fixed, only `data` and the occasional refusal case vary.
 */
function actionBody(
  data: Record<string, unknown>,
  overrides: Partial<{ surfaceId: string }> = {},
): Record<string, unknown> {
  return {
    kind: 'act',
    surfaceId: 'triage',
    componentId: 'recommend',
    event: 'recommend',
    data,
    ...overrides,
  };
}

describe('POST /agent/ui — the round trip', () => {
  const server = useServer();

  it('answers the confirmation Surface, naming the Link and the Remediation chosen and carrying both telemetry samples', async () => {
    const [, degraded] = server.roster();
    server.report(degraded, 'degraded');

    const action = await request(server.http())
      .post('/agent/ui')
      .send(actionBody({ linkId: degraded.id, remediation: 'narrow-channel' }));

    expect(action.status).toBe(200);
    const { components } = surfaceOf(action.body);
    const byId = (id: string) => components.find((one) => one.id === id);

    expect(byId('intro')?.['text']).toContain(degraded.name);
    expect(byId('intro')?.['text']).toContain('Narrow the Channel Width');
    expect(byId('snr')?.component).toBe('Metric');
    expect(byId('snr')?.['value']).toContain('dB');
    expect(byId('throughput')?.component).toBe('Metric');
    expect(byId('throughput')?.['value']).toContain('Mbps');
  });

  it('uses every one of the six whitelisted component types across the offer and the confirmation', async () => {
    const [, degraded] = server.roster();
    server.report(degraded, 'degraded');

    const offer = await request(server.http())
      .post('/agent/ui')
      .send({ kind: 'open' });
    const action = await request(server.http())
      .post('/agent/ui')
      .send(actionBody({ linkId: degraded.id, remediation: 'narrow-channel' }));

    const typesUsed = new Set([
      ...surfaceOf(offer.body).components.map((one) => one.component),
      ...surfaceOf(action.body).components.map((one) => one.component),
    ]);

    expect([...typesUsed].sort()).toEqual(
      ['Button', 'Card', 'Metric', 'Select', 'Surface', 'Text'].sort(),
    );
  });

  it('answers the same Action against the same Fleet with byte-identical bodies, twice', async () => {
    const [, degraded] = server.roster();
    server.report(degraded, 'degraded');
    const body = actionBody({
      linkId: degraded.id,
      remediation: 'raise-tx-power',
    });

    const first = await request(server.http()).post('/agent/ui').send(body);
    const second = await request(server.http()).post('/agent/ui').send(body);

    expect(second.text).toBe(first.text);
  });

  it('never mutates the Link the Action names', async () => {
    const [, degraded] = server.roster();
    server.report(degraded, 'degraded');

    await request(server.http())
      .post('/agent/ui')
      .send(actionBody({ linkId: degraded.id, remediation: 'narrow-channel' }));

    const unchanged = server
      .roster()
      .find((record) => record.id === degraded.id);
    expect(unchanged).toEqual(degraded);
  });

  it('refuses an Action naming a Surface it does not recognise, with the closed unusable-payload code', async () => {
    const response = await request(server.http())
      .post('/agent/ui')
      .send(actionBody({}, { surfaceId: 'not-a-real-surface' }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('A2UI_INVALID_PAYLOAD');
    expect(response.body.error.details.reason).toEqual(expect.any(String));
  });

  it('refuses an Action naming a Link or Remediation the Fleet does not have', async () => {
    const response = await request(server.http())
      .post('/agent/ui')
      .send(actionBody({ linkId: 'lnk_9999', remediation: 'narrow-channel' }));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('A2UI_INVALID_PAYLOAD');
  });
});
