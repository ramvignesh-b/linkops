import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  linkDeletedEventSchema,
  linkSchema,
  linkStatusEventSchema,
} from '@linkops/shared/domain';
import { buildOpenApiDocument } from '@linkops/server/links-api';
import { A2UI_AGENT, StubTriageAgent } from '@linkops/server/a2ui-agent';
import { SseTestClient, until } from './sse-client.fixture';
import { AppModule } from './app.module';

/**
 * Boots the real app — both feature modules, real providers, real Simulator
 * — with `Date`/`setInterval`/`clearInterval` faked *before* `listen()`, so
 * the Simulator's Tick interval is captured and `tick()` drives real Ticks
 * with no sleeps. `setTimeout` stays real, which is what keeps the HTTP and
 * SSE round trips working underneath it. Prior art:
 * `server-links-api.module.spec.ts`'s `useTickingServer` and
 * `server-stream-api.module.spec.ts`'s `useStreamingServer`; this is both,
 * because the edge-triggered events need both feature modules in one
 * running app — neither can drive the other over REST alone.
 */
function useTickingApp(): {
  http: () => ReturnType<INestApplication['getHttpServer']>;
  instance: () => INestApplication;
  connect: () => Promise<SseTestClient>;
} {
  let app: INestApplication;
  let baseUrl: string;
  let clients: SseTestClient[] = [];

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    clients = [];
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    for (const client of clients) client.disconnect();
    await app.close();
    vi.useRealTimers();
  });

  return {
    http: () => app.getHttpServer(),
    instance: () => app,
    connect: async () => {
      const client = await SseTestClient.connect(`${baseUrl}/stream`);
      clients.push(client);
      return client;
    },
  };
}

function tick(count: number): void {
  vi.advanceTimersByTime(count * 1_000);
}

const validCreateBody = {
  name: 'New Ridge to Depot',
  siteA: 'New Ridge',
  siteB: 'Depot',
  band: '5GHz',
  mode: 'PtP',
  capacityMbps: 300,
  txPowerDbm: 20,
  channelWidthMhz: 40,
};

describe('edge-triggered events from the per-Tick Roster diff', () => {
  const server = useTickingApp();

  it('announces a create, an edit and a delete once, on the Tick each is first seen — and never again', async () => {
    const client = await server.connect();
    await client.take(1); // fleet.snapshot, tick 0

    const created = await request(server.http())
      .post('/links')
      .send(validCreateBody);
    expect(created.status).toBe(201);
    const createdId: string = created.body.id;

    const updated = await request(server.http())
      .patch('/links/lnk_0001')
      .send({ version: 1, txPowerDbm: 25 });
    expect(updated.status).toBe(200);

    const deleted = await request(server.http()).delete('/links/lnk_0002');
    expect(deleted.status).toBe(204);

    tick(1);
    await client.takeOfType('fleet.summary', 1);
    await until(
      () => client.of('link.status').some((frame) => frame.id === '1'),
      'a link.status event on Tick 1',
    );

    const tick1 = client.frames.filter((frame) => frame.id === '1');
    const indexOf = (event: string) =>
      tick1.findIndex((frame) => frame.event === event);

    const createdFrames = tick1.filter((f) => f.event === 'link.created');
    const updatedFrames = tick1.filter((f) => f.event === 'link.updated');
    const deletedFrames = tick1.filter((f) => f.event === 'link.deleted');

    expect(createdFrames).toHaveLength(1);
    expect(updatedFrames).toHaveLength(1);
    expect(deletedFrames).toHaveLength(1);

    const createdLink = linkSchema.parse(createdFrames[0].data);
    expect(createdLink.id).toBe(createdId);
    expect(createdLink.version).toBe(1);

    const updatedLink = linkSchema.parse(updatedFrames[0].data);
    expect(updatedLink).toMatchObject({
      id: 'lnk_0001',
      version: 2,
      txPowerDbm: 25,
    });

    expect(linkDeletedEventSchema.parse(deletedFrames[0].data)).toEqual({
      linkId: 'lnk_0002',
    });

    // Membership first, then the readings, then the transitions they
    // explain, then the Summary describing all of it — never a Sample for a
    // Link the Client has not been told about.
    const telemetryIndex = indexOf('link.telemetry');
    expect(telemetryIndex).toBeGreaterThan(indexOf('link.created'));
    expect(telemetryIndex).toBeGreaterThan(indexOf('link.updated'));
    expect(telemetryIndex).toBeGreaterThan(indexOf('link.deleted'));
    for (const frame of tick1.filter((f) => f.event === 'link.status')) {
      expect(tick1.indexOf(frame)).toBeGreaterThan(telemetryIndex);
    }
    expect(indexOf('fleet.summary')).toBe(tick1.length - 1);

    // Every un-deleted seeded Link's first-ever Sample flips it off
    // `down: stale` — a transition this Tick forces deterministically, so
    // `link.status` is checked against a real one rather than a forced
    // double, and against the value `GET /api/links/:id` reports at the
    // same instant — never a second derivation path.
    const patchedStatus = tick1.find(
      (frame) =>
        frame.event === 'link.status' &&
        (frame.data as { linkId: string }).linkId === 'lnk_0001',
    );
    expect(patchedStatus).toBeDefined();
    const statusEvent = linkStatusEventSchema.parse(patchedStatus?.data);
    expect(statusEvent.previous).toEqual({ status: 'down', reason: 'stale' });
    expect(statusEvent.status).not.toEqual({ status: 'down', reason: 'stale' });

    const read = await request(server.http()).get('/links/lnk_0001');
    expect(read.body.link.status).toEqual(statusEvent.status);

    // Nothing repeats on the following Tick, and the deleted Link's ring
    // buffer produces no orphaned Sample — in this frame or the last one.
    tick(1);
    await client.takeOfType('fleet.summary', 2);
    const tick2 = client.frames.filter((frame) => frame.id === '2');
    expect(tick2.filter((f) => f.event === 'link.created')).toHaveLength(0);
    expect(tick2.filter((f) => f.event === 'link.updated')).toHaveLength(0);
    expect(tick2.filter((f) => f.event === 'link.deleted')).toHaveLength(0);

    for (const frame of client.of('link.telemetry')) {
      const samples = (frame.data as { samples: { linkId: string }[] }).samples;
      expect(samples.some((sample) => sample.linkId === 'lnk_0002')).toBe(
        false,
      );
    }
  });
});

