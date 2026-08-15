import { z } from 'zod';
import { bandSchema } from './link';
import { linkStatusKindSchema } from './link-status';

/** The four sort keys `GET /api/links` accepts, `name asc` the default. */
export const linkSortKeySchema = z.enum([
  'name',
  'capacityMbps',
  'status',
  'throughputMbps',
]);
export type LinkSortKey = z.infer<typeof linkSortKeySchema>;

export const sortDirSchema = z.enum(['asc', 'desc']);
export type SortDir = z.infer<typeof sortDirSchema>;

/**
 * `GET /api/links`'s query string. `status`, `band` and `q` are filters, each
 * absent meaning "don't filter on this"; `sort` and `dir` always resolve to a
 * concrete value, so a caller never has to ask "what does absent mean" for
 * ordering the way it does for filtering.
 */
export const linkListQuerySchema = z.object({
  status: linkStatusKindSchema.optional(),
  band: bandSchema.optional(),
  /** Free-text search across name, siteA and siteB, case-insensitive. */
  q: z.string().optional(),
  sort: linkSortKeySchema.default('name'),
  dir: sortDirSchema.default('asc'),
});

export type LinkListQuery = z.infer<typeof linkListQuerySchema>;
