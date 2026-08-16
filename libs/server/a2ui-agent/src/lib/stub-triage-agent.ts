import {
  A2uiInvalidActionError,
  type A2uiActionRequest,
  type A2uiEnvelope,
  type A2uiRequest,
} from '@linkops/shared/a2ui-protocol';
import { withDerivedStatus, type Link } from '@linkops/shared/domain';
import type { LinkRepository } from '@linkops/server/links-data-access';
import type { Clock, TelemetryPort } from '@linkops/server/telemetry';
import type { A2uiAgent } from './a2ui-agent';
import {
  REMEDIATIONS,
  SURFACE_ID,
  confirmationSurface,
  quietSurface,
  triageSurface,
} from './triage-surface';

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

  respond(request: A2uiRequest): A2uiEnvelope {
    if (request.kind === 'act') {
      return this.answerAction(request);
    }

    const links = this.linksNeedingAttention();

    return {
      version: 'v1.0',
      createSurface: links.length === 0 ? quietSurface() : triageSurface(links),
    };
  }

  /**
   * The round trip's other half: the Link and Remediation the operator
   * chose, named back with the Sample the recommendation rests on.
   * Refused rather than improvised — per CONTEXT.md's Error Envelope entry —
   * when the Action names a Surface, Link or Remediation this stub does not
   * recognise, which `AgentUiController` maps onto `A2UI_INVALID_PAYLOAD`.
   */
  private answerAction(request: A2uiActionRequest): A2uiEnvelope {
    if (request.surfaceId !== SURFACE_ID) {
      throw new A2uiInvalidActionError(
        `the Assistant does not recognise Surface "${request.surfaceId}"`,
      );
    }

    const record = this.repository
      .findAll()
      .find((candidate) => candidate.id === request.data['linkId']);
    const remediation = REMEDIATIONS.find(
      (candidate) => candidate.value === request.data['remediation'],
    );

    if (record === undefined || remediation === undefined) {
      throw new A2uiInvalidActionError(
        'the Action names a Link or Remediation the Fleet does not have',
      );
    }

    const sample = this.telemetry.latestSample(record.id);
    const link = withDerivedStatus(record, sample, this.clock.now());

    return {
      version: 'v1.0',
      createSurface: confirmationSurface(link, remediation, sample),
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
