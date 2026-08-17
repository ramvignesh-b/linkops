# Spec — The Assistant: an Agent-Authored Surface, and the Boundary It Renders Behind

Status: ready-for-agent
Covers: B2, B2a, and `plan.md` §10 verification steps 7 and 8
Slice chosen: 2026-08-16, following `spec-foundation.md`, `spec-telemetry.md`, `spec-streaming.md` and `spec-console.md`. Per `docs/agents/issue-tracker.md` this effort has no single `spec.md`; this is the fifth and last per-area spec.

## Problem Statement

An operator looking at ten Links, two of them degraded, can see *that* they are degraded and can read the RSSI and SNR that say so. What the Console cannot do is say what to try. The numbers are on screen; the reading of them is in someone's head, and the operator who has that reading is not always the operator on shift.

That is the product problem. There is a second one, and it is the reason this slice is built the way it is: **an agent-authored payload driving a console that configures live radio links is an untrusted input rendering into a privileged surface.** A JSON document arrives from outside, names components, and asks for them to appear. Every safety property that keeps that from being a hole — a whitelist, bounded nesting, cycle detection, interpolation instead of HTML, a prototype-pollution guard on data bindings — is currently written down in [ADR-0007](../../docs/adr/0007-own-a2ui-renderer.md) and ticket `04` and enforced by nothing, because there is no renderer.

Three claims in the repository are in that same state:

- **`A2UI_INVALID_PAYLOAD` is in the closed error union and no code path produces it.** `operatorMessageFor` has an arm for it — "The assistant sent something the Console could not use." — that is unreachable today. An exhaustive switch with an arm nothing reaches is a claim about a boundary that does not exist yet.
- **The provider seam is described and absent.** `@nestjs/config` is a dependency; there is no config module, no `.env.example` on disk, and `apps/api/src/main.ts` reads `process.env.PORT` directly. Ticket `05` designed the boot-time validation — including the refinement that makes fail-fast and no-credentials coexist — and none of it is code.
- **"Works with no key present" is untested** because there is nothing yet that would want a key.

And the whole point of owning the renderer rather than installing one (ADR-0007) is that the boundary is a security control we hold. A security control nobody has exercised is a design note.

## Solution

A **triage assistant**, opened from the Fleet view, rendered entirely from a document the Server authored.

Pressing **Ask the assistant** beside the fleet list posts to `POST /api/agent/ui` and renders what comes back: a Card explaining what the assistant found, a Select naming the Links that are actually degraded right now, a Select of remediations to consider, and a Button. Choosing a remediation and pressing the Button round-trips the action to the Server, which answers with a second surface — a confirmation naming the Link, the remediation, and two Metrics carrying the readings the recommendation was based on.

**The assistant recommends; it never writes.** No surface it can author changes a Link. The operator applies the change through the Link form, which already validates against the shared schema and carries the version check. This is the sharpest line in the slice and it is drawn on purpose: the payload comes from outside, and the one thing an outside payload must not be able to reach is the configuration of a live radio link.

Behind the render is the boundary. The envelope is validated by a zod schema before the registry sees it; component types are looked up in a whitelist of six components we wrote; an unknown type renders a labelled fallback; depth is capped at 10 and total components at 100; ids are tracked along the current path so a child referencing an ancestor renders a fallback instead of recursing forever; JSON-Pointer segments naming `__proto__`, `constructor` or `prototype` are rejected before any lookup; and text reaches the DOM through interpolation only — no `[innerHTML]`, no `bypassSecurityTrust*`, anywhere.

The Server side is a deterministic stub selected by configuration. `AI_PROVIDER` defaults to `stub`, so a reviewer who clones this repository, creates no `.env` and holds no API key gets a working assistant — which is the configuration this will actually be run in. The config module that makes that choice is the same one that fails the boot, naming the variable, when a variable is present but incoherent.

At the end of this slice `plan.md` §10 step 7 and step 8 are both runnable, and the last piece of required scope is built.

## User Stories

**The operator, triaging**

