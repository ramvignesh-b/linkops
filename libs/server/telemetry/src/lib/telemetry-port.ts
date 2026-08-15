import type {
  FleetSummary,
  LinkId,
  TelemetrySample,
} from '@linkops/shared/domain';

/**
 * The read side of telemetry, drawn as an interface ahead of its real
 * implementation so `server/links-api` changes no controller when the
 * Simulator lands.
 */
export interface TelemetryPort {
  latestSample(id: LinkId): TelemetrySample | null;
  latestSamples(): ReadonlyMap<LinkId, TelemetrySample>;
  /**
   * Samples within `windowMs` of now, bounded by however much history the
   * implementation actually retains — never padded or fabricated to fill a
   * window wider than what's held. A request for more than the Simulator's
   * retention (`SAMPLE_BUFFER_CAPACITY` Ticks) silently returns less, the
   * same honest-degradation behaviour as an empty result for a Link that
   * has never reported.
   */
  history(id: LinkId, windowMs: number): readonly TelemetrySample[];
  summary(): FleetSummary;
  /**
   * Called after the repository delete, never before — Samples sit outside
   * the Link + version consistency boundary, and this is what takes them
   * with it so a ring buffer never survives its deleted Link.
   */
  dropLink(id: LinkId): void;
}
