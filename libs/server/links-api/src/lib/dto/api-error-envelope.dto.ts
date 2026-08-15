import { createZodDto } from 'nestjs-zod';
import { apiErrorEnvelopeSchema } from '@linkops/shared/domain';

/**
 * The one error shape every endpoint in this API can answer with — see
 * `apiErrorBodySchema` in `shared/domain` for the closed `code` union and
 * the message-is-diagnostic rule attached to it.
 */
export class ApiErrorEnvelopeDto extends createZodDto(apiErrorEnvelopeSchema) {}
