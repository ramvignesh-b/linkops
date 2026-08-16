/** The median and 95th percentile of a set of durations, in milliseconds. */
export interface TickCostStats {
  readonly median: number;
  readonly p95: number;
}

const WINDOW_TICKS = 60;

/**
 * The value at rank `p` percent into `sorted`, by nearest rank — the same
 * method for both figures this reports, rather than an interpolated median
 * disagreeing with a nearest-rank p95 about what "middle" means.
 */
function nearestRank(sorted: readonly number[], p: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index is clamped to [0, length - 1] above, and summarize() never calls this on an empty array.
  return sorted[index]!;
}

/** Median and p95 of `durationsMs`, by nearest rank. Does not mutate its argument. */
export function summarize(durationsMs: readonly number[]): TickCostStats {
  const sorted = [...durationsMs].sort((a, b) => a - b);

  return { median: nearestRank(sorted, 50), p95: nearestRank(sorted, 95) };
}

/**
 * Collects the cost of a per-Tick store apply, in milliseconds, over a
 * window of sixty Ticks — one minute of streaming at the Server's
 * one-second Tick. `record()` returns the window's median and p95 the
 * instant it fills, and `null` on every call before and after: the number
 * this ticket asks for is one measurement, not a running counter.
 */
export class TickCostTracker {
  private readonly durationsMs: number[] = [];
  private reported = false;

  record(durationMs: number): TickCostStats | null {
    if (this.reported) {
      return null;
    }

    this.durationsMs.push(durationMs);

    if (this.durationsMs.length < WINDOW_TICKS) {
      return null;
    }

    this.reported = true;

    return summarize(this.durationsMs);
  }
}
