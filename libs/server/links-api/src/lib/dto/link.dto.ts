import { createZodDto } from 'nestjs-zod';
import { linkSchema } from '@linkops/shared/domain';

/**
 * The Link as every read endpoint presents it — status derived, never
 * hand-described. The same `linkSchema` the domain and the create/patch DTOs
 * validate against also drives this response's documented shape.
 */
export class LinkDto extends createZodDto(linkSchema) {}
