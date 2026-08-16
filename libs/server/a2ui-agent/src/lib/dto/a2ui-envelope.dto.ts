import { createZodDto } from 'nestjs-zod';
import { a2uiEnvelopeShapeSchema } from '@linkops/shared/a2ui-protocol';

/**
 * The reply, described in the OpenAPI document by the same schema the
 * Console validates it with before rendering it — the shape half of it,
 * since a refinement has no OpenAPI expression. "Exactly one message" is
 * written in the schema's description rather than lost.
 */
export class A2uiEnvelopeDto extends createZodDto(
  a2uiEnvelopeShapeSchema.describe(
    'An A2UI message envelope. Exactly one of `createSurface` or `updateDataModel` is present.',
  ),
) {}
