import type { z } from 'zod';
import { linkSchema } from './link';
import { linkCreateSchema } from './link-create';

/**
 * Every editable field optional, `version` required. That asymmetry is the
 * whole optimistic-concurrency requirement expressed in a schema: an edit
 * that names no version cannot be represented, so it is rejected before any
 * controller sees it. `version` is taken from `linkSchema` rather than
 * restated, for the same reason `linkCreateSchema` picks its fields.
 */
export const linkPatchSchema = linkCreateSchema.partial().extend({
  version: linkSchema.shape.version,
});

export type LinkPatch = z.infer<typeof linkPatchSchema>;