1. As an operator, I want to ask for help from the screen I am already on, so that triage happens next to the Links I am triaging rather than in a separate part of the application.
2. As an operator, I want the assistant to name Links that are degraded *now*, so that I am not offered a Link that recovered two Ticks ago.
3. As an operator, I want a remediation suggested with the readings behind it, so that I can judge the suggestion rather than obey it.
4. As an operator, I want my choice to produce a response from the Server, so that the assistant is participating in the triage rather than replaying a canned screen.
5. As an operator, I want the confirmation to name the Link I chose, so that I know which of two degraded Links the advice applies to.
6. As an operator, I want the assistant to tell me when nothing is degraded, so that an empty picker never reads as a broken assistant.
7. As an operator, I want the assistant never to change a Link by itself, so that every configuration change on the fleet is one I made through the form.
8. As an operator, I want the panel to close and leave the fleet exactly as it was, so that asking a question costs me nothing.
9. As an operator, I want the fleet to keep updating at 1 Hz while the panel is open, so that opening the assistant is not a reason to stop watching the fleet.
10. As an operator, I want the panel's failure — when it fails — to be in words about my situation, so that I am not shown a stack trace or a diagnostic sentence written for a log.
11. As an operator, I want "the assistant answered with something unusable" and "the assistant did not answer" to read differently, so that I know whether retrying is worth anything.

**The reviewer, running it cold**

12. As a reviewer, I want the assistant to work with no API key present, so that I can evaluate the feature on a clean clone in five minutes.
13. As a reviewer, I want `.env.example` to name every variable with a dummy value, so that I can see the configuration surface without guessing.
14. As a reviewer, I want a variable that is present but wrong to fail the boot with the variable named, so that a typo is a diagnostic rather than a silent fallback.
15. As a reviewer, I want a typo'd variable in our own namespace to be rejected rather than ignored, so that `AI_PROVIDER_KEY` cannot silently leave me on the stub while I believe I configured a model.
16. As a reviewer, I want no real key ever committed, logged or sent to the browser, so that the secret-handling claim is checkable rather than asserted.
17. As a reviewer, I want the README to say which parts of the A2UI specification are implemented and which are not, so that "we built our own renderer" is a scoped claim I can verify.

**The security-minded reader**

18. As a reader, I want an unknown component type to render a labelled fallback, so that an agent naming a component we never wrote degrades instead of crashing the panel.
19. As a reader, I want a payload nested past the cap to stop at the cap, so that depth is bounded by a number rather than by the stack.
20. As a reader, I want a component referencing an ancestor to render a fallback, so that an adjacency list cannot express an infinite render loop.
21. As a reader, I want a data binding through `__proto__` or `constructor` to be refused before the lookup happens, so that reads cannot walk to the prototype chain any more than writes can.
22. As a reader, I want the whole envelope validated before anything is rendered, so that the schema is the boundary and the components can assume valid input.
23. As a reader, I want text rendered by interpolation only, so that the absence of HTML injection is structural rather than a review habit.
24. As a reader, I want markdown in `Text` left unimplemented and *said* to be unimplemented, so that no sanitizer is in the render path and nobody assumes one is.
25. As a reader, I want the caps to be numbers in one place, so that changing them is a decision rather than an edit in four files.

**The engineer who inherits this**

26. As an engineer, I want the agent behind the endpoint to sit behind an interface, so that replacing the stub with a model client is a provider swap and not a rewrite.
27. As an engineer, I want the stub to be a pure function of its request and the current fleet, so that its tests need no clock, no network and no key.
28. As an engineer, I want the wire schemas in a shared library, so that the Server cannot author a surface the Console would reject.
29. As an engineer, I want the request and response shapes in the OpenAPI document like every other endpoint, so that the assistant is not a second, undocumented API.
30. As an engineer, I want the renderer's vocabulary in `CONTEXT.md`, so that Surface, Component, Data Model and Action mean one thing each in this repository.
31. As an engineer, I want the panel's chunk kept out of the initial bundle, so that a feature an operator opens sometimes is not paid for on every load.

## Implementation Decisions

### Where the panel lives — and why it is not a feature library

