import { summarize, TickCostTracker } from './tick-cost-tracker';

describe('summarize', () => {
  it('picks the median and the 95th percentile by nearest rank', () => {
    const oneToHundred = Array.from({ length: 100 }, (_, i) => i + 1);

    expect(summarize(oneToHundred)).toEqual({ median: 50, p95: 95 });
  });

  it('sorts before ranking, so input order does not matter', () => {
    expect(summarize([3, 1, 2])).toEqual(summarize([1, 2, 3]));
  });

  it('does not mutate the array it is given', () => {
    const durations = [3, 1, 2];

    summarize(durations);

    expect(durations).toEqual([3, 1, 2]);
  });

  it('reports the single value for a window of one', () => {
    expect(summarize([5])).toEqual({ median: 5, p95: 5 });
  });
});

describe('TickCostTracker', () => {
  it('reports nothing before sixty Ticks arrive', () => {
    const tracker = new TickCostTracker();

    for (let i = 0; i < 59; i++) {
      expect(tracker.record(1)).toBeNull();
    }
  });

  it('reports the median and p95 exactly once, on the sixtieth Tick', () => {
    const tracker = new TickCostTracker();
    const durations = Array.from({ length: 60 }, (_, i) => i + 1); // 1..60

    let last: ReturnType<TickCostTracker['record']> = null;
    for (const duration of durations) {
      last = tracker.record(duration);
    }

    expect(last).toEqual({ median: 30, p95: 57 });

    // A sixty-first Tick does not report again — the window is sixty
    // Ticks, not a running one.
    expect(tracker.record(999)).toBeNull();
  });
});
