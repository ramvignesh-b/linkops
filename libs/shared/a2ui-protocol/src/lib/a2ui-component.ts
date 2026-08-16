import { z } from 'zod';

/**
 * The component types the Console renders, and the whole of the whitelist.
 * A payload naming anything else is still a valid A2UI document — it is the
 * registry, not the schema, that refuses it, by rendering a labelled
 * fallback. That split is deliberate: validating `component` against this
 * list would turn one unknown node into a rejected Surface, and graceful
 * degradation is the property being built.
 */
export const A2UI_COMPONENT_TYPES = [
  'Surface',
  'Card',
  'Text',
  'Button',
  'Select',
  'Metric',
] as const;

export type A2uiComponentType = (typeof A2UI_COMPONENT_TYPES)[number];

/**
 * How deep a component tree may nest, and how many components a Surface may
 * hold in total. Both sit roughly an order of magnitude above the largest
 * Surface this Server authors — a triage offer is four levels and about a
 * dozen components — so they can only fire on a payload that is broken or
 * hostile. Exported constants rather than numbers written twice, because a
 * cap that disagrees with itself is not a cap.
 */
export const A2UI_MAX_DEPTH = 10;
export const A2UI_MAX_COMPONENTS = 100;

/**
 * A property value bound to the Data Model rather than written literally:
 * `{ "text": { "path": "/linkName" } }`. Resolved through the guarded
 * pointer reader, never by indexing the Data Model directly.
 */
export const a2uiBindingSchema = z.object({ path: z.string() });

export type A2uiBinding = z.infer<typeof a2uiBindingSchema>;

/**
 * What a Button raises. The event's `context` travels back with the Action,
 * so the agent learns what the operator chose without the Console having to
 * understand any of it.
 */
export const a2uiActionSchema = z.object({
  event: z.object({
    name: z.string().min(1),
    context: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type A2uiAction = z.infer<typeof a2uiActionSchema>;

/**
 * One node of a Surface. Components are a flat list referencing their
 * children by id, which is what keeps a message small — and what makes a
 * cycle expressible, so the renderer tracks ids along the path.
 *
 * Type-specific properties sit alongside the structural fields rather than
 * under a `properties` key, which is how A2UI v1.0 writes them; the schema
 * accepts them without knowing them, because each component type reads its
 * own as it renders.
 */
export const a2uiComponentSchema = z
  .object({
    id: z.string().min(1),
    component: z.string().min(1),
    /** The single child of a container that holds exactly one. */
    child: z.string().optional(),
    children: z.array(z.string()).optional(),
    action: a2uiActionSchema.optional(),
  })
  .catchall(z.unknown());

export type A2uiComponent = z.infer<typeof a2uiComponentSchema>;
