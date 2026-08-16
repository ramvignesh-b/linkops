import { createZodDto } from 'nestjs-zod';
import { a2uiRequestSchema } from '@linkops/shared/a2ui-protocol';

/**
 * Generated from the shared request schema, so what the endpoint validates
 * and what the Console sends cannot drift apart — the same rule every
 * body-carrying endpoint in this API already follows.
 *
 * A `const` rather than `class ... extends createZodDto(...) {}`: with two
 * members in the union — opening a conversation and an Action — its
 * inferred type is a real union, and TypeScript refuses to extend a
 * constructor whose return type is one. Declaration-merged with its own
 * type, the same shape every other DTO in this API has.
 *
 * The class `createZodDto` returns is always literally named
 * `AugmentedZodDto` — `class Foo extends createZodDto(...) {}` only reads
 * right because `Foo` is a real subclass with its own name. Renamed here for
 * the same reason: the OpenAPI document keys this schema by class name, and
 * `AugmentedZodDto` would document nothing.
 */
export const A2uiRequestDto = createZodDto(a2uiRequestSchema);
Object.defineProperty(A2uiRequestDto, 'name', { value: 'A2uiRequestDto' });
export type A2uiRequestDto = InstanceType<typeof A2uiRequestDto>;
