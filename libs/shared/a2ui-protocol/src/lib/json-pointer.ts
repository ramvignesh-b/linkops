/**
 * The three segment names that reach an object's prototype chain. Refused on
 * reads as well as writes: a read through `constructor` is how a payload
 * gets hold of the prototype in the first place, so guarding only the write
 * side would leave the door open and look shut.
 */
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * A pointer's segments, or `null` when the pointer must not be followed.
 * Returning `null` rather than throwing is what lets a renderer degrade a
 * single binding instead of losing the Surface around it.
 */
function parsePointer(pointer: string): string[] | null {
  // RFC 6901 spells the whole document as the empty string; A2UI spells it
  // `/`, which RFC 6901 would read as the key `""`. A2UI's spelling wins,
  // since these pointers arrive in A2UI messages.
  if (pointer === '' || pointer === '/') return [];
  if (!pointer.startsWith('/')) return null;

  const segments = pointer
    .slice(1)
    .split('/')
    // The escapes are unwound after splitting, so an escaped slash cannot
    // introduce a segment boundary that was never in the pointer.
    // `split`/`join` rather than `replaceAll`, which needs a newer lib target
    // than the API app compiles against.
    .map((segment) => segment.split('~1').join('/').split('~0').join('~'));

  return segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))
    ? null
    : segments;
}

/** Steps one segment into an object, or gives up. */
function step(current: unknown, segment: string): unknown {
  if (current === null || typeof current !== 'object') return undefined;

  // Own properties only — the second half of the prototype guard, and what
  // stops `/toString` resolving to a function.
  return Object.prototype.hasOwnProperty.call(current, segment)
    ? (current as Record<string, unknown>)[segment]
    : undefined;
}

/**
 * Reads a JSON Pointer (RFC 6901) out of a Data Model.
 */
export function readPointer(document: unknown, pointer: string): unknown {
  const segments = parsePointer(pointer);
  if (segments === null) return undefined;

  let current = document;
  for (const segment of segments) {
    current = step(current, segment);
    if (current === undefined) return undefined;
  }

  return current;
}

/** Immutable set of the first segment, recursing for the rest. */
function setIn(target: unknown, segments: string[], value: unknown): unknown {
  const [head, ...rest] = segments;
  const descend = (existing: unknown): unknown =>
    rest.length === 0 ? value : setIn(existing, rest, value);

  if (Array.isArray(target)) {
    const index = Number(head);
    // An index that is not one leaves the array alone rather than growing it
    // a string key, which is the array turning quietly into an object.
    if (!Number.isInteger(index) || index < 0 || index >= target.length) {
      return target;
    }

    const items = [...target];
    items[index] = descend(target[index]);

    return items;
  }

  const copy: Record<string, unknown> =
    target !== null && typeof target === 'object'
      ? { ...(target as Record<string, unknown>) }
      : {};

  copy[head] = descend(copy[head]);

  return copy;
}

/**
 * Writes a value at a JSON Pointer, returning a new document rather than
 * touching the one it was given.
 */
export function writePointer<T>(
  document: T,
  pointer: string,
  value: unknown,
): T {
  const segments = parsePointer(pointer);
  if (segments === null) return document;
  // Root: `updateDataModel` without a path replaces the Data Model wholesale.
  if (segments.length === 0) return value as T;

  return setIn(document, segments, value) as T;
}
