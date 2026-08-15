import { toLinkId } from '@linkops/shared/domain';
import { NoSampleTelemetryPort } from './no-sample-telemetry-port';

describe('NoSampleTelemetryPort', () => {
  it('reports no Sample for any Link, because none has ever reported', () => {
    const port = new NoSampleTelemetryPort();

    expect(port.latestSample(toLinkId('lnk_0001'))).toBeNull();
  });

  it('reports an empty map of latest Samples', () => {
    const port = new NoSampleTelemetryPort();

    expect(port.latestSamples().size).toBe(0);
  });

  it('reports an empty history for any Link', () => {
    const port = new NoSampleTelemetryPort();

    expect(port.history(toLinkId('lnk_0001'), 5 * 60 * 1000)).toEqual([]);
  });

  it('reports no worst Link in the Summary, since nothing has reported', () => {
    const port = new NoSampleTelemetryPort();

    expect(port.summary().worstLinkId).toBeNull();
  });

  it('drops a Link as a no-op, since there is nothing to drop yet', () => {
    const port = new NoSampleTelemetryPort();

    expect(() => port.dropLink(toLinkId('lnk_0001'))).not.toThrow();
  });
});
