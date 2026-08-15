import type {
  FleetSummary,
  LinkId,
  TelemetrySample,
} from '@linkops/shared/domain';
import type { TelemetryPort } from './telemetry-port';

/**
 * Not a placeholder for correct behaviour — this *is* the correct behaviour
 * for a fleet that has never produced a Sample. The Simulator replaces this
 * implementation without changing any controller.
 */
export class NoSampleTelemetryPort implements TelemetryPort {
  latestSample(_id: LinkId): TelemetrySample | null {
    return null;
  }

  latestSamples(): ReadonlyMap<LinkId, TelemetrySample> {
    return new Map();
  }

  history(_id: LinkId, _windowMs: number): readonly TelemetrySample[] {
    return [];
  }

  summary(): FleetSummary {
    return {
      total: 0,
      up: 0,
      degraded: 0,
      down: 0,
      totalThroughputMbps: 0,
      worstLinkId: null,
    };
  }

  dropLink(_id: LinkId): void {
    // No-op: this implementation holds no Samples to drop.
  }
}
