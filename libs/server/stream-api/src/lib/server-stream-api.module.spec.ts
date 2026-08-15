import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  fleetSnapshotSchema,
  fleetSummarySchema,
  linkTelemetryEventSchema,
  telemetrySampleSchema,
} from '@linkops/shared/domain';
import { SseSubscriberCounter } from './sse-subscriber-counter';
import { SseTestClient, until } from './sse-client.fixture';
import { ServerStreamApiModule } from './server-stream-api.module';

/**
 * Boots the real module on a real ephemeral port, with
 * `Date`/`setInterval`/`clearInterval` faked *before* `app.init()` — so both
 * the Simulator's Tick interval and the heartbeat's are captured and the fake
 * clock drives real Ticks with no sleeps. `setTimeout` stays real, which is
 * what keeps the HTTP request/response cycle working underneath it. The same
 * trick as `useTickingServer` in `server-links-api.module.spec.ts`.
 */
function useStreamingServer(): {
  module: () => TestingModule;
  connect: () => Promise<SseTestClient>;
  close: () => Promise<void>;
} {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let baseUrl: string;
  let clients: SseTestClient[] = [];
  let closed = false;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    clients = [];
    closed = false;
    moduleRef = await Test.createTestingModule({
      imports: [ServerStreamApiModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterEach(async () => {
    // A Client still connected here would keep `close()` waiting on a
    // response that has not ended, so every Client this test opened is
    // disconnected first. The shutdown test closes on its own terms.
    for (const client of clients) client.disconnect();
    if (!closed) await app.close();
    vi.useRealTimers();
  });

  return {
    module: () => moduleRef,
    connect: async () => {
      const client = await SseTestClient.connect(`${baseUrl}/stream`);
      clients.push(client);
      return client;
    },
    close: async () => {
      closed = true;
      await app.close();
    },
  };
}

/**
 * Runs `count` Ticks. Synchronous on purpose: the async advance yields to the
 * real event loop once per faked millisecond, which costs a second of wall
 * clock for every second of Fleet time. Nothing here needs that yielding —
 * every assertion waits on the frames themselves, through `until`.
 */
function tick(count: number): void {
  vi.advanceTimersByTime(count * 1_000);
}

describe('a Client disconnecting', () => {
  const server = useStreamingServer();

  it('releases its subscription, leaving every other Client streaming', async () => {
    const subscribers = server.module().get(SseSubscriberCounter);
    expect(subscribers.count).toBe(0);

    const first = await server.connect();
    await first.take(1);
    expect(subscribers.count).toBe(1);

    const second = await server.connect();
    await second.take(1);
    expect(subscribers.count).toBe(2);

    second.disconnect();
    await until(() => subscribers.count === 1, 'the second Client to release');

    // The survivor streams on, unaffected by the other Client's departure.
    tick(2);
    const survived = await first.takeOfType('link.telemetry', 2);
    expect(survived.map((frame) => frame.id)).toEqual(['1', '2']);
    expect(second.of('link.telemetry')).toHaveLength(0);

    first.disconnect();
    await until(() => subscribers.count === 0, 'the first Client to release');
  });
});

describe('the per-Tick frames', () => {
  const server = useStreamingServer();

  it('coalesce to one telemetry frame and one summary per Tick, whatever the Fleet size', async () => {
    const client = await server.connect();
    await client.take(1);

    tick(10);
    await client.takeOfType('fleet.summary', 10);

    const telemetry = client.of('link.telemetry');
    expect(telemetry).toHaveLength(10);
    expect(client.of('fleet.summary')).toHaveLength(10);

    // The keys the REST surface returns per Sample, from the one schema both
    // surfaces are built on — so "key-for-key the same shape" is compared
    // against something rather than asserted.
    const sampleKeys = Object.keys(telemetrySampleSchema.shape).sort();

    for (const [index, frame] of telemetry.entries()) {
      const parsed = linkTelemetryEventSchema.parse(frame.data);
      expect(parsed.tick).toBe(index + 1);
      expect(frame.id).toBe(String(index + 1));
      // One element per Link in the seeded Fleet, never one frame per Link.
      expect(parsed.samples).toHaveLength(10);

      // Read off the raw frame, not the parsed one: zod strips unknown keys,
      // so a schema parse alone would not notice an extra key on the wire.
      for (const sample of (frame.data as { samples: object[] }).samples) {
        expect(Object.keys(sample).sort()).toEqual(sampleKeys);
      }
    }

    for (const frame of client.of('fleet.summary')) {
      expect(fleetSummarySchema.parse(frame.data).total).toBe(10);
    }

    // Within each Tick the readings arrive before the Summary describing
    // them, the Summary is always last, and nothing but a `link.status`
    // transition sits between them — every seeded Link's first-ever Sample
    // flips it off `down: stale` on Tick 1.
    for (let tickNumber = 1; tickNumber <= 10; tickNumber++) {
      const events = client.frames
        .filter((frame) => frame.id === String(tickNumber))
        .map((frame) => frame.event);

      expect(events[0]).toBe('link.telemetry');
      expect(events.at(-1)).toBe('fleet.summary');
      expect(
        events.slice(1, -1).every((event) => event === 'link.status'),
      ).toBe(true);
    }
  });
});

describe('a Client connecting', () => {
  const server = useStreamingServer();

  it('is sent the Fleet Snapshot first, with the reconnect hint', async () => {
    tick(3);

    const client = await server.connect();
    const [snapshot] = await client.take(1);

    expect(client.response.status).toBe(200);
    expect(client.response.headers.get('content-type')).toBe(
      'text/event-stream',
    );
    // Already set by Nest's own SseStream — asserted here, never set twice.
    expect(client.response.headers.get('x-accel-buffering')).toBe('no');
    expect(client.response.headers.get('cache-control')).toContain('no-store');

    expect(snapshot.event).toBe('fleet.snapshot');
    expect(snapshot.retry).toBe(3_000);
    expect(snapshot.id).toBe('3');

    const parsed = fleetSnapshotSchema.parse(snapshot.data);
    expect(parsed.tick).toBe(3);
    expect(parsed.links).toHaveLength(10);
    expect(parsed.samples).toHaveLength(10);

    // The Summary can never contradict the Roster it was captured with.
    const counted = (kind: string) =>
      parsed.links.filter((link) => link.status.status === kind).length;
    expect(parsed.summary.total).toBe(parsed.links.length);
    expect(parsed.summary.up).toBe(counted('up'));
    expect(parsed.summary.degraded).toBe(counted('degraded'));
    expect(parsed.summary.down).toBe(counted('down'));
  });

  it('is sent Tick 0 when it connects before the Simulator has run', async () => {
    const client = await server.connect();
    const [snapshot] = await client.take(1);

    const parsed = fleetSnapshotSchema.parse(snapshot.data);
    expect(parsed.tick).toBe(0);
    expect(parsed.samples).toEqual([]);
    expect(snapshot.id).toBe('0');
  });
});

describe('an idle connection', () => {
  const server = useStreamingServer();

  it('is kept alive by a comment that carries no id of its own', async () => {
    const client = await server.connect();
    await client.take(1);

    tick(15);
    await until(
      () => client.frames.some((frame) => frame.comment !== undefined),
      'the heartbeat',
    );

    expect(client.frames.find((frame) => frame.comment !== undefined)).toEqual({
      comment: 'hb',
    });

    // Nest numbers any message that arrives without an id of its own; a
    // comment is exempt, so the Tick ids either side of a heartbeat stay
    // consecutive rather than skipping the one it would have taken.
    tick(1);
    const telemetry = await client.takeOfType('link.telemetry', 16);
    expect(telemetry.map((frame) => frame.id)).toEqual(
      Array.from({ length: 16 }, (_, index) => String(index + 1)),
    );
  });
});

describe('stopping the API', () => {
  const server = useStreamingServer();

  it('ends every open response cleanly rather than severing it mid-frame', async () => {
    const client = await server.connect();
    await client.take(1);
    tick(1);
    await client.takeOfType('link.telemetry', 1);

    // Not awaited before the assertion: the response ends as soon as the
    // Fleet stops, but `close()` then waits on the Client's own socket, and
    // this Client only releases that once it has seen the end of stream.
    const closing = server.close();
    await until(() => client.ended, 'the stream to end');

    expect(client.ended).toBe(true);
    client.disconnect();
    await closing;
  });
});
