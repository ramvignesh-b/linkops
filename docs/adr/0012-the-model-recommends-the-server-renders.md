# 12. The model recommends, the Server renders

## Status

Accepted.

## Decision

`GeminiAgent` does not author A2UI. It is asked for a judgement — which Link to look at first, which Remediation to consider, and the two sentences explaining both — and the Surface carrying that judgement is assembled by `triage-surface.ts`, the same builders the deterministic `StubTriageAgent` uses.

Structured Outputs hold the model to a flat object of four strings, one of them an `enum` of the Remediations this Assistant is willing to offer. The A2UI envelope is never described to the model, and no component type is ever named to it.

## Why

The obvious design is the opposite one: A2UI is a document format, an agent authors documents, so hand the model the envelope schema and let it author. That is what was built first, and it does not survive contact with a real model.

**Authored Surfaces were valid and blank.** Three consecutive replies validated against `a2uiEnvelopeSchema` and rendered nothing an operator could use: a `Text` whose content sat in `children` instead of `text`; `action` stubbed onto every component with an empty `event.name`; a component no `children` list referenced, unreachable from the root. Each was structurally legal A2UI. Each produced an empty Card.

That is not a prompt-quality problem, and adding another rule to the prompt fixed it twice and failed a third time. It is a consequence of [ADR-0006](./0006-shared-zod-schema-as-the-contract.md) meeting a model: `a2uiComponentSchema` is deliberately open — `.catchall(z.unknown())` — so the protocol never has to know a component type's own properties. Exactly right for a renderer that reads its own properties per type; exactly wrong as the thing a model is constrained against, because every property that actually renders (`text`, `label`, `options`, `value`) lives in the catchall and carries no schema pressure at all. The model populated the fields the schema named and ignored the fields only prose asked for.

**Constraining it harder made the request illegal.** The next attempt was a per-component-type JSON Schema — six branches, each requiring the properties its renderer reads. The Gemini backend refused the request outright, `400 INVALID_ARGUMENT`, with no field and no reason. Bisected against the live API, three separate keywords were the cause: `$schema` and `minLength` are outside the documented `responseJsonSchema` subset, and `prefixItems` alongside `items` is rejected once the `prefixItems` branch carries more than one property. Two of the three are emitted for free by `z.toJSONSchema()`, which is why the schema could not simply be generated.

**The Server already knows how to build the Surface.** `triageSurface()` and `confirmationSurface()` were written for the stub, are covered by the module spec, and have never once produced a blank component. Asking a model to reproduce them was asking it to re-derive, unreliably, something this repository does correctly by construction — and the part an operator actually wanted from a model was never the layout.

## Consequences

- **A blank panel is no longer expressible.** Every component reaches the Console from code that has always populated it. The failure mode that motivated this ADR cannot recur through this path.
- **The two Assistants share their Surfaces.** The stub and Gemini differ in what they recommend and how they say it, not in what appears. A change to the offer's shape is one edit, in one place, for both.
- **A bad answer degrades, it does not break.** A `linkId` or `remediation` the Fleet does not have falls back to the stub's own first choice. The operator gets a worse starting point, never an empty picker.
- **The whitelist is no longer load-bearing against the model.** It still guards the Console — a hostile payload from anywhere else degrades exactly as [ADR-0007](./0007-own-a2ui-renderer.md) requires — but the Server's own Assistant can no longer author a type that needs refusing.
- **We give up model-authored layout.** A model cannot invent a Surface shape this repository has not written, so a genuinely novel presentation needs a code change. That is the trade being made deliberately: the ceiling on what the Assistant can show is lower, and the floor is that it always shows something.
- The A2UI conformance table in the README is unaffected. What the Server can author is a subset of what the Console can render, and it always was.
