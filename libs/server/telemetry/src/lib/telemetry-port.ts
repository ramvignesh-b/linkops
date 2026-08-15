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
  history(id: LinkId, windowMs: number): readonly TelemetrySample[];
  summary(): FleetSummary;
  /**
   * Called after the repository delete, never before — Samples sit outside
   * the Link + version consistency boundary, and this is what takes them
   * with it so a ring buffer never survives its deleted Link.
   */
  dropLink(id: LinkId): void;
}
