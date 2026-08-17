import { GoogleGenAI } from '@google/genai';
import { Logger } from '@nestjs/common';
import {
  A2uiInvalidActionError,
  type A2uiActionRequest,
  type A2uiEnvelope,
  type A2uiRequest,
} from '@linkops/shared/a2ui-protocol';
import { withDerivedStatus, type Link } from '@linkops/shared/domain';
import { DEFAULT_GEMINI_MODEL } from '@linkops/server/config';
import type { LinkRepository } from '@linkops/server/links-data-access';
import type { Clock, TelemetryPort } from '@linkops/server/telemetry';
import type { A2uiAgent } from './a2ui-agent';
import {
  GEMINI_TRIAGE_JSON_SCHEMA,
  geminiTriageSchema,
  type GeminiTriage,
} from './gemini-triage-schema';
import { linksNeedingAttention } from './needs-attention';
import {
  REMEDIATIONS,
  SURFACE_ID,
  confirmationSurface,
  quietSurface,
  triageSurface,
} from './triage-surface';

const SYSTEM_PROMPT = `You are the Assistant behind a triage helper for a fleet of point-to-point radio links.

You are given the Links whose telemetry samples currently need attention. Decide which one an operator should look at first, and which configuration change is worth considering for it.

You answer with judgement and words only. You never describe a screen, a layout or a component — the console builds its own.

- "intro": one sentence naming how many Links need attention and what stands out. This is the line an operator reads first.
- "linkId": the id of the Link to look at first, copied exactly from the Links given to you.
- "remediation": which change to consider, as one of these values:
${REMEDIATIONS.map((remediation) => `  - ${remediation.value}: ${remediation.label}`).join('\n')}
- "rationale": one sentence saying why that change suits that Link's readings.

Ground every SNR or Throughput figure you mention in the Links given to you; never invent one. You recommend and never apply — a remediation is advice about a change, never the change itself.`;

/** A Link's context, as it is worth telling a model client about. */
interface LinkContext {
  id: string;
  name: string;
  band: string;
  capacityMbps: number;
  status: Link['status'];
  snrDb: number | null;
  throughputMbps: number | null;
}

/**
 * What the model is told about the Fleet, and no more: the Links needing
 * attention, flattened to the readings a recommendation actually rests on.
 * Never the whole Roster — a Link this repository's own presenter does not
 * consider degraded is not context a third-party model needs.
 */
function linkContexts(
  links: readonly Link[],
  telemetry: TelemetryPort,
): LinkContext[] {
  return links.map((link) => {
    const sample = telemetry.latestSample(link.id);

    return {
      id: link.id,
      name: link.name,
      band: link.band,
      capacityMbps: link.capacityMbps,
      status: link.status,
      snrDb: sample?.snrDb ?? null,
      throughputMbps: sample?.throughputMbps ?? null,
    };
  });
}

/**
 * The Assistant behind `ASSISTANT_PROVIDER=gemini`: a real model client
 * behind the same one-method seam the stub implements.
 *
 * The model decides *what to recommend and how to say it*; this library
 * decides *what the Surface looks like*, through the very builders the stub
 * uses. Neither half can produce the failure the other used to — a blank
 * Card cannot come back from a Surface this code assembled, and a
 * recommendation cannot be invented by code that has no opinion.
 *
 * Stateless like the stub: every call re-reads the Roster and Telemetry
 * fresh and carries no memory of a prior turn, so a network client never has
 * to be trusted to remember one. An `open` request against a Fleet with
 * nothing degraded never reaches the model at all — there is no judgement to
 * make over zero Links.
 */
export class GeminiAgent implements A2uiAgent {
  private readonly client: GoogleGenAI;
  private readonly logger = new Logger(GeminiAgent.name);

  constructor(
    private readonly repository: LinkRepository,
    private readonly telemetry: TelemetryPort,
    private readonly clock: Clock,
    apiKey: string,
    private readonly model = DEFAULT_GEMINI_MODEL,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async respond(request: A2uiRequest): Promise<A2uiEnvelope> {
    const links = linksNeedingAttention(
      this.repository,
      this.telemetry,
      this.clock.now(),
    );

    if (links.length === 0 && request.kind === 'open') {
      return { version: 'v1.0', createSurface: quietSurface() };
    }

    if (request.kind === 'act') {
      return await this.answerAction(request, links);
    }

    const triage = await this.triage(links);

    return {
      version: 'v1.0',
      createSurface: triageSurface(links, {
        intro: triage.intro,
        linkId: triage.linkId,
        remediation: triage.remediation,
      }),
    };
  }

  /**
   * The round trip's other half. The Link and Remediation are the
   * operator's, not the model's — refused rather than improvised when the
   * Action names something the Fleet does not have, exactly as the stub
   * refuses it — and the model is asked only for the sentence explaining
   * the pairing.
   */
  private async answerAction(
    request: A2uiActionRequest,
    links: readonly Link[],
  ): Promise<A2uiEnvelope> {
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
    const triage = await this.triage(links.length === 0 ? [link] : links, {
      linkId: record.id,
      remediation: remediation.value,
    });

    return {
      version: 'v1.0',
      createSurface: confirmationSurface(
        link,
        remediation,
        sample,
        triage.rationale,
      ),
    };
  }

  /**
   * The one call this agent makes. Everything the model returns is a value
   * this Server can check, and `triageSurface` falls back to the stub's own
   * first choice for anything it does not recognise — so a model answering
   * badly costs an operator a worse recommendation, never a blank panel.
   */
  private async triage(
    links: readonly Link[],
    chosen?: { linkId: string; remediation: string },
  ): Promise<GeminiTriage> {
    const context = {
      links: linkContexts(links, this.telemetry),
      ...(chosen ? { operatorChose: chosen } : {}),
    };

    const response = await this.generate(JSON.stringify(context));

    if (!response) {
      throw new Error('the Gemini model answered with no text to parse');
    }

    return geminiTriageSchema.parse(JSON.parse(response));
  }

  /**
   * The network edge, wrapped so a refusal is diagnosable. `@google/genai`
   * reports a rejected request as `400 INVALID_ARGUMENT` and nothing else —
   * no field, no reason — so the model name and the exact schema sent are
   * logged here rather than left for someone to reconstruct from a stack
   * trace that names neither.
   */
  private async generate(contents: string): Promise<string | undefined> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: GEMINI_TRIAGE_JSON_SCHEMA,
        },
      });

      return response.text;
    } catch (error) {
      this.logger.error(
        `Gemini refused the request — model="${this.model}", schema=${JSON.stringify(
          GEMINI_TRIAGE_JSON_SCHEMA,
        )}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
