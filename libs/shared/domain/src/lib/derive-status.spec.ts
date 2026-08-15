import { toLinkId } from './ids';
import { deriveStatus } from './derive-status';
import type { TelemetrySample } from './telemetry-sample';

const link = { capacityMbps: 300 };
const now = new Date('2026-08-15T09:00:00.000Z');

const sampleAt = (
  snrDb: number,
  throughputMbps: number,
  ageMs = 0,
): TelemetrySample => ({
  linkId: toLinkId('lnk_0001'),
  ts: new Date(now.getTime() - ageMs).toISOString(),
  rssiDbm: -62,
  snrDb,
  throughputMbps,
});

describe('deriveStatus', () => {
  it('is down for want of data when there is no Sample at all', () => {
    expect(deriveStatus(link, null, now)).toEqual({
      status: 'down',
      reason: 'stale',
    });
  });

  it('is up when snrDb and throughputMbps both clear the up thresholds', () => {
    const sample = sampleAt(18, 180); // 0.6 * 300 = 180

    expect(deriveStatus(link, sample, now)).toEqual({ status: 'up' });
  });

  it('is down for bad metrics when both readings fall below the degraded floor', () => {
    const sample = sampleAt(0, 0);

    expect(deriveStatus(link, sample, now)).toEqual({
      status: 'down',
      reason: 'metrics',
    });
  });

  it('is degraded when readings clear the degraded floor but not the up thresholds', () => {
    const sample = sampleAt(10, 60); // 0.2 * 300 = 60

    expect(deriveStatus(link, sample, now)).toEqual({ status: 'degraded' });
  });

  it('is degraded, not up, at snrDb 17.9 — just under the up threshold', () => {
    const sample = sampleAt(17.9, 180);

    expect(deriveStatus(link, sample, now)).toEqual({ status: 'degraded' });
  });

  it('is degraded, not up, at throughput just under 0.6 * capacity', () => {
    const sample = sampleAt(18, 179.9);

    expect(deriveStatus(link, sample, now)).toEqual({ status: 'degraded' });
  });

  it('is down for metrics, not degraded, at snrDb 9.9 — just under the degraded floor', () => {
    const sample = sampleAt(9.9, 60);

    expect(deriveStatus(link, sample, now)).toEqual({
      status: 'down',
      reason: 'metrics',
    });
  });

  it('is down for metrics, not degraded, at throughput just under 0.2 * capacity', () => {
    const sample = sampleAt(10, 59.9);

    expect(deriveStatus(link, sample, now)).toEqual({
      status: 'down',
      reason: 'metrics',
    });
  });

  it('still trusts a Sample 4.9 seconds old', () => {
    const sample = sampleAt(18, 180, 4_900);

    expect(deriveStatus(link, sample, now)).toEqual({ status: 'up' });
  });

  it('stops trusting a Sample once it reaches 5.0 seconds old', () => {
    const sample = sampleAt(18, 180, 5_000);

    expect(deriveStatus(link, sample, now)).toEqual({
      status: 'down',
      reason: 'stale',
    });
  });

  it('reports stale, not up, for an old-but-perfect reading', () => {
    // A five-second-old reading is not evidence the Link is healthy now.
    const sample = sampleAt(100, 1000, 30_000);

    expect(deriveStatus(link, sample, now)).toEqual({
      status: 'down',
      reason: 'stale',
    });
  });

  it('judges throughput against the Link it belongs to, not an absolute floor', () => {
    // 40 Mbps is healthy on a 50 Mbps Link and a fault on a 1000 Mbps one.
    const sample = sampleAt(25, 40);

    expect(deriveStatus({ capacityMbps: 50 }, sample, now)).toEqual({
      status: 'up',
    });
    expect(deriveStatus({ capacityMbps: 1000 }, sample, now)).toEqual({
      status: 'down',
      reason: 'metrics',
    });
  });

  it('reads no clock of its own — now is always a parameter', () => {
    const sample = sampleAt(18, 180);
    const later = new Date(now.getTime() + 6_000);

    expect(deriveStatus(link, sample, now)).toEqual({ status: 'up' });
    expect(deriveStatus(link, sample, later)).toEqual({
      status: 'down',
      reason: 'stale',
    });
  });
});
