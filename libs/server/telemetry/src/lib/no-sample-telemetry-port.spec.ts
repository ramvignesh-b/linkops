import { toLinkId } from '@linkops/shared/domain';
import type { LinkRepository } from '@linkops/server/links-data-access';
import { NoSampleTelemetryPort } from './no-sample-telemetry-port';

/** A repository double reporting a fixed count, since only `count()` is read. */
function fakeRepository(count: number): LinkRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(() => []),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(() => count),
  };
}

describe('NoSampleTelemetryPort', () => {
  it('reports no Sample for any Link, because none has ever reported', () => {
    const port = new NoSampleTelemetryPort(fakeRepository(0));

    expect(port.latestSample(toLinkId('lnk_0001'))).toBeNull();
  });

  it('reports an empty map of latest Samples', () => {
    const port = new NoSampleTelemetryPort(fakeRepository(0));

    expect(port.latestSamples().size).toBe(0);
  });

  it('reports an empty history for any Link', () => {
    const port = new NoSampleTelemetryPort(fakeRepository(0));

    expect(port.history(toLinkId('lnk_0001'), 5 * 60 * 1000)).toEqual([]);
  });

  it('drops a Link as a no-op, since there is nothing to drop yet', () => {
    const port = new NoSampleTelemetryPort(fakeRepository(0));

    expect(() => port.dropLink(toLinkId('lnk_0001'))).not.toThrow();
  });

  describe('summary', () => {
    it('reports the real Roster size as the total, and every Link down', () => {
      const port = new NoSampleTelemetryPort(fakeRepository(10));

      expect(port.summary()).toEqual({
        total: 10,
        up: 0,
        degraded: 0,
        down: 10,
        totalThroughputMbps: 0,
        worstLinkId: null,
      });
    });

    it('reports an all-empty fleet honestly, rather than assuming ten', () => {
      const port = new NoSampleTelemetryPort(fakeRepository(0));

      expect(port.summary()).toEqual({
        total: 0,
        up: 0,
        degraded: 0,
        down: 0,
        totalThroughputMbps: 0,
        worstLinkId: null,
      });
    });

    it('reports no worst Link, since nothing has reported', () => {
      const port = new NoSampleTelemetryPort(fakeRepository(10));

      expect(port.summary().worstLinkId).toBeNull();
    });
  });
});
