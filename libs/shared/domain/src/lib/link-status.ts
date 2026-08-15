import { z } from 'zod';

/**
 * A Link's health at a moment: `up`, `degraded`, or `down` carrying a
 * `reason` — `stale` (no telemetry) versus `metrics` (poor signal). The two
 * reasons are different things to an operator, so the wire keeps them apart.
 */
export const linkStatusSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('up') }),
  z.strictObject({ status: z.literal('degraded') }),
  z.strictObject({
    status: z.literal('down'),
    reason: z.enum(['stale', 'metrics']),
  }),
]);

export type LinkStatus = z.infer<typeof linkStatusSchema>;

/**
 * The `status` kind alone, with no `reason` — what a filter or a sort key
 * compares against. `linkStatusSchema` stays the wire shape for a Link
 * itself; this is `linkStatusSchema`'s discriminant lifted out for reuse.
 */
export const linkStatusKindSchema = z.enum(['up', 'degraded', 'down']);
export type LinkStatusKind = z.infer<typeof linkStatusKindSchema>;