The panel opens **beside the fleet list**, from a control in the Fleet view, deferred until the operator asks for it:

```
@defer (on interaction) {
  <lib-a2ui-surface [surface]="assistant.surface()" (action)="assistant.send($event)" />
} @placeholder {
  <button class="ask-assistant">Ask the assistant</button>
}
```

That placement collides with an enforced rule, and the collision is resolved in favour of the rule. `@nx/enforce-module-boundaries` says **never feature to feature**: `console/feature-fleet` cannot import `console/feature-assistant`. So the scaffolded `console/feature-assistant` library is **deleted**, and its intended contents split along the layer they actually belong to:

- the renderer and the six components are **presentational** — inputs in, an action out, no store, no router — so they live in `console/ui`;
- the client and the session state are **data access**, so they live in `console/data-access`;
- the composition is `FleetPage`'s, which is the routed component and therefore the one component on that route allowed to inject state, exactly as `AGENTS.md` requires.

This takes the workspace from thirteen libraries to twelve. It is recorded rather than quietly done: `plan.md` §1, the map, and the README's project structure all name the library today. The honest summary is that a feature library no feature can reach was never a feature library — the label was assigned during scaffolding, before the panel had a home.

**The rejected alternative, because it is a real fork.** Mount the panel on a named router outlet (`/links(assistant:ask)`), lazy-loaded from `app.routes.ts` — legal, since an app may depend on a feature — and trigger it from `FleetPage` with a `routerLink` rather than an import. That preserves the library and the route-lazy discipline. It was rejected because the surface is server-authored and not reproducible from a URL, so making a transient triage conversation part of the shareable state of the fleet view promises something the URL cannot deliver. If B4 federation later wants the assistant packaged as a remote, this is the shape to come back to, and the renderer moves back into a feature library with it.

**The panel's open state is component state, not URL state.** `spec-console.md`'s "the URL is the state" rule is about the fleet's filter and sort, which are reproducible. This is not, for the reason just given.

### `shared/a2ui-protocol` — the envelope, and the subset

Framework-free, zod only, `platform:shared domain:assistant type:domain`. It holds the wire contract both sides execute, per [ADR-0006](../../docs/adr/0006-shared-zod-schema-as-the-contract.md):

- **The envelope**, a discriminated union on the message: `createSurface` and `updateDataModel`, both carrying `version: 'v1.0'`.
- **`createSurface`**: `{ surfaceId, components, dataModel }`, where `components` is a flat adjacency list of `{ id, component, child?, children?, action? }` carrying its type-specific properties alongside those fields, and `children` holds ids rather than nested objects. A2UI leaves the root implicit, so the first component in the list is it.
- **`updateDataModel`**: `{ surfaceId, patch }`, applied through the same guarded write path a Select's local change uses. That shared path is the reason the message exists in the schema at all: the pollution guard is written once and exercised from both directions.
- **The action request**: `{ kind: 'action', surfaceId, componentId, action, data }`, and an `{ kind: 'open' }` companion for the first ask. Ticket `04` pinned the four action fields; `kind` is added so the two requests are one discriminated union rather than a shape with everything optional.
- **The caps as exported constants** — depth `10`, total components `100` — and the whitelisted type names as a single readonly tuple the schema and the registry both read, so the whitelist cannot drift from the schema.
- **The pointer functions**: a read and a write over `/data/...` pointers, both rejecting a segment equal to `__proto__`, `constructor` or `prototype` before any lookup. Pure functions, no framework import, next to the schema that defines the pointer's meaning.

**Not implemented, and listed in the README's conformance table**: `updateComponents` (an in-place component patch needs an identity-stable merge nothing in this design exercises, and an unexercised merge path is an untested one), `callRendererFunction`, `agentFunctionResponse`, streaming partial messages, markdown in `Text`, and template iteration (`children: { path, componentId }`). The A2UI specification revision this was built against is pinned in the README, per ADR-0007's consequence about owning conformance.

