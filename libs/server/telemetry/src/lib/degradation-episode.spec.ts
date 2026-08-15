import { stepEpisode } from './degradation-episode';
import type { Random } from './random';

/** Pops values in order, matching `simulate-next-sample.spec.ts`'s helper. */
function sequence(values: number[]): Random {
  let i = 0;
  return () => values[i++];
}

/** Fails the test if the countdown branch draws when it must not. */
const neverCalled: Random = () => {
  throw new Error('random() must not be called while an episode counts down');
};

describe('stepEpisode', () => {
  it('stays healthy when the Random draw is at or above the start probability', () => {
    const result = stepEpisode(null, () => 0.01);

    expect(result).toBeNull();
  });

  it('starts an episode when the draw is below the start probability, picking a duration from the next draw', () => {
    const result = stepEpisode(null, sequence([0, 0]));

    expect(result).not.toBeNull();
    expect(result?.remainingTicks).toBeGreaterThan(0);
  });

  it('picks the shortest duration in its range when the duration draw is at its floor', () => {
    const result = stepEpisode(null, sequence([0, 0]));

    expect(result).toEqual({ remainingTicks: 8 });
  });

  it('picks the longest duration in its range when the duration draw is at its near-ceiling', () => {
    const result = stepEpisode(null, sequence([0, 0.999]));

    expect(result).toEqual({ remainingTicks: 15 });
  });

  it('counts an active episode down by one Tick without drawing from random', () => {
    const result = stepEpisode({ remainingTicks: 3 }, neverCalled);

    expect(result).toEqual({ remainingTicks: 2 });
  });

  it('ends the episode — reverting to null — once the countdown reaches zero', () => {
    const result = stepEpisode({ remainingTicks: 1 }, neverCalled);

    expect(result).toBeNull();
  });
});
