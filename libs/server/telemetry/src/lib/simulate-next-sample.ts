import type { LinkId, TelemetrySample } from '@linkops/shared/domain';
import type { Random } from './random';

// Mean-reversion targets. Chosen so a freshly-created Link's first Sample
// reads comfortably `up` (`deriveStatus`'s thresholds are `snrDb >= 18` and
// `throughputMbps >= 0.6 * capacityMbps`) — a fleet that has just started
// ticking should look healthy, not born half-degraded. Ticket 25's
// Degradation Episodes are what pulls a Link's target down; this file only
// walks around one fixed, healthy target.
const RSSI_TARGET_DBM = -55;
// The schema only caps rssiDbm at 0; this floor is not a schema requirement,
// just a sanity backstop so the walk stays a plausible Sample even under
// adversarial noise, instead of drifting to an arbitrarily large negative.
const RSSI_FLOOR_DBM = -100;

const SNR_TARGET_DB = 25;
// The schema leaves snrDb unbounded; same kind of sanity backstop as
// RSSI_FLOOR_DBM, not a wire constraint.
const SNR_FLOOR_DB = -10;
const SNR_CEILING_DB = 45;

// The snrDb at which the walk considers a Link saturated at its own
// capacity. Chosen so the target snrDb (25) already sits comfortably above
// `deriveStatus`'s `up` throughput ratio (0.6): 25 / 30 ≈ 0.83.
const SNR_AT_FULL_CAPACITY_DB = 30;

const RSSI_NOISE_DB = 2;
const SNR_NOISE_DB = 2;
// Throughput's own noise, independent of snrDb's — real Throughput jitters
// on its own, not only as a function of signal quality.
const THROUGHPUT_NOISE_RATIO = 0.05;

const REVERSION_RATE = 0.3;

/** `random()` is `[0, 1)`; this maps it to noise symmetric around zero. */
function noise(amplitude: number, random: Random): number {
  return (random() * 2 - 1) * amplitude;
}

/** One mean-reversion step: move a fraction of the way to target, plus noise. */
function step(
  current: number,
  target: number,
  amplitude: number,
  random: Random,
): number {
  return (
    current + REVERSION_RATE * (target - current) + noise(amplitude, random)
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The link fields the walk needs — `capacityMbps` for scaling throughput,
 * `id` for stamping the Sample. Never the whole `LinkRecord`, so a caller
 * outside `server/telemetry` cannot lean on a field this file has no use for.
 */
export interface SimulatedLink {
  id: LinkId;
  capacityMbps: number;
}

/**
 * Produces one Link's next Telemetry Sample from its previous one — a pure
 * function of `previous`, `now` and `random`, so the Simulator's Tick loop
 * stays a thin orchestrator and every walk behaviour is testable without a
 * timer. `previous` is `null` for a Link's first-ever Sample.
 */
export function simulateNextSample(
  link: SimulatedLink,
  previous: TelemetrySample | null,
  now: Date,
  random: Random,
): TelemetrySample {
  const rssiDbm = clamp(
    step(
      previous?.rssiDbm ?? RSSI_TARGET_DBM,
      RSSI_TARGET_DBM,
      RSSI_NOISE_DB,
      random,
    ),
    RSSI_FLOOR_DBM,
    0,
  );

  const snrDb = clamp(
    step(previous?.snrDb ?? SNR_TARGET_DB, SNR_TARGET_DB, SNR_NOISE_DB, random),
    SNR_FLOOR_DB,
    SNR_CEILING_DB,
  );

  const utilizationRatio = clamp(snrDb / SNR_AT_FULL_CAPACITY_DB, 0, 1);
  const throughputMbps = clamp(
    link.capacityMbps * utilizationRatio +
      noise(THROUGHPUT_NOISE_RATIO * link.capacityMbps, random),
    0,
    link.capacityMbps,
  );

  return {
    linkId: link.id,
    ts: now.toISOString(),
    rssiDbm,
    snrDb,
    throughputMbps,
  };
}
