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

  it('offers the Links whose readings need attention, and no others', async () => {
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
      'No Link is reporting readings that a configuration change would help',
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
