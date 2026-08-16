import type { A2uiEnvelope, A2uiRequest } from '@linkops/shared/a2ui-protocol';
import { withDerivedStatus, type Link } from '@linkops/shared/domain';
import type { LinkRepository } from '@linkops/server/links-data-access';
import type { Clock, TelemetryPort } from '@linkops/server/telemetry';
import type { A2uiAgent } from './a2ui-agent';
import { quietSurface, triageSurface } from './triage-surface';

/**
 * A Link worth suggesting a remediation for: one whose readings are bad.
 *
 * `down` for want of data is excluded on purpose. Every remediation this
 * Assistant offers is a change to radio configuration judged against
 * readings, and a Link that has reported nothing has no readings to judge —
 * that is a Link to go and look at, not one to reconfigure.
 */
function needsAttention(link: Link): boolean {
  return (
    link.status.status === 'degraded' ||
    (link.status.status === 'down' && link.status.reason === 'metrics')
  );
}

/**
 * The Assistant that ships: a pure function of its request and the Fleet as
 * it stands, with no clock of its own beyond the one injected, no
 * randomness, no network and no key.
 *
 * That is not a placeholder for a model. It is what makes the Assistant work
 * for someone who clones this repository, creates no `.env` and holds no
 * credentials — the configuration this will actually be run in.
 */
export class StubTriageAgent implements A2uiAgent {
  constructor(
    private readonly repository: LinkRepository,
    private readonly telemetry: TelemetryPort,
    private readonly clock: Clock,
  ) {}

  respond(_request: A2uiRequest): A2uiEnvelope {
    const links = this.linksNeedingAttention();

    return {
      version: 'v1.0',
      createSurface: links.length === 0 ? quietSurface() : triageSurface(links),
    };
  }

  /**
   * Status comes from the shared presenter every other surface reads it
   * through, so the Assistant cannot disagree with the Fleet list about
   * which Links are in trouble. No threshold appears in this library.
   */
  private linksNeedingAttention(): Link[] {
    const now = this.clock.now();

    return this.repository
      .findAll()
      .map((record) =>
        withDerivedStatus(record, this.telemetry.latestSample(record.id), now),
      )
      .filter(needsAttention);
  }
}
