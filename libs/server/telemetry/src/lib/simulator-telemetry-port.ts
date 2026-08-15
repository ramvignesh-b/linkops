import {
  deriveStatus,
  type FleetSummary,
  type LinkId,
  type TelemetrySample,
} from '@linkops/shared/domain';
import type { LinkRepository } from '@linkops/server/links-data-access';
import type { Clock } from './clock';
import { selectWorstLinkId } from './select-worst-link-id';
import type { TelemetryPort } from './telemetry-port';
import { type TelemetrySampleStore } from './telemetry-sample-store';

/**
 * The real `TelemetryPort`, backed by the Simulator's own
 * `TelemetrySampleStore` — replaces `NoSampleTelemetryPort` behind the
 * `TELEMETRY_PORT` token with no controller change. `repository` is read
 * only for the Roster `summary()` needs; every Sample-shaped read goes
 * through the store.
 */
export class SimulatorTelemetryPort implements TelemetryPort {
  constructor(
    private readonly repository: LinkRepository,
    private readonly store: TelemetrySampleStore,
    private readonly clock: Clock,
  ) {}

  latestSample(id: LinkId): TelemetrySample | null {
    return this.store.latestSample(id);
  }

  latestSamples(): ReadonlyMap<LinkId, TelemetrySample> {
    return this.store.latestSamples();
  }

  history(id: LinkId, windowMs: number): readonly TelemetrySample[] {
    return this.store.history(id, windowMs, this.clock.now());
  }

  /** Called after the repository delete, never before — see `TelemetryPort`. */
  dropLink(id: LinkId): void {
    this.store.dropLink(id);
  }

  summary(): FleetSummary {
    const links = this.repository.findAll();
    const now = this.clock.now();

    let up = 0;
    let degraded = 0;
    let down = 0;
    let totalThroughputMbps = 0;

    for (const link of links) {
      const sample = this.store.latestSample(link.id);
      const status = deriveStatus(link, sample, now);

      switch (status.status) {
        case 'up':
          up++;
          break;
        case 'degraded':
          degraded++;
          break;
        case 'down':
          down++;
          break;
      }

      if (sample !== null) totalThroughputMbps += sample.throughputMbps;
    }

    return {
      total: links.length,
      up,
      degraded,
      down,
      totalThroughputMbps,
      worstLinkId: selectWorstLinkId(this.store.latestSamples()),
    };
  }
}
