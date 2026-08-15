import type { LinkId, TelemetrySample } from '@linkops/shared/domain';
import type { Random } from './random';

// Mean-reversion targets. Chosen so a freshly-created Link's first Sample
// reads comfortably `up` (`deriveStatus`'s thresholds are `snrDb >= 18` and
// `throughputMbps >= 0.6 * capacityMbps`) — a fleet that has just started
// ticking should look healthy, not born half-degraded. Ticket 25's
// Degradation Episodes are what pulls a Link's target down; this file only
// walks around one fixed, healthy target.
const RSSI_TARGET_DBM = -55;
// This class of point-to-point link typically reports -30 to -90 dBm; the
// floor here sits 5 dB below that, wide enough to cover a genuinely faulty
// Link without letting the walk drift to an arbitrarily large negative
// under adversarial noise. The schema only caps rssiDbm at 0 — this floor
// is a Simulator-internal backstop, not a wire constraint.
const RSSI_FLOOR_DBM = -95;

const SNR_TARGET_DB = 25;
// Typical SNR for this class of link runs 0 to 40 dB. The floor sits 5 dB
// below that for the same reason RSSI_FLOOR_DBM does — a severely degraded
// Link's SNR can plausibly dip below the noise floor. The ceiling matches
// the typical range exactly: nothing about a healthy Link's walk
// approaches it, so there is no case for headroom there either. The
// schema leaves snrDb unbounded — same backstop-not-a-wire-constraint
// relationship as the RSSI floor.
const SNR_FLOOR_DB = -5;
const SNR_CEILING_DB = 40;

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
