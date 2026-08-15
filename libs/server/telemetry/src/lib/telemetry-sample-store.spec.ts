import { toLinkId } from '@linkops/shared/domain';
import type { TelemetrySample } from '@linkops/shared/domain';
import { TelemetrySampleStore } from './telemetry-sample-store';

const sample = (overrides: Partial<TelemetrySample> = {}): TelemetrySample => ({
  linkId: toLinkId('lnk_0001'),
  ts: '2026-01-01T00:00:00.000Z',
  rssiDbm: -50,
  snrDb: 20,
  throughputMbps: 100,
  ...overrides,
});

describe('TelemetrySampleStore', () => {
  it('reports no latest Sample for a Link that has never been pushed', () => {
    const store = new TelemetrySampleStore(300);

    expect(store.latestSample(toLinkId('lnk_0001'))).toBeNull();
  });

  it('reports the most recently pushed Sample as latest', () => {
    const store = new TelemetrySampleStore(300);
    const id = toLinkId('lnk_0001');

    store.push(sample({ linkId: id, snrDb: 1 }));
    store.push(sample({ linkId: id, snrDb: 2 }));

    expect(store.latestSample(id)?.snrDb).toBe(2);
  });

  it('allocates a Link its buffer lazily, on its first push', () => {
    const store = new TelemetrySampleStore(300);
    const id = toLinkId('lnk_0001');

    expect(store.latestSamples().has(id)).toBe(false);

    store.push(sample({ linkId: id }));

    expect(store.latestSamples().has(id)).toBe(true);
  });

  it('keeps each Link on its own buffer', () => {
    const store = new TelemetrySampleStore(300);
    const a = toLinkId('lnk_0001');
    const b = toLinkId('lnk_0002');

    store.push(sample({ linkId: a, snrDb: 1 }));
    store.push(sample({ linkId: b, snrDb: 2 }));

    expect(store.latestSample(a)?.snrDb).toBe(1);
    expect(store.latestSample(b)?.snrDb).toBe(2);
  });

  describe('latestSamples', () => {
    it('reports the latest Sample per Link, not the whole history', () => {
      const store = new TelemetrySampleStore(300);
      const id = toLinkId('lnk_0001');

      store.push(sample({ linkId: id, snrDb: 1 }));
      store.push(sample({ linkId: id, snrDb: 2 }));

      expect(store.latestSamples().size).toBe(1);
      expect(store.latestSamples().get(id)?.snrDb).toBe(2);
    });
  });

  describe('history', () => {
    it('reports an empty array for a Link that has never been pushed', () => {
      const store = new TelemetrySampleStore(300);

      expect(store.history(toLinkId('lnk_0001'), 60_000, new Date())).toEqual(
        [],
      );
    });

    it('excludes Samples older than the window, keeping chronological order', () => {
      const store = new TelemetrySampleStore(300);
      const id = toLinkId('lnk_0001');
      const now = new Date('2026-01-01T00:05:00.000Z');

      store.push(
        sample({ linkId: id, ts: '2026-01-01T00:00:00.000Z' }), // 5m old — outside a 1m window
      );
      store.push(
        sample({ linkId: id, ts: '2026-01-01T00:04:30.000Z' }), // 30s old — inside
      );

      expect(store.history(id, 60_000, now)).toEqual([
        sample({ linkId: id, ts: '2026-01-01T00:04:30.000Z' }),
      ]);
    });

    it('caps each buffer at the injected capacity', () => {
      const store = new TelemetrySampleStore(2);
      const id = toLinkId('lnk_0001');

      store.push(sample({ linkId: id, ts: '2026-01-01T00:00:00.000Z' }));
      store.push(sample({ linkId: id, ts: '2026-01-01T00:00:01.000Z' }));
      store.push(sample({ linkId: id, ts: '2026-01-01T00:00:02.000Z' }));

      expect(
        store.history(id, Infinity, new Date('2026-01-01T00:00:02.000Z')),
      ).toEqual([
        sample({ linkId: id, ts: '2026-01-01T00:00:01.000Z' }),
        sample({ linkId: id, ts: '2026-01-01T00:00:02.000Z' }),
      ]);
    });
  });

  describe('dropLink', () => {
    it('deletes the buffer outright, not leaving it for eviction', () => {
      const store = new TelemetrySampleStore(300);
      const id = toLinkId('lnk_0001');
      store.push(sample({ linkId: id }));

      store.dropLink(id);

      expect(store.latestSample(id)).toBeNull();
    });

    it('is a no-op for a Link that was never pushed', () => {
      const store = new TelemetrySampleStore(300);

      expect(() => store.dropLink(toLinkId('lnk_0001'))).not.toThrow();
    });

    it('reallocates a fresh, empty buffer if the Link is pushed to again', () => {
      const store = new TelemetrySampleStore(300);
      const id = toLinkId('lnk_0001');
      store.push(sample({ linkId: id, snrDb: 1 }));
      store.dropLink(id);

      store.push(sample({ linkId: id, snrDb: 2 }));

      expect(store.latestSample(id)?.snrDb).toBe(2);
      expect(store.history(id, Infinity, new Date()).length).toBe(1);
    });
  });
});
