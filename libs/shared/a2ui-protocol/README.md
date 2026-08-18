# shared-a2ui-protocol

The declarative UI contract between the agent that describes a panel and the
renderer that draws it. The agent authors a Surface; this library is the schema
that Surface has to satisfy before anything renders it.

`a2uiComponentSchema` is the whitelist — the closed set of component types the
renderer knows, so an unknown type is a labelled fallback rather than an
injection point. `a2uiEnvelopeSchema` wraps a Surface with the caps that keep a
hostile payload bounded: `A2UI_MAX_DEPTH` of 10 and `A2UI_MAX_COMPONENTS` of
100, both enforced by the renderer as it walks. `json-pointer`
resolves data bindings with a guard on prototype-polluting segments, and
`A2uiInvalidActionError` is how an action naming something that does not exist
is rejected.

The library is shared because both ends must agree: the server builds Surfaces
against this schema and the Console validates against it before rendering. It
imports no framework.

See the root [README](../../../README.md#7-project-structure) for where this
sits, [`console-ui`](../../console/ui/README.md) for the gate-by-gate walk
these caps are enforced in, and
[ADR-0007](../../../docs/adr/0007-own-a2ui-renderer.md) for why the renderer is
ours rather than a general-purpose one.

## Running unit tests

Run `nx test shared-a2ui-protocol` to execute the unit tests via [Vitest](https://vitest.dev/).
