import type { z } from 'zod';
import { linkSchema } from './link';

/**
 * The eight operator-editable fields, and nothing else. `status` is derived
 * and `version` is repository-owned, so both are excluded here rather than
 * accepted and ignored — `pick`ing from `linkSchema` means their validation
 * ranges track it by construction instead of by copy.
 */
export const linkCreateSchema = linkSchema.pick({
  name: true,
  siteA: true,
  siteB: true,
  band: true,
  mode: true,
  capacityMbps: true,
  txPowerDbm: true,
  channelWidthMhz: true,
});

export type LinkCreate = z.infer<typeof linkCreateSchema>;
