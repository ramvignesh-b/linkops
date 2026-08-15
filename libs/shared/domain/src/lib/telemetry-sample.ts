import { z } from 'zod';
import { linkIdSchema } from './ids';

/**
 * One set of readings for one Link at one instant, produced by the Simulator
 * at 1 Hz.
 */
export const telemetrySampleSchema = z.object({
  linkId: linkIdSchema,
  ts: z.iso.datetime(),
  rssiDbm: z.number().max(0),
  snrDb: z.number(),
  throughputMbps: z.number(),
});

export type TelemetrySample = z.infer<typeof telemetrySampleSchema>;
