import type { Random } from './random';

/**
 * Per-Tick, per-Link odds of starting a Degradation Episode while healthy.
 * Fixed and low — visible often enough to demonstrate, rare enough that a
 * fleet does not read as permanently unstable.
 */
const START_PROBABILITY = 0.01;

/** A short multi-Tick range — long enough to be visible, short enough to stay an episode. */
const MIN_DURATION_TICKS = 8;
const MAX_DURATION_TICKS = 15;

/** State carried across Ticks while a Link is mid-episode. */
export interface DegradationEpisode {
  readonly remainingTicks: number;
}

/** `random()` is `[0, 1)`; this maps it onto the inclusive duration range. */
function pickDurationTicks(random: Random): number {
  const span = MAX_DURATION_TICKS - MIN_DURATION_TICKS + 1;

  return MIN_DURATION_TICKS + Math.floor(random() * span);
}

/**
 * Advances a Link's Degradation Episode by one Tick. `current` is `null`
 * when the Link is healthy. Draws from `random` only to decide whether a
 * healthy Link starts one — a Tick that neither starts nor is mid-episode
 * costs one draw, never more.
 */
export function stepEpisode(
  current: DegradationEpisode | null,
  random: Random,
): DegradationEpisode | null {
  if (current === null) {
    if (random() >= START_PROBABILITY) {
      return null;
    }

    return { remainingTicks: pickDurationTicks(random) };
  }

  const remainingTicks = current.remainingTicks - 1;

  return remainingTicks > 0 ? { remainingTicks } : null;
}
