import { toLinkId } from '@linkops/shared/domain';
import type { TelemetrySample } from '@linkops/shared/domain';
import { simulateNextSample } from './simulate-next-sample';
import type { Random } from './random';

const link = { id: toLinkId('lnk_0001'), capacityMbps: 300 };
const now = new Date('2026-01-01T00:00:05.000Z');

/** Zero noise every draw — isolates the mean-reversion and coupling math. */
const midpoint: Random = () => 0.5;

/** Pops values in order, so a test can pin exactly what each random() draw does. */
function sequence(values: number[]): Random {
  let i = 0;
  return () => values[i++];
}

function previousAt(overrides: Partial<TelemetrySample>): TelemetrySample {
  return {
    linkId: link.id,
    ts: '2026-01-01T00:00:04.000Z',
    rssiDbm: -55,
    snrDb: 25,
    throughputMbps: 250,
    ...overrides,
  };
}

describe('simulateNextSample', () => {
  it('stamps the Sample with the Link id and the given now, as an ISO datetime', () => {
    const result = simulateNextSample(link, null, now, midpoint);

    expect(result.linkId).toBe(link.id);
    expect(result.ts).toBe(now.toISOString());
  });

  it('starts at the mean-reversion target when there is no previous Sample', () => {
    const result = simulateNextSample(link, null, now, midpoint);

    expect(result.rssiDbm).toBe(-55);
    expect(result.snrDb).toBe(25);
  });

  it('mean-reverts a previous Sample toward the target rather than jumping to it', () => {
    const previous = previousAt({ rssiDbm: -1, snrDb: 1 });

    const result = simulateNextSample(link, previous, now, midpoint);

    // 30% of the distance to target, zero noise at the midpoint draw.
    expect(result.rssiDbm).toBeCloseTo(-1 + 0.3 * (-55 - -1));
    expect(result.snrDb).toBeCloseTo(1 + 0.3 * (25 - 1));
  });

  it('moves further from the previous Sample toward target than a smaller reversion would', () => {
    const nearTarget = simulateNextSample(
      link,
      previousAt({ snrDb: 24 }),
      now,
      midpoint,
    );
    const farFromTarget = simulateNextSample(
      link,
      previousAt({ snrDb: 0 }),
      now,
      midpoint,
    );

    // Reversion is proportional to distance, so the farther start moves by more.
    expect(Math.abs(farFromTarget.snrDb - 0)).toBeGreaterThan(
      Math.abs(nearTarget.snrDb - 24),
    );
  });

  it('adds noise scaled by the random draw, symmetric around zero', () => {
    const low = simulateNextSample(link, null, now, () => 0);
    const high = simulateNextSample(link, null, now, () => 1);

    expect(low.snrDb).toBeLessThan(25);
    expect(high.snrDb).toBeGreaterThan(25);
    expect(low.rssiDbm).toBeLessThan(-55);
    expect(high.rssiDbm).toBeGreaterThan(-55);
  });

  it('clamps rssiDbm to the schema ceiling of 0 even from a corrupt previous Sample', () => {
    const previous = previousAt({ rssiDbm: 1000 });

    const result = simulateNextSample(link, previous, now, midpoint);

    expect(result.rssiDbm).toBeLessThanOrEqual(0);
  });

  it('never lets the walk push rssiDbm or snrDb to a runaway extreme', () => {
    const result = simulateNextSample(
      link,
      previousAt({ rssiDbm: -1_000_000, snrDb: 1_000_000 }),
      now,
      () => 1,
    );

    // No real Sample is beyond this — an independent sanity bound, not the
    // implementation's own floor/ceiling restated.
    expect(result.rssiDbm).toBeGreaterThanOrEqual(-1_000);
    expect(result.snrDb).toBeLessThanOrEqual(1_000);
  });

  it('floors rssiDbm at -95, 5 dB below this link class’s typical -30..-90 range', () => {
    const result = simulateNextSample(
      link,
      previousAt({ rssiDbm: -500 }),
      now,
      () => 0,
    );

    expect(result.rssiDbm).toBeGreaterThanOrEqual(-95);
  });

  it('bounds snrDb to -5..40, 5 dB below this link class’s typical 0..40 range at the floor and matching it exactly at the ceiling', () => {
    const low = simulateNextSample(
      link,
      previousAt({ snrDb: -500 }),
      now,
      () => 0,
    );
    const high = simulateNextSample(
      link,
      previousAt({ snrDb: 500 }),
      now,
      () => 1,
    );

    expect(low.snrDb).toBeGreaterThanOrEqual(-5);
    expect(high.snrDb).toBeLessThanOrEqual(40);
  });

  it('derives throughputMbps from the walked snrDb, scaled by capacityMbps', () => {
    const smaller = simulateNextSample(
      { id: link.id, capacityMbps: 100 },
      null,
      now,
      midpoint,
    );
    const larger = simulateNextSample(
      { id: link.id, capacityMbps: 1000 },
      null,
      now,
      midpoint,
    );

    // Same snrDb (25, zero noise), so the ratio is identical and only capacity scales it.
    expect(larger.throughputMbps).toBeCloseTo(smaller.throughputMbps * 10);
    expect(smaller.throughputMbps).toBeGreaterThan(0);
  });

  it('rises with a higher walked snrDb, all else held equal', () => {
    const lowSnr = simulateNextSample(
      link,
      previousAt({ snrDb: 5 }),
      now,
      midpoint,
    );
    const highSnr = simulateNextSample(
      link,
      previousAt({ snrDb: 25 }),
      now,
      midpoint,
    );

    expect(highSnr.snrDb).toBeGreaterThan(lowSnr.snrDb);
    expect(highSnr.throughputMbps).toBeGreaterThan(lowSnr.throughputMbps);
  });

  it("carries its own noise draw, independent of snrDb's", () => {
    // rssi draw, snr draw pinned identically; only the throughput draw differs.
    const quiet = simulateNextSample(
      link,
      null,
      now,
      sequence([0.5, 0.5, 0.5]),
    );
    const noisy = simulateNextSample(link, null, now, sequence([0.5, 0.5, 1]));

    expect(noisy.snrDb).toBe(quiet.snrDb);
    expect(noisy.throughputMbps).not.toBe(quiet.throughputMbps);
  });

  it('clamps throughputMbps within [0, capacityMbps]', () => {
    const saturated = simulateNextSample(
      link,
      previousAt({ snrDb: 1_000_000 }),
      now,
      () => 1,
    );
    const floored = simulateNextSample(
      link,
      previousAt({ snrDb: -1_000_000 }),
      now,
      () => 0,
    );

    expect(saturated.throughputMbps).toBeLessThanOrEqual(link.capacityMbps);
    expect(floored.throughputMbps).toBeGreaterThanOrEqual(0);
  });
});
