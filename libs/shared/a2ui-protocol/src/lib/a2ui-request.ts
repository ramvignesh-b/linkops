import { z } from 'zod';

/**
 * The Action an operator's use of a Surface sends back: the Surface it came
 * from, the component that raised it, the event name, and the Data Model
 * values that event carries — see CONTEXT.md's Action entry, word for word.
 * `data` is a record rather than the shape of any one agent's Data Model,
 * because the request schema does not know which agent will answer it.
 */
export const a2uiActionRequestSchema = z.strictObject({
  kind: z.literal('act'),
  surfaceId: z.string().min(1),
  componentId: z.string().min(1),
  event: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

export type A2uiActionRequest = z.infer<typeof a2uiActionRequestSchema>;

/**
 * What the Console asks the Assistant for. A2UI describes the agent → client
 * direction and leaves client → agent to the application, so this shape is
 * ours. `kind` discriminates, so opening a conversation and acting within
 * one stay two shapes rather than one shape with everything optional.
 */
export const a2uiRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('open') }),
  a2uiActionRequestSchema,
]);

export type A2uiRequest = z.infer<typeof a2uiRequestSchema>;
