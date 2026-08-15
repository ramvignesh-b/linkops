/**
 * The Simulator's only source of "now" — constructor-injected rather than a
 * direct `Date` call, so a test can freeze it under Vitest fake timers with
 * no sleeps.
 */
export interface Clock {
  now(): Date;
}

/** The real clock, wired in production only — every test injects its own. */
export const systemClock: Clock = {
  now: () => new Date(),
};