**Field names verified 2026-08-16**, against the published specification rather than from memory, which is what this paragraph originally asked ticket `37` to do. Three of the names first written here were wrong: the type key is **`component`**, not `componentType`; there is **no `properties` key** — type-specific properties sit alongside the structural fields; and a data binding is **`{ "path": "/..." }`** inline where a literal would go. Ticket `04` carries the correction table. Our schema is the contract we validate with; the README's conformance table is where we say how it relates to theirs.

### `console/ui` — the renderer, and the six safety properties

One recursive component, `lib-a2ui-surface`, plus a registry `Map<string, Type<unknown>>` over six components we own: `Surface`, `Card`, `Text`, `Button`, `Select`, `Metric`. It takes a validated surface as an input and emits one output — the action a Button produced. It injects nothing.

- **Validation has already happened** by the time this component has a surface. The schema runs in `console/data-access`, at the wire; the renderer's input type is the parsed shape. A component that cannot be handed an invalid surface needs no defensive code inside it.
- **Unknown `component`** renders `A2uiFallback`, labelled with the type name it could not render. It never throws, and the rest of the surface still renders.
- **Depth and count** are checked as the tree is walked. Exceeding either renders the fallback **for the offending subtree**, not for the surface — a broken branch should not take a good one with it.
- **Cycles** are caught by tracking visited ids **along the current path**, not globally: a component legitimately rendered twice as a sibling is not a cycle, and treating it as one would break a real surface to defend against a fake one.
- **Text is interpolated.** No `[innerHTML]`, no `bypassSecurityTrust*`, no `DomSanitizer` import in the library at all — the absence is the property.
- **Bindings resolve through the guarded pointer functions** from `shared/a2ui-protocol`. A `Select` writes the operator's choice back into the data model through the guarded write.

Templates and styles inline, `OnPush`, design tokens only — the three `AGENTS.md` conventions, unchanged. The fallback gets its own token-based treatment so a degraded subtree looks deliberate rather than broken.

### `console/data-access` — the client, the session, and the third kind of failure

- **`AssistantClient`** posts to `/api/agent/ui` and parses the response with `a2uiEnvelopeSchema`. A response the schema rejects is not a surface, and nothing downstream ever sees it.
- **`AssistantSession`** holds the panel's state as signals — `surface`, `pending`, `failure` — and exposes `open()` and `send(action)`. `FleetPage` injects it and passes signals down; the session is what keeps `FleetPage` inside its complexity budget as the panel grows.
- **`ConsoleFailure` gains its invalid-payload arm**: `{ kind: 'invalid-payload', code: 'A2UI_INVALID_PAYLOAD' }`, distinct from `TransportFailure`. The existing comment in `console-failure.ts` is explicit that synthesising an envelope for a connection that dropped would lie about where a failure came from; the same logic applies in reverse here. The Server *did* answer — the answer was unusable — and that is a third thing, not either of the first two.
- **The panel renders `operatorMessageFor('A2UI_INVALID_PAYLOAD')`**, the arm that exists today and nothing reaches. This slice is what makes the exhaustive switch's fifth case true.

### `server/a2ui-agent` — the endpoint, the stub, and the seam

`platform:server domain:assistant type:feature`, so it may reach `server/links-data-access` and `server/telemetry` directly, which is how it knows which Links are degraded.

