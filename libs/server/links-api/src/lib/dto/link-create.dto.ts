import { createZodDto } from 'nestjs-zod';
import { linkCreateSchema } from '@linkops/shared/domain';

/**
 * Generated from `linkCreateSchema` rather than hand-written, so the DTO's
 * validation ranges cannot drift from the schema the Console validates
 * against. The first DTO in this API — every body-carrying endpoint after
 * it follows the same pattern.
 */
export class LinkCreateDto extends createZodDto(linkCreateSchema) {}
