# 11. An embedded feature splits into UI and data-access, rather than nesting

## Status

Accepted.

## Decision

A `type:feature` library is a top-level routed view. When one route needs to
embed another feature's capability — the Fleet view embedding the triage
panel — the embedded feature is not built as a second `type:feature` library
that the first one imports. Instead its responsibilities split by layer, the
same way every other feature's already do:

- Purely presentational rendering goes to `type:ui` — inputs in, one output
  out, no store and no router.
- The client and session state go to `type:data-access`.

The host feature (`FleetPage`, for the triage panel) then composes the view
from these two libraries. It is the one component on its route permitted to
inject state, per the Console component convention in `AGENTS.md`.

## Why

`@nx/enforce-module-boundaries` bans `type:feature` from importing
`type:feature` ([ADR-0009](./0009-three-tag-axes-platform-domain-type.md)).
That rule is not incidental here: a feature able to import another feature
would let the embedded one manage its own state, and a route would end up
with two components competing to inject it — exactly what the
one-component-injects-state convention exists to rule out. Splitting by layer
instead keeps that convention true regardless of how many capabilities a
route ends up composing.

## Considered Options

- **Disable the boundary rule for this one case.** Rejected outright — the
  rule is what makes the dependency graph legible at every other seam in the
  workspace, and one exception is how a second one gets argued for later.
- **Mount the embedded feature on a named router outlet**, triggered from the
  host feature with a `routerLink` rather than an import — legal, since an
  app may depend on a feature. Considered and rejected for the triage panel
  specifically (`spec-assistant.md`'s "rejected alternative"): the panel's
  Surface is server-authored and not reproducible from a URL, so putting it
  on a route would promise shareable state the URL cannot actually deliver.
  Recorded here as the shape to return to if an embedded feature's state
  *is* meant to be addressable.
- **Keep the scaffolded library and fill it in place.** Not viable once the
  chosen composition point (`FleetPage`, a `type:feature`) needed to import
  it — the boundary rule bans that import regardless of what the library
  contains.

## Consequences

- The scaffolded `console/feature-assistant` library was deleted: composed
  only from inside another feature, it could never legally be reached by the
  one route that wanted it, so it was never a feature library, only labelled
  as one ahead of the slice that would have filled it. The workspace goes
  from thirteen libraries to twelve — [ticket `39`](https://github.com/ramvignesh-b/linkops/issues/46).
- The triage panel's renderer lives in `console/ui`; its client and session
  state live in `console/data-access`. `FleetPage` composes them.
- This does **not** by itself keep an embedded feature's code out of the
  initial bundle — chunking follows the import graph, not the library
  boundary, and a `type:ui`/`type:data-access` split that the host imports
  eagerly ships eagerly regardless. Keeping it out of the initial bundle is
  a separate, deliberate choice: gating the composition behind `@defer` (or
  an equivalent lazy boundary) in the host feature, which is what actually
  determines whether the embedded code ships in the initial chunk, a later
  route chunk, or a chunk of its own.
- The next embedded feature follows the same split rather than re-deriving
  it, and the trigger for revisiting this decision is named: a second
  feature wanting to embed the *same* capability, which the named-outlet
  alternative above would serve better than a third copy of this split.
