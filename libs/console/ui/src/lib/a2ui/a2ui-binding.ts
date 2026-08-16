import { a2uiBindingSchema, readPointer } from '@linkops/shared/a2ui-protocol';

/**
 * A component property, as either a literal value or `{ "path": "/..." }`
 * bound to the Data Model — resolved through the guarded pointer reader, on
 * every read, because a read through `constructor` is how a payload reaches
 * the prototype chain in the first place. A forbidden or missing path renders
 * no value rather than throwing.
 */
export function resolveBinding(
  raw: unknown,
  dataModel: Record<string, unknown>,
): unknown {
  const binding = a2uiBindingSchema.safeParse(raw);

  return binding.success ? readPointer(dataModel, binding.data.path) : raw;
}

/** A resolved value read as a string, or `''` when it is not one — never `undefined` in the DOM. */
export function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The literal `{ path }` a bound property carries, or `null` if it is not bound — what a write needs to know where to write. */
export function bindingPathOf(raw: unknown): string | null {
  const binding = a2uiBindingSchema.safeParse(raw);

  return binding.success ? binding.data.path : null;
}
