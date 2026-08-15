import { createZodDto } from 'nestjs-zod';
import { linkPatchSchema } from '@linkops/shared/domain';

/**
 * The required `version` is the schema's job, not the controller's — a body
 * that names no version fails validation before any handler runs, so there is
 * no code path in which an edit lands without a compare-and-swap.
 */
export class LinkPatchDto extends createZodDto(linkPatchSchema) {}