/**
 * The Assistant's endpoint validated and shaped by the application-wide pipe
 * and filter, which `ServerLinksApiModule` provides. Its own library cannot
 * assert this: a feature library may not import another feature library, so
 * the module spec there boots without either, and the assembled app is the
 * only place the two meet. Same rule, same answer, as the edge-triggered
 * events above.
 */
describe('the Assistant endpoint under the application-wide pipe and filter', () => {
  const app = useTickingApp();

  it('refuses a body that is not an Assistant request, in the error envelope', async () => {
    const response = await request(app.http())
      .post('/agent/ui')
      .send({ kind: 'nonsense' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details.issues.length).toBeGreaterThan(0);
  });

  it('describes itself in the OpenAPI document the API serves', () => {
    // Built the same way `main.ts` builds it, which is also what proves the
    // document can be built at all with a union response schema in it — that
    // failure would take the whole API's boot with it, not just this path.
    const document = buildOpenApiDocument(app.instance());

    expect(document.paths?.['/agent/ui']?.post).toBeDefined();
  });

  it('documents the Action as part of the shared request schema', () => {
    const document = buildOpenApiDocument(app.instance());
    const ref = document.paths?.['/agent/ui']?.post?.requestBody as {
      content: { 'application/json': { schema: { $ref: string } } };
    };
    const schemaName = ref.content['application/json'].schema.$ref
      .split('/')
      .pop();
    const schema = document.components?.schemas?.[schemaName as string] as {
      oneOf: SchemaObject[];
    };
    const act = schema.oneOf.find(
      (arm) => arm.properties?.['kind']?.enum?.[0] === 'act',
    );

    expect(Object.keys(act?.properties ?? {}).sort()).toEqual(
      ['kind', 'surfaceId', 'componentId', 'event', 'data'].sort(),
    );
  });
});

/**
 * Ticket 41's own acceptance criterion: boot behaviour is asserted where
 * boot behaviour already lives. The coherence rules themselves are
 * exhaustively covered as a pure function in
 * `server-config`'s `load-environment.spec.ts`; this only has to prove that
 * the assembled application — every feature module, not just the config
 * seam in isolation — actually rests on them.
 */
describe('boot behaviour over the environment', () => {
  it('yields the stub Assistant from a default (empty) environment', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(A2UI_AGENT)).toBeInstanceOf(StubTriageAgent);

    await moduleRef.close();
  });

  it('fails initialisation on an incoherent environment, naming the variable', async () => {
    const original = process.env['ASSISTANT_PROVIDER'];
    process.env['ASSISTANT_PROVIDER'] = 'bogus';

    try {
      await expect(
        Test.createTestingModule({ imports: [AppModule] }).compile(),
      ).rejects.toThrow(/ASSISTANT_PROVIDER/);
    } finally {
      if (original === undefined) delete process.env['ASSISTANT_PROVIDER'];
      else process.env['ASSISTANT_PROVIDER'] = original;
    }
  });
});
