import { toLinkId } from '@linkops/shared/domain';
import type { TelemetrySample } from '@linkops/shared/domain';
import { TelemetryBus } from './telemetry-bus';

const sample: TelemetrySample = {
  linkId: toLinkId('lnk_0001'),
  ts: '2026-01-01T00:00:00.000Z',
  rssiDbm: -50,
  snrDb: 20,
  throughputMbps: 100,
};

describe('TelemetryBus', () => {
  it('delivers exactly the batch passed to next() to a subscriber', () => {
    const bus = new TelemetryBus();
    const received: (readonly TelemetrySample[])[] = [];
    bus.asObservable().subscribe((batch) => received.push(batch));

    bus.next([sample]);

    expect(received).toEqual([[sample]]);
  });

  it('delivers one notification per next(), in order', () => {
    const bus = new TelemetryBus();
    const received: (readonly TelemetrySample[])[] = [];
    bus.asObservable().subscribe((batch) => received.push(batch));

    bus.next([sample]);
    bus.next([]);

    expect(received).toEqual([[sample], []]);
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
    const received: (readonly TelemetrySample[])[] = [];
    bus.asObservable().subscribe((batch) => received.push(batch));

    bus.complete();
    bus.next([sample]);

    expect(received).toEqual([]);
  });
});
