import { z } from 'zod';
import { linkIdSchema } from './ids';
import { linkStatusSchema } from './link-status';

/** Higher bands carry more capacity over shorter distances and lose more to rain. */
export const bandSchema = z.enum(['5GHz', '5.8GHz', '11GHz', '24GHz']);
export type Band = z.infer<typeof bandSchema>;

/** The Link's topology: point-to-point, point-to-multipoint, site-to-site. */
export const modeSchema = z.enum(['PtP', 'PtMP', 'S2S']);
export type Mode = z.infer<typeof modeSchema>;

/** Wider channels carry more throughput and pick up more interference. */
export const channelWidthMhzSchema = z.union([
  z.literal(20),
  z.literal(40),
  z.literal(80),
]);
export type ChannelWidthMhz = z.infer<typeof channelWidthMhzSchema>;

export const linkSchema = z.object({
  id: linkIdSchema,
  name: z.string().trim().min(3).max(40),
  siteA: z.string().trim().min(1, 'Site A is required'),
  siteB: z.string().trim().min(1, 'Site B is required'),
  band: bandSchema,
  mode: modeSchema,
  capacityMbps: z.number().min(10).max(1000),
  txPowerDbm: z.number().min(-10).max(30),
  channelWidthMhz: channelWidthMhzSchema,
  status: linkStatusSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Link = z.infer<typeof linkSchema>;
