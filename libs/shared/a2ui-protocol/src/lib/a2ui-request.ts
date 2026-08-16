import { z } from 'zod';

/**
 * What the Console asks the Assistant for. A2UI describes the agent → client
 * direction and leaves client → agent to the application, so this shape is
 * ours. `kind` discriminates, so opening a conversation and acting within
 * one stay two shapes rather than one shape with everything optional.
 *
 * Today there is one member: opening a conversation. The Action carrying an
 * operator's choice back joins it when the round-trip is built.
 */
export const a2uiRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('open') }),
]);

export type A2uiRequest = z.infer<typeof a2uiRequestSchema>;
