import { createZodDto } from 'nestjs-zod';
import { linkListQuerySchema } from '@linkops/shared/domain';

/**
 * `GET /api/links`'s query string. An unknown `sort` key or `dir` value fails
 * here, through the same globally registered pipe every body-carrying
 * endpoint uses — there is no second validation path for query parameters.
 */
export class LinkListQueryDto extends createZodDto(linkListQuerySchema) {}
