import { z } from 'zod';
import { a2uiComponentSchema } from './a2ui-component';

/**
 * A whole Surface in one message: its components, and the Data Model their
 * bindings read from. The first component in the list is the root — A2UI
 * leaves the root implicit, and this is the reading recorded in the README's
 * conformance table.
 */
export const a2uiCreateSurfaceSchema = z.object({
  surfaceId: z.string().min(1),
  components: z.array(a2uiComponentSchema).min(1),
  dataModel: z.record(z.string(), z.unknown()).optional(),
});

export type A2uiCreateSurface = z.infer<typeof a2uiCreateSurfaceSchema>;

/**
 * A value written into an existing Surface's Data Model at a JSON Pointer.
 * It is in the schema before anything on the wire sends one, because the
 * Console's own controls write through the same guarded path — one write
 * path, whether the value came from an operator or from an agent.
 */
export const a2uiUpdateDataModelSchema = z.object({
  surfaceId: z.string().min(1),
  /** Absent means the whole Data Model, which A2UI spells `/`. */
  path: z.string().optional(),
  value: z.unknown(),
});

export type A2uiUpdateDataModel = z.infer<typeof a2uiUpdateDataModelSchema>;

/**
 * Every message this implementation accepts. An A2UI envelope carries the
 * version and exactly one message key, so these are strict objects: an
 * envelope carrying two messages is not one this Console will guess at.
 *
 * `updateComponents`, `deleteSurface`, `callRendererFunction` and
 * `agentFunctionResponse` are A2UI v1.0 messages that are deliberately not
 * implemented — the README's conformance table says which, and why.
 */
export const a2uiEnvelopeShapeSchema = z.strictObject({
  version: z.literal('v1.0'),
  createSurface: a2uiCreateSurfaceSchema.optional(),
  updateDataModel: a2uiUpdateDataModelSchema.optional(),
});

/**
 * The envelope as it is validated: the shape above, plus A2UI's rule that a
 * message carries exactly one of them. The rule is a refinement rather than
 * a union because `createZodDto` — which is how this schema reaches the
 * OpenAPI document without being written twice — needs an object to work
 * from. The shape is what the document describes; this is what the wire is
 * held to.
 */
export const a2uiEnvelopeSchema = a2uiEnvelopeShapeSchema.refine(
  (envelope) =>
    [envelope.createSurface, envelope.updateDataModel].filter(
      (message) => message !== undefined,
    ).length === 1,
  { message: 'an A2UI envelope carries exactly one message' },
);

export type A2uiEnvelope = z.infer<typeof a2uiEnvelopeSchema>;
