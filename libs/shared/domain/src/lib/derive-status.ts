import type { LinkStatus } from './link-status';
import type { TelemetrySample } from './telemetry-sample';

export interface StatusInput {
  capacityMbps: number;
}

/**
 * A reading older than this is not evidence of anything: a five-second-old
 * Sample cannot tell an operator the Link is healthy right now, so staleness
 * takes precedence over even a perfect reading. Thresholds live only here —
 * CONTEXT.md records this function as the only thing entitled to an opinion
 * about what "good" is.
 */
export const STALE_AFTER_MS = 5_000;

const UP_SNR_DB = 18;
const UP_THROUGHPUT_RATIO = 0.6;
const DEGRADED_SNR_DB = 10;
const DEGRADED_THROUGHPUT_RATIO = 0.2;

/**
 * Derives a Link's health from its most recent Telemetry Sample. Never
 * stored, never accepted from a client. `now` is always a parameter, so
 * nothing here reads a clock of its own.
 */
export function deriveStatus(
  link: StatusInput,
  latestSample: TelemetrySample | null,
  now: Date,
): LinkStatus {
  if (latestSample === null) {
    return { status: 'down', reason: 'stale' };
  }

  const ageMs = now.getTime() - new Date(latestSample.ts).getTime();

  if (ageMs >= STALE_AFTER_MS) {
    return { status: 'down', reason: 'stale' };
  }

  const { snrDb, throughputMbps } = latestSample;

  if (
    snrDb >= UP_SNR_DB &&
    throughputMbps >= UP_THROUGHPUT_RATIO * link.capacityMbps
  ) {
    return { status: 'up' };
  }

  if (
    snrDb >= DEGRADED_SNR_DB &&
    throughputMbps >= DEGRADED_THROUGHPUT_RATIO * link.capacityMbps
  ) {
    return { status: 'degraded' };
  }

  return { status: 'down', reason: 'metrics' };
}
