import { deriveStatus, toLinkId } from '@linkops/shared/domain';
import type { LinkStatus } from '@linkops/shared/domain';
import type {
  LinkRecord,
  LinkRepository,
} from '@linkops/server/links-data-access';
import { link } from './link-record.fixture';
import { Simulator } from './simulator';
import { TelemetrySampleStore } from './telemetry-sample-store';
import { TelemetryBus, type TelemetryTick } from './telemetry-bus';
import { systemClock } from './clock';
import type { Random } from './random';

/** A Roster the test can mutate mid-run, exactly like a real fleet changing. */
function fakeRepository(
  links: LinkRecord[],
): LinkRepository & { links: LinkRecord[] } {
  const repository = {
    links,
    findById: vi.fn(),
    findAll: vi.fn((): LinkRecord[] => repository.links),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn((): number => repository.links.length),
  };

  return repository;
}

/** Zero noise every draw, so a Tick's output is exactly the reversion math. */
const fixedRandom: Random = () => 0.5;

/** Pops scripted values in order, then falls back to a fixed draw — zero
 * noise and no episode start — once the script runs out. */
function scriptedRandom(scripted: number[], fallback: number): Random {
  let i = 0;
  return () => (i < scripted.length ? scripted[i++] : fallback);
}

describe('Simulator', () => {
  it('produces no Sample before the first Tick', () => {
    const repository = fakeRepository([link()]);
    const store = new TelemetrySampleStore(300);
    const bus = new TelemetryBus();
    new Simulator(repository, store, bus, systemClock, fixedRandom);

    expect(store.latestSample(link().id)).toBeNull();
  });

  it('ticks at 1 Hz on one setInterval, writing a Sample per Roster Link each Tick', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const target = link();
    const repository = fakeRepository([target]);
    const store = new TelemetrySampleStore(300);
    const bus = new TelemetryBus();
    const simulator = new Simulator(
      repository,
      store,
      bus,
      systemClock,
      fixedRandom,
    );
    simulator.onModuleInit();

    vi.advanceTimersByTime(1_000);

    expect(store.latestSample(target.id)?.ts).toBe('2026-01-01T00:00:01.000Z');

    vi.advanceTimersByTime(1_000);

    expect(store.latestSample(target.id)?.ts).toBe('2026-01-01T00:00:02.000Z');

    vi.useRealTimers();
  });

  it('reads the Roster fresh each Tick, so a Link created mid-run gets its first Sample on the next Tick', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const repository = fakeRepository([link({ id: toLinkId('lnk_0001') })]);
    const store = new TelemetrySampleStore(300);
    const bus = new TelemetryBus();
    const simulator = new Simulator(
      repository,
      store,
      bus,
      systemClock,
      fixedRandom,
    );
    simulator.onModuleInit();

    vi.advanceTimersByTime(1_000);
    expect(store.latestSample(toLinkId('lnk_0002'))).toBeNull();

    repository.links.push(
      link({ id: toLinkId('lnk_0002'), name: 'Second Link' }),
    );
    vi.advanceTimersByTime(1_000);

    expect(store.latestSample(toLinkId('lnk_0002'))).not.toBeNull();

    vi.useRealTimers();
  });

  it('publishes exactly one Tick to the Bus, carrying every Sample that Tick produced', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const repository = fakeRepository([
      link({ id: toLinkId('lnk_0001') }),
      link({ id: toLinkId('lnk_0002'), name: 'Second Link' }),
    ]);
    const store = new TelemetrySampleStore(300);
    const bus = new TelemetryBus();
    const ticks: TelemetryTick[] = [];
    bus.asObservable().subscribe((published) => ticks.push(published));
    const simulator = new Simulator(
      repository,
      store,
      bus,
      systemClock,
      fixedRandom,
    );
    simulator.onModuleInit();

    vi.advanceTimersByTime(1_000);

    expect(ticks).toHaveLength(1);
    expect(ticks[0].samples.map((sample) => sample.linkId)).toEqual([
      'lnk_0001',
      'lnk_0002',
    ]);

    vi.useRealTimers();
  });

  it('numbers the Ticks from one and carries the time each Tick ran at', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const repository = fakeRepository([link()]);
    const store = new TelemetrySampleStore(300);
    const bus = new TelemetryBus();
    const ticks: TelemetryTick[] = [];
    bus.asObservable().subscribe((published) => ticks.push(published));
    const simulator = new Simulator(
      repository,
      store,
      bus,
      systemClock,
      fixedRandom,
    );
    simulator.onModuleInit();

    vi.advanceTimersByTime(3_000);

    // The Tick number is what the stream puts on the wire as `id:`, so it
    // starts at 1 rather than 0 — there is no zeroth Tick to name.
    expect(ticks.map((published) => published.tick)).toEqual([1, 2, 3]);
    expect(ticks.map((published) => published.ts)).toEqual([
      '2026-01-01T00:00:01.000Z',
      '2026-01-01T00:00:02.000Z',
      '2026-01-01T00:00:03.000Z',
    ]);

    vi.useRealTimers();
  });

  it('still publishes a Tick carrying no Samples when the Roster is empty', () => {
    vi.useFakeTimers();
    const repository = fakeRepository([]);
    const store = new TelemetrySampleStore(300);
    const bus = new TelemetryBus();
    const ticks: TelemetryTick[] = [];
    bus.asObservable().subscribe((published) => ticks.push(published));
    const simulator = new Simulator(
      repository,
      store,
      bus,
      systemClock,
      fixedRandom,
    );
    simulator.onModuleInit();

    vi.advanceTimersByTime(1_000);

    expect(ticks).toHaveLength(1);
    expect(ticks[0].samples).toEqual([]);

    vi.useRealTimers();
  });

  describe('beforeApplicationShutdown', () => {
    it('clears the interval so no further Ticks fire', () => {
      vi.useFakeTimers();
      const target = link();
      const repository = fakeRepository([target]);
      const store = new TelemetrySampleStore(300);
      const bus = new TelemetryBus();
      const simulator = new Simulator(
        repository,
        store,
        bus,
        systemClock,
        fixedRandom,
      );
      simulator.onModuleInit();
      vi.advanceTimersByTime(1_000);
      const afterOneTick = store.latestSample(target.id);

      simulator.beforeApplicationShutdown();
      vi.advanceTimersByTime(5_000);

      expect(store.latestSample(target.id)).toEqual(afterOneTick);
      vi.useRealTimers();
    });

    it('completes the TelemetryBus', () => {
      const repository = fakeRepository([]);
      const store = new TelemetrySampleStore(300);
      const bus = new TelemetryBus();
      let completed = false;
      bus.asObservable().subscribe({ complete: () => (completed = true) });
      const simulator = new Simulator(
        repository,
        store,
        bus,
        systemClock,
        fixedRandom,
      );

      simulator.beforeApplicationShutdown();

      expect(completed).toBe(true);
    });

    it('is safe to call before the interval ever started', () => {
      const repository = fakeRepository([]);
      const store = new TelemetrySampleStore(300);
      const bus = new TelemetryBus();
      const simulator = new Simulator(
        repository,
        store,
        bus,
        systemClock,
        fixedRandom,
      );

      expect(() => simulator.beforeApplicationShutdown()).not.toThrow();
    });
  });

  describe('deletion racing a Tick', () => {
    it('leaves no buffer and no emission when the repository delete and dropLink both land before the next Tick', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const target = link();
      const repository = fakeRepository([target]);
      const store = new TelemetrySampleStore(300);
      const bus = new TelemetryBus();
      const ticks: TelemetryTick[] = [];
      bus.asObservable().subscribe((published) => ticks.push(published));
      const simulator = new Simulator(
        repository,
        store,
        bus,
        systemClock,
        fixedRandom,
      );
      simulator.onModuleInit();
      vi.advanceTimersByTime(1_000);

      // The delete path, in its load-bearing order: repository first, then
      // dropLink — see LinksController.remove.
      repository.links.length = 0;
      store.dropLink(target.id);

      vi.advanceTimersByTime(1_000);

      expect(store.latestSample(target.id)).toBeNull();
      expect(ticks[1].samples).toEqual([]);

      vi.useRealTimers();
    });

    it('leaves no buffer when a Tick writes a Sample and dropLink evicts it a moment later', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const target = link();
      const repository = fakeRepository([target]);
      const store = new TelemetrySampleStore(300);
      const bus = new TelemetryBus();
      const simulator = new Simulator(
        repository,
        store,
        bus,
        systemClock,
        fixedRandom,
      );
      simulator.onModuleInit();

      vi.advanceTimersByTime(1_000);
      expect(store.latestSample(target.id)).not.toBeNull();

      store.dropLink(target.id);

      expect(store.latestSample(target.id)).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('Degradation Episodes', () => {
    it('starts an episode from a forced Random draw, visibly degrades the Link, then ends it and lets Status recover', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const target = link();
      const repository = fakeRepository([target]);
      const store = new TelemetrySampleStore(300);
      const bus = new TelemetryBus();
      // Ticks 1-4 (indices 0-3): healthy, zero noise. Tick 2 (indices 4-5):
      // the start-probability draw forces an episode, the duration draw
      // picks its shortest length. Everything after falls back to zero
      // noise and never rolls another start.
      const random = scriptedRandom([0.5, 0.5, 0.5, 0.5, 0, 0], 0.5);
      const simulator = new Simulator(
        repository,
        store,
        bus,
        systemClock,
        random,
      );
      simulator.onModuleInit();

      function statusAfterNextTick(): LinkStatus {
        vi.advanceTimersByTime(1_000);
        return deriveStatus(target, store.latestSample(target.id), new Date());
      }

      // Tick 1: healthy, before the episode starts.
      expect(statusAfterNextTick()).toEqual({ status: 'up' });

      // Ticks 2-9: the episode is active — the target is pulled down, and
      // Status traceably changes to `degraded` partway through the walk.
      const midEpisode: LinkStatus[] = [];
      for (let tick = 2; tick <= 9; tick++) {
        midEpisode.push(statusAfterNextTick());
      }

      expect(midEpisode).toContainEqual({ status: 'degraded' });
      expect(midEpisode[midEpisode.length - 1]).toEqual({
        status: 'degraded',
      });

      // Ticks 10+: the countdown reached zero, the target reverted, and the
      // walk recovers back to `up`.
      let recovered: LinkStatus | undefined;
      for (let tick = 10; tick <= 14 && recovered === undefined; tick++) {
        const status = statusAfterNextTick();
        if (status.status === 'up') recovered = status;
      }

      expect(recovered).toEqual({ status: 'up' });

      vi.useRealTimers();
    });
  });
});
