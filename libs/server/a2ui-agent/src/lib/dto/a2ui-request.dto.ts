import { createZodDto } from 'nestjs-zod';
import { a2uiRequestSchema } from '@linkops/shared/a2ui-protocol';

/**
 * Generated from the shared request schema, so what the endpoint validates
 * and what the Console sends cannot drift apart — the same rule every
 * body-carrying endpoint in this API already follows.
 */
export class A2uiRequestDto extends createZodDto(a2uiRequestSchema) {}
