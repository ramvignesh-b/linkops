import { toLinkId } from '@linkops/shared/domain';
import type { TelemetrySample } from '@linkops/shared/domain';
import { TelemetryBus, type TelemetryTick } from './telemetry-bus';

const sample: TelemetrySample = {
  linkId: toLinkId('lnk_0001'),
  ts: '2026-01-01T00:00:00.000Z',
  rssiDbm: -50,
  snrDb: 20,
  throughputMbps: 100,
};

function tick(overrides: Partial<TelemetryTick> = {}): TelemetryTick {
  return {
    tick: 1,
    ts: '2026-01-01T00:00:00.000Z',
    samples: [sample],
    ...overrides,
  };
}

describe('TelemetryBus', () => {
  it('delivers exactly the Tick passed to next() to a subscriber', () => {
    const bus = new TelemetryBus();
    const received: TelemetryTick[] = [];
    bus.asObservable().subscribe((published) => received.push(published));

    bus.next(tick());

    expect(received).toEqual([tick()]);
  });

  it('delivers one notification per next(), in order', () => {
    const bus = new TelemetryBus();
    const received: TelemetryTick[] = [];
    bus.asObservable().subscribe((published) => received.push(published));

    bus.next(tick());
    bus.next(tick({ tick: 2, samples: [] }));

    expect(received.map((published) => published.tick)).toEqual([1, 2]);
  });

  it('completes the observable on complete(), notifying subscribers', () => {
    const bus = new TelemetryBus();
    let completed = false;
    bus.asObservable().subscribe({ complete: () => (completed = true) });

    bus.complete();

    expect(completed).toBe(true);
  });

  it('emits nothing after complete()', () => {
    const bus = new TelemetryBus();
    const received: TelemetryTick[] = [];
    bus.asObservable().subscribe((published) => received.push(published));

    bus.complete();
    bus.next(tick());

    expect(received).toEqual([]);
  });
});
