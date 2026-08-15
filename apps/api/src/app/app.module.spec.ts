import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  linkDeletedEventSchema,
  linkSchema,
  linkStatusEventSchema,
} from '@linkops/shared/domain';
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
