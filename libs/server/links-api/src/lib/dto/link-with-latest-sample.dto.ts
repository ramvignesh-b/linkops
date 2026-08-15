import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { linkSchema, telemetrySampleSchema } from '@linkops/shared/domain';

/**
 * `GET /api/links/:id`'s body: the Link with its most recent Sample, `null`
 * until the Simulator lands. Composed here rather than in `shared/domain`
 * because this pairing is an API response shape, not a domain shape — no
 * other caller needs "a Link plus its latest Sample" as one value.
 */
export const linkWithLatestSampleSchema = z.object({
  link: linkSchema,
  latestSample: telemetrySampleSchema.nullable(),
});

export class LinkWithLatestSampleDto extends createZodDto(
  linkWithLatestSampleSchema,
) {}