- **`POST /api/agent/ui`** takes the request union, validated by the existing `nestjs-zod` pipe, and answers with an envelope. DTOs are `createZodDto()` over the shared schemas and the controller carries `@ZodResponse` and the documented error statuses, exactly like every endpoint in `server/links-api`.
- **`A2UI_AGENT`**, an injection token over an interface with one method: request in, envelope out. `StubTriageAgent` implements it.
- **The stub is a pure function of the request and the current fleet.** Step one: read the Roster, derive each Link's Status through `withDerivedStatus` — the same shared presenter the REST reads and the stream diff use, so the assistant cannot disagree with the fleet list about what "degraded" means — then author a surface offering the degraded Links and three remediations drawn from the Link's own configurable fields. Step two: a confirmation naming the Link and the remediation, with two `Metric` components carrying the readings the recommendation rests on. No clock, no randomness, no network.
- **All six whitelisted component types appear in the happy path** — the two surfaces between them use every one — so the whitelist is exercised by the product rather than only by hostile fixtures.
- **An unrecognised `surfaceId`** answers `400` with the Error Envelope and code `A2UI_INVALID_PAYLOAD`. The same code from both directions is deliberate: it names one thing, an A2UI payload that could not be used, and an operator's copy for it is already written.
- **Provider selection.** The factory behind `A2UI_AGENT` reads `AI_PROVIDER`. `stub` — the default, and the value a reviewer runs — yields `StubTriageAgent`. `anthropic` yields a readable boot failure naming that the provider seam exists and no model client ships in this repository. Falling back silently to the stub was rejected: it would make the boot-time validation ticket `05` designed pointless, since the one thing the operator asked for would be the one thing that quietly did not happen.
- **No OpenAPI assertion lives here.** `buildOpenApiDocument` is in `server/links-api`, and feature-to-feature is banned, so this library cannot import it — the same wall ticket `28` hit. The document is built over the whole app in `main.ts`, the mechanism is already pinned by `openapi-document.spec.ts`, and this endpoint inherits it by carrying the same decorations. Asserted by construction, and said out loud rather than left as a gap.

### Configuration — the whole module, in `apps/api`

The env schema and `ConfigModule.forRoot({ validate })` live in `apps/api`, which is bootstrap and wiring — the job an app is allowed to have. A fourteenth library was rejected: one boot validation with one library consumer does not earn a library, and the trigger for revisiting is named — a second server library needing configuration.

The surface is ticket `05`'s table, unchanged: `PORT` (optional, `3000`), `AI_PROVIDER` (optional, `stub` | `anthropic`), `AI_PROVIDER_API_KEY` (required **only if** `AI_PROVIDER=anthropic`), `SWAGGER_UI_ENABLED` (optional, `true`). Three things fail the boot, and each names the variable: a variable present but invalid, a conditionally-required variable missing, and an unknown variable matching our prefix. That refinement is what makes fail-fast and "starts with no credentials" both true at once.

`.env.example` is **created** — it is absent from disk today — with a dummy value on every row and no real key. `main.ts` reads `PORT` and `SWAGGER_UI_ENABLED` from `ConfigService` rather than `process.env`, and `SWAGGER_UI_ENABLED` finally mounts the interactive explorer that ticket `05` deferred. The key is never logged and never reaches a response; the Console has no knowledge that a provider concept exists.

The fail-fast path runs before Nest's `Logger` does, which is exactly what the `no-console` rule's existing `allow: ['warn', 'error']` exemption was written for.

### Vocabulary and documentation

`CONTEXT.md` has no assistant entries. This slice adds them, because four of these words already mean something else in this repository: **Assistant**, **Surface** (an agent-authored document, not a screen), **A2UI Component** (a node in that document, not an Angular component), **Data Model**, **Action**, and **Remediation**. Written before the code, per `docs/agents/domain.md`.

The README gains the conformance table, the six safety properties as implemented, the configuration surface, and the assistant's paragraph in "How it works" — each landing in the commit that makes it true.

### Boundary consequences

`console/ui` gains a dependency on `shared/a2ui-protocol` (`type:ui` → `type:domain`, allowed) and gains no data-access dependency. `server/a2ui-agent` depends on two `type:data-access` libraries and `shared/a2ui-protocol`. `console/feature-assistant` is deleted. No new edge crosses the server/console firewall, and `nx graph` gains no cycle.

## Testing Decisions

**A good test here asserts what an operator or an attacker can observe**: what rendered, what was posted, what the Server answered, and what did not happen. Every safety property in this slice is observable from outside the renderer — a fallback is rendered text, a bounded walk is a finite DOM, a refused pointer is a binding that did not appear — so none of them needs a test that reaches inside.

**Two seams, both already in this repository**, one per platform, because the two halves cannot be booted in one process:

