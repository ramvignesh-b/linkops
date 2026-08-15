import { z } from 'zod';
import { linkIdSchema } from './ids';

/**
 * The aggregate counts and totals across the Fleet, computed on the server and
 * recomputed every Tick. Never a source of membership — a Link's absence from
 * a Summary means nothing.
 */
export const fleetSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  up: z.number().int().nonnegative(),
  degraded: z.number().int().nonnegative(),
  down: z.number().int().nonnegative(),
  totalThroughputMbps: z.number().nonnegative(),
  worstLinkId: z.union([linkIdSchema, z.null()]),
});

export type FleetSummary = z.infer<typeof fleetSummarySchema>;
