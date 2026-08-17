import { withDerivedStatus, type Link } from '@linkops/shared/domain';
import type { LinkRepository } from '@linkops/server/links-data-access';
import type { TelemetryPort } from '@linkops/server/telemetry';

/**
 * A Link worth suggesting a remediation for: one whose Telemetry Samples are
 * bad.
 *
 * `down` for want of data is excluded on purpose. Every remediation this
 * Assistant offers is a change to radio configuration judged against
 * Telemetry Samples, and a Link that has reported nothing has none to judge
 * — that is a Link to go and look at, not one to reconfigure.
 */
export function needsAttention(link: Link): boolean {
  return (
    link.status.status === 'degraded' ||
    (link.status.status === 'down' && link.status.reason === 'metrics')
  );
}

/**
 * The Links worth telling an agent about, and the only ones any agent behind
 * this endpoint reads. Status comes from the shared presenter every other
 * surface reads it through, so no agent can disagree with the Fleet list
 * about which Links are in trouble — and a model client never receives a
 * healthy Link's Telemetry Samples as context it did not need.
 */
export function linksNeedingAttention(
  repository: LinkRepository,
  telemetry: TelemetryPort,
  now: Date,
): Link[] {
  return repository
    .findAll()
    .map((record) =>
      withDerivedStatus(record, telemetry.latestSample(record.id), now),
    )
    .filter(needsAttention);
}