1. **The Console app seam** — `bootConsole` in `apps/console/src/app/testing/console-harness.ts`, unchanged. The panel is opened through the DOM, `HttpTestingController` answers `POST /api/agent/ui`, and hostile payloads are injected as that response. Everything between the wire and the pixel — schema validation, the registry, the caps, the cycle check, the pointer guard, the failure copy — is the code that ships. `screen` gains an assistant group, following the existing `linkDetailScreen`/`linkCreateScreen` grouping that keeps it inside the lint budget.
2. **The server module seam** — `server-a2ui-agent.module.spec.ts`, the posture of `server-links-api.module.spec.ts`: boot the real module with a seeded in-memory repository, drive it over supertest, assert on the HTTP response.

**No unit spec on the renderer, the registry or the pointer functions.** A direct test of the pointer guard would assert the same fact one layer further from the thing that matters, and would create a second vocabulary for the same state — the reasoning `spec-console.md` gave for not seaming `FleetStore`, applied to the same kind of temptation.

### What the console seam asserts

Eight tests in `apps/console/src/app/assistant.spec.ts`, ordered, and the order is the cut list — but tests 3 to 6 are the boundary this slice exists to demonstrate and are **not** cuttable.

1. **Opening the panel asks, and the surface renders.** The panel is absent until the control is used; using it issues exactly one `POST /api/agent/ui` with the open request; the returned surface renders a Card, its Text, both Selects with the degraded Links named, and the Button. The fleet list beneath keeps rendering Ticks throughout.
2. **The round-trip.** Choosing a remediation writes the data model; pressing the Button posts `{ kind: 'action', surfaceId, componentId, action, data }` with the operator's choices in `data`; the confirmation surface renders, naming the Link and carrying both Metrics. This is B2's round-tripped interaction.
3. **An unknown `component`** renders a labelled fallback naming the type, the surface's other components still render, and nothing throws.
4. **A payload eleven levels deep** renders the fallback at the cap; everything above the cap renders normally.
5. **A two-node cycle** renders a fallback where the child references its ancestor, and the test completes — a stack overflow fails it by construction.
6. **A binding through `__proto__`** renders no value and pollutes nothing: `({} as Record<string, unknown>)['polluted']` is `undefined` after the render. Asserted for a read as well as a write, since a read through `constructor` is how a payload reaches the prototype chain in the first place.
7. **A response that fails the envelope schema** renders no surface and shows `A2UI_INVALID_PAYLOAD`'s operator copy — and the Server's diagnostic `message`, present in the fixture, never appears in the DOM.
8. **The Server not answering** renders the transport copy, distinct from test 7's words. This is the cut candidate: transport failure copy is already exercised by the create and edit surfaces.

### What the server seam asserts

Five tests in `libs/server/a2ui-agent/src/lib/server-a2ui-agent.module.spec.ts`:

1. **The open request answers a surface that validates against `a2uiEnvelopeSchema`** — the Server cannot author what the Console would reject, asserted by running the Console's own schema over the response body.
2. **Only genuinely degraded Links are offered**, against a seeded repository and telemetry double with a known mix of Statuses, derived through `withDerivedStatus` rather than a second opinion about thresholds.
3. **The stub is deterministic**: the same action request against the same fleet answers byte-identical bodies twice.
4. **An unrecognised `surfaceId`** answers `400` with the Error Envelope and `A2UI_INVALID_PAYLOAD`; a malformed body answers `400` `VALIDATION_FAILED` with field issues, through the existing pipe and filter.
5. **A fleet with nothing degraded** answers a surface that says so, with no empty Select — the case an operator will hit most often, since most of the time the fleet is fine.

Configuration is asserted where it lives: booting the module with `AI_PROVIDER` unset yields the stub, and an incoherent environment fails `app.init()` with the variable named. Two tests, in `apps/api`'s existing module spec, which is where boot behaviour already belongs.

### Prior art

- **`server-links-api.module.spec.ts`** — boot the real module, fake only the edges, drive it over the interface a consumer uses.
- **`apps/console`'s six app-level specs and `bootConsole`** — the harness this suite extends rather than replaces.
- **`api-error.spec.ts`** — the `never`-default exhaustiveness guard, which already covers the code this slice finally produces.
- **`openapi-document.spec.ts`** — the document mechanism, pinned once, inherited here.

