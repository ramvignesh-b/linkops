import { z } from 'zod';
import { linkSchema } from './link';
import { fieldIssueSchema } from './field-issue';

/**
 * Every failure this API — and the two slices after it — can produce. Closed
 * deliberately: there is no internal-error member, because synthesising an
 * envelope for an unrecognised failure would lie about where it came from.
 */
export const apiErrorCodeSchema = z.enum([
  'LINK_NOT_FOUND',
  'LINK_VERSION_CONFLICT',
  'LINK_NAME_TAKEN',
  'VALIDATION_FAILED',
  'A2UI_INVALID_PAYLOAD',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/**
 * `message` is diagnostic — for logs and API consumers, never for an
 * operator. The Console owns operator-facing copy, keyed off `code`, because
 * the Server does not know where an error lands. Stated here so the rule
 * reaches the OpenAPI document too, not only the README.
 */
const diagnosticMessageSchema = z
  .string()
  .describe(
    'Diagnostic detail for logs and API consumers — never render this to an operator. Clients should switch on `code` for user-facing copy.',
  );

/**
 * The one envelope body shape for every failure. The HTTP status carries the
 * class of failure, `code` carries the meaning, and `details` is typed per
 * `code` so a consumer reads `details.current` without a cast.
 */
export const apiErrorBodySchema = z.discriminatedUnion('code', [
  z.object({
    code: z.literal('LINK_NOT_FOUND'),
    message: diagnosticMessageSchema,
    details: z.object({ id: z.string() }),
  }),
  z.object({
    code: z.literal('LINK_VERSION_CONFLICT'),
    message: diagnosticMessageSchema,
    details: z.object({
      currentVersion: linkSchema.shape.version,
      current: linkSchema,
    }),
  }),
  z.object({
    code: z.literal('LINK_NAME_TAKEN'),
    message: diagnosticMessageSchema,
    details: z.object({ name: z.string() }),
  }),
  z.object({
    code: z.literal('VALIDATION_FAILED'),
    message: diagnosticMessageSchema,
    details: z.object({ issues: z.array(fieldIssueSchema) }),
  }),
  z.object({
    code: z.literal('A2UI_INVALID_PAYLOAD'),
    message: diagnosticMessageSchema,
    details: z.object({ reason: z.string() }),
  }),
]);

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

/** The one envelope shape every failure wears: `{ error: ApiErrorBody }`. */
export const apiErrorEnvelopeSchema = z.object({ error: apiErrorBodySchema });

export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;
