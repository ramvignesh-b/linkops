import { z } from 'zod';
import { REMEDIATIONS } from './triage-surface';

/**
 * What the Gemini Assistant is actually asked for — a judgement and the
 * words to explain it, never an A2UI document.
 *
 * The Surface itself is assembled by `triage-surface.ts`, the same builders
 * the deterministic stub uses, so every component reaches the Console with
 * the properties its renderer reads. That split is the whole design, and it
 * was arrived at the hard way: asking a model to author the document
 * produced three consecutive replies that were valid A2UI and blank on
 * screen — a `Text` with its content in `children`, `action` stubbed onto
 * every component, a node nothing referenced — and constraining it with a
 * per-component-type JSON Schema traded that for a request the Gemini
 * backend rejected outright. A model is good at deciding which Link is
 * worst and saying why; it is not the thing that should be laying out a
 * component tree that this repository can lay out perfectly by itself.
 *
 * Everything the model can get wrong here is a value this Server already
 * validates: an unknown `linkId` or `remediation` falls back to the stub's
 * own first choice rather than reaching an operator as an empty picker.
 */
export const geminiTriageSchema = z.object({
  /** The line at the top of the Card, in place of the stub's counted intro. */
  intro: z.string(),
  /** The Link this Assistant would look at first. */
  linkId: z.string(),
  /** Which Remediation to start the picker on. */
  remediation: z.string(),
  /** Why, in one sentence — shown on the confirmation Surface. */
  rationale: z.string(),
});

export type GeminiTriage = z.infer<typeof geminiTriageSchema>;

/**
 * The same shape as a JSON Schema, for Structured Outputs.
 *
 * Written by hand rather than through `.toJSONSchema()`, and deliberately
 * flat: one object, four string properties, one of them an `enum`. Zod
 * emits `$schema` and `minLength`, neither of which
 * `GenerateContentConfig#responseJsonSchema` supports, and a real call
 * answered `400 INVALID_ARGUMENT` for each. Bisecting that failure against
 * the live API also found `prefixItems` and `items` together — with a
 * `prefixItems` branch of more than one property — refused outright, which
 * is why nothing of the sort survives here. This shape uses only `type`,
 * `properties`, `required`, `enum` and `additionalProperties`, every one of
 * them exercised successfully against the real API.
 */
export const GEMINI_TRIAGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string' },
    linkId: { type: 'string' },
    remediation: {
      type: 'string',
      enum: REMEDIATIONS.map((remediation) => remediation.value),
    },
    rationale: { type: 'string' },
  },
  required: ['intro', 'linkId', 'remediation', 'rationale'],
  additionalProperties: false,
} as const;