## Out of Scope

- **A real model provider.** The seam is an interface and a token; `anthropic` fails the boot with a readable message rather than pretending. Implementing a model client would need a key nobody evaluating this will have, and a network call in a test suite that has none.
- **The assistant writing to a Link.** Recommendations only, for the reason given in the Solution. A surface that could issue a `PATCH` would put an agent-authored payload on the write path to a live radio link, which is the exact boundary the renderer exists to keep closed.
- **`updateComponents`, `callRendererFunction`, `agentFunctionResponse`, streaming partial messages, markdown in `Text`, and template iteration** — the conformance table names each and why.
- **Conversation history.** One surface at a time, replaced by the next. A transcript is a second state model with a persistence question attached, and the round-trip demonstrates the protocol without it.
- **The panel on the detail route.** Triage is a fleet-level activity; putting it on both routes duplicates the composition without adding a property.
- **B4 Module Federation.** Unchanged by this slice, and the named-outlet alternative above records the shape to return to if it happens.
- **Authentication on the endpoint**, theming, responsive layout below desktop, and i18n — the same posture as every other slice.

## Budget

**Roughly a day and a half, and the cut order matters because the README pass comes after this and is a graded deliverable.**

- `shared/a2ui-protocol` — envelope schemas, caps, whitelist tuple, guarded pointer functions: **1.5 h**
- `server/a2ui-agent` — endpoint, DTOs, agent interface, the two-step stub, five tests: **2.5 h**
- Configuration — env schema with the conditional refinement, `ConfigModule`, `.env.example`, `main.ts` and the explorer flag, two boot tests: **1.5 h**
- `console/ui` — renderer, registry, six components, fallback, caps and cycle walk, tokens: **3 h**
- `console/data-access` — client, session, the invalid-payload failure arm: **1 h**
- `console/feature-fleet` — the deferred composition and the trigger; deleting `console/feature-assistant`: **0.5 h**
- `apps/console` — the eight app-level tests and the `screen` group: **2 h**
- `CONTEXT.md` entries, README conformance table, safety properties, configuration section: **1.5 h**

If it runs over, cut test 8, then the second Metric on the confirmation surface, then the `SWAGGER_UI_ENABLED` explorer mount (the flag stays in the schema; only the `SwaggerModule.setup()` call goes). Do **not** cut the config module to save time — "starts with no credentials" is the claim a reviewer will test first, and it is unverifiable without it. Do **not** cut tests 3 to 6.

## Further Notes

- **Where this slice's rationale already lives**, and is deliberately not restated: ticket `04` (the whitelist, the two caps, path-scoped cycle detection, the pollution guard, the round-trip stub), ticket `05` (the config surface, the conditional-requirement refinement, the explorer flag), ticket `12` (the error taxonomy and the copy rule), [ADR-0006](../../docs/adr/0006-shared-zod-schema-as-the-contract.md), [ADR-0007](../../docs/adr/0007-own-a2ui-renderer.md), and [ADR-0009](../../docs/adr/0009-three-tag-axes-platform-domain-type.md) (the tag axes the library placement follows from).
- **Three decisions taken beyond every existing ticket**, all recorded above: the assistant recommends and never writes; `console/feature-assistant` is deleted and its contents split by layer, because the boundary rule bans the import the chosen placement needs; and `AI_PROVIDER=anthropic` fails the boot rather than falling back to the stub.
- **This slice makes two dormant things live**: `A2UI_INVALID_PAYLOAD`'s operator copy, which nothing has ever produced, and the `.env` story, which has been designed since 2026-08-14 and never executed.
- **`plan.md` §1 and the map both claim thirteen libraries.** After this slice it is twelve. The count changed once before, in the other direction, for a boundary reason of the same kind — a controller that could not live in an app. Both entries are updated in the commit that deletes the library.
- **After this, no required scope is unbuilt.** What remains is the README and verification pass — `plan.md` §10 end to end, including the timed clean-machine run and the decisions section — and B4 as a stretch.
