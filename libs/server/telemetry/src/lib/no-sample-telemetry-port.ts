import type {
  FleetSummary,
  LinkId,
  TelemetrySample,
} from '@linkops/shared/domain';
import type { LinkRepository } from '@linkops/server/links-data-access';
import { selectWorstLinkId } from './select-worst-link-id';
import type { TelemetryPort } from './telemetry-port';

/**
 * Not a placeholder for correct behaviour — this *is* the correct behaviour
 * for a fleet that has never produced a Sample. The Simulator replaces this
 * implementation without changing any controller.
 *
 * `summary()` still needs the real Roster size to report an honest `total`
 * and `down` — a fleet of ten reads `down: 10`, not `down: 0` — so this is
 * the one place `server/telemetry` reads `LinkRepository`, permitted by the
 * layer rule since both are `type:data-access`. Nothing above it, in
 * `server/links-api`, ever reads the repository for telemetry or the port
 * for the Roster; this dependency stays inside the port's own construction.
 */
export class NoSampleTelemetryPort implements TelemetryPort {
  constructor(private readonly repository: LinkRepository) {}

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
    const total = this.repository.count();

    return {
      total,
      up: 0,
      degraded: 0,
      down: total,
      totalThroughputMbps: 0,
      worstLinkId: selectWorstLinkId(this.latestSamples()),
    };
  }

  dropLink(_id: LinkId): void {
    // No-op: this implementation holds no Samples to drop.
  }
}
