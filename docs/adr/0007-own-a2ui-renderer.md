# 7. Our own A2UI renderer, not `@a2ui/angular`

## Status

Accepted.

## Decision

The A2UI panel is rendered by a component registry we own — a `Map<string, Type<unknown>>` over our own components — built against the [A2UI v1.0 candidate spec](https://a2ui.org/specification/v1.0-a2ui/). The official `@a2ui/angular` package is not used.

## Why

Two independent reasons, either sufficient.

**It cannot be installed.** `@a2ui/angular@0.10.5` — the latest published version, verified against the registry on 2026-08-14 — peer-deps `@angular/core: ^21.2.5`. This client is on Angular 22. It also peer-deps `@a2ui/markdown-it`, pulling a markdown parser into the render path.

**A general-purpose renderer is the wrong shape.** What is needed is a mapping from an agent-authored payload onto a whitelist of components *we* control — and a general-purpose renderer is the opposite of a whitelist. The payload arrives from outside and drives what appears on a console that configures live radio links, so the boundary between that payload and the DOM is a security control. Delegating a security control to a third-party dependency means not owning it.

## The boundary, since it is the point

1. Zod-validate the entire payload before anything touches it.
2. Whitelist component types through the registry; an unknown type renders a labelled fallback and never throws.
3. **No HTML injection** — text goes through interpolation only. No `[innerHTML]`, no `bypassSecurityTrust*`.
4. Bounded nesting — depth and total-component caps; exceeding either renders a fallback rather than recursing.
5. Cycle detection — an adjacency list lets a child reference an ancestor, which is an infinite render loop. Visited ids are tracked along the path.
6. Prototype-pollution guard on JSON-Pointer segments (`__proto__`, `constructor`, `prototype`).

## Deliberately unsupported

Markdown in `Text` is in the spec and is **not** implemented, because rendering it safely needs a sanitizer and a sanitizer is a new attack surface to reason about. The safe subset is documented instead. Also skipped: `callRendererFunction`, `agentFunctionResponse`, and streaming partial messages.

## Consequences

- We own spec conformance. If A2UI v1.0 changes, nothing upgrades for us. Acceptable: the surface implemented is small and the spec revision is pinned in the README.
- "Build your own" is normally the wrong instinct and will read as one unless the reasoning is visible — hence this ADR, and hence the README stating which parts of the spec are covered and which were skipped.
- The renderer's safety properties are testable without an agent: an unknown component type, an over-deep payload, and a cyclic payload are three hand-written fixtures that must each degrade rather than crash.
