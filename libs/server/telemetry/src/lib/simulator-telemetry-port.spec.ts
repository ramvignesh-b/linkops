import { toLinkId } from '@linkops/shared/domain';
import type {
  LinkRecord,
  LinkRepository,
} from '@linkops/server/links-data-access';
import type { TelemetrySample } from '@linkops/shared/domain';
import { link } from './link-record.fixture';
import { SimulatorTelemetryPort } from './simulator-telemetry-port';
import { TelemetrySampleStore } from './telemetry-sample-store';
import type { Clock } from './clock';

function sample(overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    linkId: toLinkId('lnk_0001'),
    ts: '2026-01-01T00:00:00.000Z',
    rssiDbm: -50,
    snrDb: 25,
    throughputMbps: 250,
    ...overrides,
  };
}

function fakeRepository(links: LinkRecord[]): LinkRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(() => links),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(() => links.length),
  };
}

const clockAt = (iso: string): Clock => ({ now: () => new Date(iso) });

describe('SimulatorTelemetryPort', () => {
  it('reports the store’s latest Sample for a Link', () => {
    const store = new TelemetrySampleStore(300);
    store.push(sample());
    const port = new SimulatorTelemetryPort(
      fakeRepository([link()]),
      store,
      clockAt('2026-01-01T00:00:00.000Z'),
    );

    expect(port.latestSample(toLinkId('lnk_0001'))).toEqual(sample());
  });

  it('reports null for a Link with no Sample yet', () => {
    const store = new TelemetrySampleStore(300);
    const port = new SimulatorTelemetryPort(
      fakeRepository([link()]),
      store,
      clockAt('2026-01-01T00:00:00.000Z'),
    );

    expect(port.latestSample(toLinkId('lnk_0001'))).toBeNull();
  });

  it('reports the store’s map of latest Samples', () => {
    const store = new TelemetrySampleStore(300);
    store.push(sample());
    const port = new SimulatorTelemetryPort(
      fakeRepository([link()]),
      store,
      clockAt('2026-01-01T00:00:00.000Z'),
    );

    expect(port.latestSamples().get(toLinkId('lnk_0001'))).toEqual(sample());
  });

  it('reports history within the window, using the injected Clock as now', () => {
    const store = new TelemetrySampleStore(300);
    store.push(sample({ ts: '2026-01-01T00:00:00.000Z' })); // 6m old — outside
    store.push(sample({ ts: '2026-01-01T00:05:30.000Z' })); // 30s old — inside
    const port = new SimulatorTelemetryPort(
      fakeRepository([link()]),
      store,
      clockAt('2026-01-01T00:06:00.000Z'),
    );

    expect(port.history(toLinkId('lnk_0001'), 60_000)).toEqual([
      sample({ ts: '2026-01-01T00:05:30.000Z' }),
    ]);
  });

  it('drops the Link’s buffer via the store', () => {
    const store = new TelemetrySampleStore(300);
    store.push(sample());
    const port = new SimulatorTelemetryPort(
      fakeRepository([link()]),
      store,
      clockAt('2026-01-01T00:00:00.000Z'),
    );

    port.dropLink(toLinkId('lnk_0001'));

    expect(store.latestSample(toLinkId('lnk_0001'))).toBeNull();
  });

  describe('summary', () => {
    it('reports the real Roster size as total, honestly, for an empty fleet', () => {
      const store = new TelemetrySampleStore(300);
      const port = new SimulatorTelemetryPort(
        fakeRepository([]),
        store,
        clockAt('2026-01-01T00:00:00.000Z'),
      );

      expect(port.summary()).toEqual({
        total: 0,
        up: 0,
        degraded: 0,
        down: 0,
        totalThroughputMbps: 0,
        worstLinkId: null,
      });
    });

    it('derives up/degraded/down per Link from deriveStatus, using the injected Clock as now', () => {
      const up = link({ id: toLinkId('lnk_0001'), capacityMbps: 100 });
      const neverReported = link({
        id: toLinkId('lnk_0002'),
        capacityMbps: 100,
      });
      const store = new TelemetrySampleStore(300);
      store.push(
        sample({
          linkId: up.id,
          ts: '2026-01-01T00:00:00.000Z',
          snrDb: 25,
          throughputMbps: 90,
        }),
      );
      const port = new SimulatorTelemetryPort(
        fakeRepository([up, neverReported]),
        store,
        clockAt('2026-01-01T00:00:00.000Z'),
      );

      const result = port.summary();

      expect(result.total).toBe(2);
      expect(result.up).toBe(1);
      expect(result.degraded).toBe(0);
      expect(result.down).toBe(1); // never-reported Link is down: stale
    });

    it('sums totalThroughputMbps only over Links that have a Sample', () => {
      const reported = link({ id: toLinkId('lnk_0001') });
      const neverReported = link({ id: toLinkId('lnk_0002') });
      const store = new TelemetrySampleStore(300);
      store.push(sample({ linkId: reported.id, throughputMbps: 120 }));
      const port = new SimulatorTelemetryPort(
        fakeRepository([reported, neverReported]),
        store,
        clockAt('2026-01-01T00:00:00.000Z'),
      );

      expect(port.summary().totalThroughputMbps).toBe(120);
    });

    it('reports worstLinkId as the lowest snrDb among Links with a Sample', () => {
      const worse = link({ id: toLinkId('lnk_0001') });
      const better = link({ id: toLinkId('lnk_0002') });
      const store = new TelemetrySampleStore(300);
      store.push(sample({ linkId: worse.id, snrDb: 5 }));
      store.push(sample({ linkId: better.id, snrDb: 20 }));
      const port = new SimulatorTelemetryPort(
        fakeRepository([worse, better]),
        store,
        clockAt('2026-01-01T00:00:00.000Z'),
      );

      expect(port.summary().worstLinkId).toBe(worse.id);
    });

    it('reports worstLinkId as null when nothing has reported', () => {
      const store = new TelemetrySampleStore(300);
      const port = new SimulatorTelemetryPort(
        fakeRepository([link()]),
        store,
        clockAt('2026-01-01T00:00:00.000Z'),
      );

      expect(port.summary().worstLinkId).toBeNull();
    });
  });
});
