import { z } from 'zod';

/**
 * Link ids are branded so a bare string cannot be passed where a Link id is
 * meant. Mbps, dBm and MHz scalars are deliberately left unbranded.
 */
export const linkIdSchema = z.string().min(1).brand<'LinkId'>();

export type LinkId = z.infer<typeof linkIdSchema>;

/** The one place a plain string becomes a LinkId, so the casts stay countable. */
export const toLinkId = (value: string): LinkId => linkIdSchema.parse(value);
