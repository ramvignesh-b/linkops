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
