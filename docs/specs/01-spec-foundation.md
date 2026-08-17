# Spec — Foundation: Domain Contract, Link Repository, REST API

Status: ready-for-agent
Covers: M1, M3, and the parts of M7 and M8 that live on the server
Slice chosen: 2026-08-15, from a closed map. Per `docs/agents/issue-tracker.md` this effort has no single `spec.md`; this is the first per-area spec.

## Problem Statement

An operator opens LinkOps Console to see every Link in the fleet, spot the degraded ones, and edit Link configuration. None of that is possible yet: the workspace has thirteen libraries, nine ADRs and fifteen resolved design tickets, but no product code — every library holds only its generator stub.

Nothing else can be built until the contract exists. The Console cannot render a Fleet Roster it cannot fetch, the Simulator cannot read a Roster from a repository that does not exist, and the SSE stream cannot frame `Link` and `TelemetrySample` shapes that have never been written down in TypeScript. Two operators editing the same Link would silently overwrite each other, because there is no compare-and-swap to stop them.

There is a second problem the design already anticipates. Every planning document asserts that "client and server cannot drift". That claim is only true if exactly one artifact defines each rule, and today zero artifacts do — so the first library to hand-write a validation rule makes it false permanently.

## Solution

Three libraries, built bottom-up, delivering a complete and documented HTTP contract for Links:

- **`shared/domain`** — the single source of truth. One zod schema per shape, types inferred from them, plus the pure functions that operate on those shapes (`deriveStatus`, `zodIssuesToFieldIssues`) and the error vocabulary (`ApiErrorBody`, `FieldIssue`, the `code` union). Framework-free; one runtime dependency, zod.
- **`server/links-data-access`** — `LinkRepository` as an interface, `InMemoryLinkRepository` behind it, seeded with ten Links on boot. The compare-and-swap is in the `update` signature, so a write that skips the version check cannot be expressed.
- **`server/links-api`** — the REST surface. Controllers, DTOs generated from the shared schemas via `createZodDto`, `nestjs-zod`'s validation pipe, and one exception filter owning the domain-error → HTTP-status mapping and the error envelope.

At the end of this slice a reviewer can `curl` the full Link lifecycle: list with filters, create, read, patch with a stale version and get a 409 carrying the current Link, delete, and 404 on the unknown. Every Link reads `down: stale` until the Simulator lands in the next slice, which is the honest and correct answer for a fleet that has never produced a Telemetry Sample.

## User Stories

**The operator, through the Console that follows**

1. As an operator, I want every Link in the Fleet returned with its Status already derived, so that the list can render health without opening a stream.
2. As an operator, I want a Link that has produced no telemetry to read `down` with reason `stale`, so that "we have no data" never masquerades as "the Link is healthy".
3. As an operator, I want a Link that is reporting but reporting badly to read `down` with reason `metrics`, so that I can tell a dead feed from a bad signal.
4. As an operator, I want to filter the Fleet by Status, so that I can see only what needs attention.
5. As an operator, I want to filter the Fleet by Band, so that I can look at one part of the estate at a time.
6. As an operator, I want to search Links by free text across name and Sites, so that I can find one Link without scrolling.
7. As an operator, I want the Fleet sorted deterministically, so that the same URL shows the same order twice.
8. As an operator, I want to create a Link with a validated configuration, so that I cannot save a Link the API will reject.
9. As an operator, I want a duplicate Link name refused with a clear reason, so that two Links cannot become indistinguishable in a list.
10. As an operator, I want to open one Link and see its configuration together with its most recent reading, so that drill-down is one request rather than two.
11. As an operator, I want my edit rejected when someone else has already changed the Link, so that I do not silently destroy their change.
12. As an operator, I want that rejection to hand me the current Link in full, so that the Console can show me theirs-versus-mine field by field rather than telling me to reload.
13. As an operator, I want to delete a Link and have it gone from the Fleet, so that decommissioned hardware stops occupying the console.
14. As an operator, I want the Fleet Summary computed by the server, so that the KPI header can never disagree with the rows beneath it.
15. As an operator, I want recent Telemetry Samples for one Link over a window, so that the detail view can draw a sparkline.

**The Console developer, in the slice after this one**

16. As a Console developer, I want `Link`, `TelemetrySample` and `FleetSummary` types importable from one library, so that the store and the wire cannot disagree about a field name.
17. As a Console developer, I want the same zod schemas the server validates with, so that the form's validators mirror the server's rules by construction rather than by discipline.
18. As a Console developer, I want `linkCreateSchema` and `linkPatchSchema` as separate schemas, so that the create and edit modes of one form bind whichever the mode selects with no special case.
19. As a Console developer, I want the error `code` union exported, so that my failure handling is an exhaustive switch the compiler checks.
20. As a Console developer, I want `details` typed per `code`, so that the conflict UI can read `current` without a cast.
21. As a Console developer, I want server validation failures to arrive as `FieldIssue[]` keyed by dotted path, so that one adapter puts them onto form controls whether they came from a local `safeParse` or from the server.
22. As a Console developer, I want `LinkId` branded, so that a bare string cannot be passed where a Link id is meant.

**The author of a second client, reading the README**

23. As a second-client author, I want one error envelope shape for every failure, so that I write one error path rather than one per endpoint.
24. As a second-client author, I want the HTTP status to carry the class and `code` to carry the meaning, so that I can handle a category generically and a case specifically.
25. As a second-client author, I want to be told that `message` is diagnostic, so that I do not render it to a human.
26. As a second-client author, I want an OpenAPI document generated from the same schemas the server enforces, so that the document cannot describe an API that does not exist.
27. As a second-client author, I want `GET /api/links` to carry `status`, so that I can render a fleet list without also implementing a stream.

**The engineer taking the next slice**

28. As the engineer building the Simulator, I want `LinkRepository` to be the only way to reach the Roster, so that reading it each Tick makes "no ghost telemetry" structural.
29. As the engineer building the Simulator, I want the delete path to already call `dropLink` after the repository delete, so that the ordering decision does not have to be rediscovered.
30. As the engineer building the Simulator, I want the read side of telemetry to be an interface the REST layer already depends on, so that landing the real implementation changes no controller.
31. As the engineer swapping in a real store, I want the repository contract expressed as a reusable test suite, so that a new implementation is proven against the same assertions.
32. As the engineer swapping in a real store, I want `update(id, patch, expectedVersion)` rather than `save(link)`, so that the interface maps onto a conditional update instead of a read-modify-write race.

**The reviewer**

33. As a reviewer, I want `pnpm test` to run this slice's tests with no sleeps and no flakes, so that determinism is demonstrated rather than claimed.
34. As a reviewer, I want the boundary lint rule to already bite on this slice's imports, so that the dependency rule is enforced from the first product commit.
35. As a reviewer, I want status derivation unit-tested at its threshold boundaries, so that the rule the whole product hangs on is pinned.
36. As a reviewer, I want at least one HTTP-level test exercising the real contract end to end, so that the error envelope is asserted where it is actually produced.

## Implementation Decisions

### `shared/domain` — the contract

Framework-free, one runtime dependency: zod 4. `nestjs-zod` must not appear here (ADR-0006) — `createZodDto()` is a server concern.

Owns, per the ownership table in ticket `07`:

- **Schemas, types inferred from them.** `linkSchema`, `linkCreateSchema`, `linkPatchSchema`, `telemetrySampleSchema`, `fleetSummarySchema`, and the query schemas for the list and telemetry endpoints. No type is hand-written where a schema can infer it.
- **The `Link` shape follows the brief**: `id`, `name` (3–40, unique), `siteA`, `siteB`, `band`, `mode`, `capacityMbps` (10–1000), `txPowerDbm` (−10..30), `channelWidthMhz` (20 | 40 | 80), `status`, `version`, `createdAt`, `updatedAt`. `status` is derived and never client-writable, so it is on `linkSchema` but on neither `linkCreateSchema` nor `linkPatchSchema`. The eight operator-editable fields are the eight the form in ticket `13` binds.
- **`linkPatchSchema` makes every editable field optional and requires `version`.** That asymmetry is the whole of M7 expressed in a schema.
- **`LinkId` is branded**; Mbps, dBm and MHz scalars deliberately are not (ADR-0006).
- **`deriveStatus(link, latestSample, now)`** returns a discriminated result carrying the reason when down: `{ status: 'up' } | { status: 'degraded' } | { status: 'down'; reason: 'stale' | 'metrics' }`. The brief's example rule is adopted as-is — `up` at `snrDb >= 18 && throughputMbps >= 0.6 * capacityMbps`, `degraded` at `snrDb >= 10 && throughputMbps >= 0.2 * capacityMbps`, otherwise `down` — with staleness at no Sample within five seconds taking precedence over the metric thresholds, because a five-second-old reading is not evidence of anything. Thresholds live here and nowhere else; `CONTEXT.md` records this function as the only thing entitled to an opinion about what "good" is.
- **Status has exactly one runtime caller, the Server** (ticket `08`). This library is where it lives because it is framework-free domain logic, not because two platforms call it. The README must not claim Console reuse of `deriveStatus`.
- **The error vocabulary** — the `code` union, `ApiErrorBody` as a discriminated union keyed by `code`, `FieldIssue`, and `zodIssuesToFieldIssues(issues): FieldIssue[]`. Shapes are fixed by ticket `12` and not restated here.
- **`now` is always a parameter.** Nothing in this library reads a clock.

### `server/links-data-access` — the repository

Interface exactly as ADR-0008 pins it: `findById`, `findAll(filter)`, `create(draft)`, `update(id, patch, expectedVersion)`, `delete(id)`, `count()`. `update` returns `{ ok: true; link } | { ok: false; current }` — a result, never a throw, because the repository knows nothing about HTTP.

- **`InMemoryLinkRepository` is backed by a `Map<LinkId, Link>`**, plus whatever index name-uniqueness needs. The `Map` is an implementation detail no test may reach into.
- **Name uniqueness is enforced here**, not in the controller — it is an invariant of the collection, and a controller-level check is a race the moment there are two write paths. `create` and `update` both return a distinguishable name-taken outcome.
- **`findAll(filter)` filters only on fields the repository owns** — `band`, and `q` across name, `siteA` and `siteB`. It does **not** filter on `status`: Status is derived from Samples the repository has never seen, and giving the repository that knowledge would require it to depend on telemetry. Status filtering and any Sample-derived sort are applied in `server/links-api`, above the repository, after the telemetry read port supplies the Samples.
- **`version` starts at 1 and increments on every successful `update`.** `updatedAt` moves with it; `createdAt` never changes.
- **Seeding is ten Links on boot** (the brief asks for 8–12), spread across Bands, Modes and Capacities so the fleet view has something to sort and filter. Seed data is deterministic — a fixed table, not randomly generated — so a reviewer's screenshot and a test's expectation describe the same fleet.
- **The repository does not derive Status and does not store it.** `Link` values leaving the repository carry the `status` field's placeholder only in the sense that the API layer sets it; the internal record type is the Link configuration plus `version` and timestamps.

### `server/links-api` — the HTTP surface

Endpoints, following the brief's suggested contract:

| Method | Path | Behaviour |
|---|---|---|
| `GET` | `/api/links` | Roster with `status` derived per Link. Query: `status`, `band`, `q`, `sort`, `dir` |
| `POST` | `/api/links` | 201 and the created Link. 409 `LINK_NAME_TAKEN` on a duplicate name |
| `GET` | `/api/links/:id` | `{ link, latestSample }` — the Link with its current telemetry snapshot, `latestSample` null until the Simulator lands. 404 unknown |
| `PATCH` | `/api/links/:id` | Requires `version`. 200 and the updated Link, or 409 `LINK_VERSION_CONFLICT` |
| `DELETE` | `/api/links/:id` | 204. 404 unknown |
| `GET` | `/api/links/:id/telemetry?window=5m` | Recent Samples for the chart. 404 unknown Link |
| `GET` | `/api/fleet/summary` | The `FleetSummary` block |

- **Sorting keys are `name`, `capacityMbps`, `status` and `throughputMbps`**, with `dir` of `asc` or `desc`, defaulting to `name asc`. Ties always break on `id` so the order is total and a reload cannot reshuffle equal rows.
- **The server supports filter and sort because the contract says so and a second client needs them; the Console will nonetheless filter and sort locally** over the store it already holds, because refetching on every sort change would fight the stream that is keeping that store live. Both are correct and the README's API reference documents the server's behaviour without implying the Console uses it.
- **DTOs come from `createZodDto(schema)`** and the validation pipe is `nestjs-zod`'s, per ADR-0006. This is a first-endpoint decision — retrofitting it means rewriting every DTO signature.
- **The exception filter maps only known domain errors.** `LINK_NOT_FOUND` → 404, `LINK_VERSION_CONFLICT` → 409, `LINK_NAME_TAKEN` → 409, `VALIDATION_FAILED` → 400. Anything unrecognised is deliberately **not** wrapped in an envelope: the `code` union is closed and has no internal-error member, and ticket `12` already gives the Console a `TransportFailure` with cause `http-no-envelope` for exactly this case. Synthesising a fake envelope for an unexpected 500 would be lying about where the failure came from.
- **The filter converts zod issues to `FieldIssue[]` at the boundary**, so zod's internal issue format never becomes part of the public contract.
- **`message` is diagnostic and the README says so.** Operator copy lives in `console/data-access` (ticket `12`).
- **`GET /api/fleet/summary` reads the Summary from the telemetry read port** rather than aggregating here. Summary computation belongs to `server/telemetry` per ticket `07`'s ownership table, and ticket `10` makes the server the single authority for it. `worstLinkId` is the lowest `snrDb` among Links that have a Sample, ties on lowest `id`, no-Sample Links excluded, `null` when nothing has reported.

### The telemetry read port — the one seam this slice adds ahead of its implementation

`GET /api/links` needs Status, `GET /api/fleet/summary` needs the Summary, and `GET /api/links/:id/telemetry` needs history — all three come from `server/telemetry`, which this slice does not build. Rather than defer three endpoints and reshape the controllers later, this slice lands the **interface** in `server/telemetry` together with an empty implementation:

```ts
interface TelemetryPort {
  latestSample(id: LinkId): TelemetrySample | null;
  latestSamples(): ReadonlyMap<LinkId, TelemetrySample>;
  history(id: LinkId, windowMs: number): readonly TelemetrySample[];
  summary(): FleetSummary;
  dropLink(id: LinkId): void;
}
```

`server/links-api` is a `feature` and `server/telemetry` a `data-access`, so this dependency runs the way the layer rule already points and needs no new edge in the graph.

- **The empty implementation returns no Samples, empty history, and a Summary of all-`down` over the real Roster.** That is not a stub standing in for correct behaviour — it is the correct behaviour for a fleet that has never produced a Sample, and the Status rule already says so.
- **`DELETE` calls `dropLink(id)` after the repository delete**, from this slice onward, with the empty implementation making it a no-op. Ticket `02` establishes that the order is load-bearing; encoding it now means the delete path is never revisited.
- **The next slice replaces the implementation and changes no controller.** That is the test of whether this port was drawn in the right place.

### Wiring in `apps/api`

Module registration only, per the apps-are-wiring-only rule. The global validation pipe and the exception filter are registered here; the interactive Swagger UI is **not** mounted in this slice, because its gate is a config variable and the config module belongs to ticket `05`. The generated document and the `createZodDto` DTOs land now; mounting the explorer behind `SWAGGER_UI_ENABLED` lands with the config module.

### The Nest test transform needs nothing

Seam 3 boots a Nest application under Vitest, so it depends on `design:paramtypes` metadata being present at test time. **No transform plugin is required and none should be added.** `emitDecoratorMetadata` in `tsconfig.base.json` is sufficient: Vite 8 transforms through rolldown/oxc, which honours the flag. ADR-0002 was substantially corrected on 2026-08-14 when this was measured on the real project, and `unplugin-swc` and `@swc/core` were removed as dead weight against the five-minute install budget.

`libs/server/health/src/lib/di-metadata.spec.ts` already guards this and passes — it asserts both that `design:paramtypes` is emitted and that Nest resolves a constructor dependency by type alone. If a Nest provider in this slice ever fails to resolve with `Nest can't resolve dependencies` while working in production, check that guard first: it isolates the transform from the module wiring.

One live hazard, from `ai-collaboration.md` entry 21: `@typescript-eslint/consistent-type-imports` erases the reference `emitDecoratorMetadata` builds `design:paramtypes` from, which broke Nest DI once already. It is disabled for `apps/api/**` and `libs/server/**` for that reason. This slice writes its first real Nest providers, so that exclusion must stay in place — and lint, `tsc` and `build` all passed while the API was dead, so it is not something the gates will catch.

## Testing Decisions

**What makes a good test here.** Assert what a caller outside the unit can observe, and nothing else. For `shared/domain` that means the return value of a pure function for a given input. For the repository it means the interface — never the backing `Map`, never a private index. For the API it means the HTTP status code and the response body — never a controller method, never a spy on the repository. A test that would break when the implementation is rewritten but the behaviour is unchanged is a test that will be deleted the first time someone rewrites it, so it should not be written.

**Clock and randomness are injected everywhere**, so no test sleeps and no test is flaky. The brief's bar is "fast, deterministic, no sleeps" and it is met by construction rather than by retry.

### Seam 1 — `shared/domain`, tested directly

Pure functions and schemas, no framework, no test harness beyond Vitest.

- `deriveStatus` **table-driven**, covering each threshold boundary on both sides — `snrDb` at 17.9/18 and 9.9/10, `throughputMbps` at exactly `0.6 * capacityMbps` and `0.2 * capacityMbps` — plus staleness at 4.9 s and 5.0 s, plus staleness taking precedence over otherwise-healthy metrics, plus no Sample at all.
- Schema accept/reject at every documented range boundary: `name` at 2/3/40/41 characters, `capacityMbps` at 9/10/1000/1001, `txPowerDbm` at −11/−10/30/31, `channelWidthMhz` accepting 20/40/80 and rejecting 60, and each Band and Mode literal.
- `linkPatchSchema` rejects a payload with no `version`, and accepts a payload with `version` and a single field.
- `zodIssuesToFieldIssues` maps nested and array paths onto dotted strings, since that mapping is the only place zod's world meets Angular's and it is small enough to test exhaustively.

### Seam 2 — `LinkRepository`, tested as a contract

A **reusable suite** — a `describe` block taking a factory that returns a fresh repository — run in this slice against `InMemoryLinkRepository`. It exists in this shape because ADR-0008's stated test is that swapping in a real store touches one file; a suite bound to the in-memory class could not verify that claim, and one taking a factory can be pointed at the replacement unchanged.

Covers: create then find by id; `findAll` filtering by Band and by `q` across name and both Sites; duplicate name refused on create and on update; `update` with the matching version succeeding and incrementing `version`; `update` with a stale version returning `{ ok: false, current }` with `current` at the newer version; `update` on an unknown id; `delete` returning true then false; `count` after each mutation; and that a Link returned from the repository is not the stored instance, so a caller mutating it cannot corrupt the store.

### Seam 3 — the HTTP boundary, and the one that carries the most weight

`supertest` against a Nest application assembled from the **real modules** — real repository, real pipe, real exception filter — with only the clock and the telemetry port substituted. M8 asks for "at least one HTTP-level test of the API contract", and the brief prefers one real contract test to twenty shallow ones, so this is where most behaviour is asserted.

One lifecycle run: seed present on boot → `POST` returns 201 with `version: 1` → `GET /api/links/:id` returns it with `latestSample: null` → `PATCH` with the correct version returns 200 at `version: 2` → `PATCH` again with version 1 returns **409 with the exact envelope**, `code` of `LINK_VERSION_CONFLICT` and `details.current` a full Link at version 2 → `DELETE` returns 204 → `GET` returns 404 with the envelope.

Alongside it: a `POST` with an out-of-range `capacityMbps` returning 400 with `VALIDATION_FAILED` and `details.issues` as `FieldIssue[]` naming the field; a `POST` with a duplicate name returning 409 `LINK_NAME_TAKEN`; `GET /api/links` with `status`, `band` and `q` filters and with each sort key; `GET /api/links/:id/telemetry` on an unknown Link returning 404; and `GET /api/fleet/summary` returning a total matching the seed count with every Link `down` and `worstLinkId` null.

**Every Link reading `down: stale` in this slice is asserted deliberately**, not tolerated. It is the behaviour the Status rule specifies for a fleet with no Samples, and pinning it now is what makes the next slice's arrival of real Samples a visible change rather than a silent one.

### Prior art

There is one real test in the workspace and it is worth reading before writing any of these: **`libs/server/health/src/lib/di-metadata.spec.ts`**. It is the working example of a Nest testing module under this workspace's Vitest setup, and it is what proves seam 3 can be built at all. Every other existing `.spec.ts` is a generator stub asserting that a stub class constructs; those are deleted as each library gains real content.

So this slice establishes the rest of the prior art the later slices follow: the table-driven pure-function tests, the factory-parameterised contract suite, and the supertest lifecycle run.

## Out of Scope

- **The Simulator, ring buffers and the `TelemetryBus`** — the next slice. This slice lands only the read interface they will implement.
- **SSE and `server/stream-api`** — all six events, the batched frame, `fleet.snapshot`, heartbeats and subscriber release. Pinned by ticket `01` and ADR-0004/0005; none of it is built here.
- **The whole Console** — `console/data-access`, all three feature libraries, `console/ui`. No Angular code in this slice.
- **The config module and `.env.example`** — ticket `05`. This slice therefore does not mount the Swagger explorer, though it does generate the document.
- **`server/health`** — ticket `06`, and it depends on counters this slice does not produce.
- **A2UI, both `shared/a2ui-protocol` and `server/a2ui-agent`** — tickets `04` and B2.
- **Graceful shutdown** — `enableShutdownHooks()` and `OnApplicationShutdown` exist to stop the Simulator interval and complete the bus, neither of which exists yet. It lands with the thing it stops.
- **Real persistence.** The brief mandates in-memory behind an interface; that interface is the deliverable here and a database is not.
- **README sections.** Documentation lands in the commit that makes it true, so the API reference and the error-envelope table are written by the commits in this slice, not planned as separate work.

## Further Notes

- **Where this slice's rationale already lives**, and is deliberately not restated: ADR-0006 (one zod schema as the contract), ADR-0008 (the repository interface carries the version check), ADR-0009 (the three tag axes), and tickets `02`, `07`, `08`, `10`, `12`, `13`. Where a document here and an ADR disagree, the ADR wins.
- **`plan.md` §3 and §4 must not be inherited verbatim.** §3 still describes a hand-rolled `ZodValidationPipe` that `nestjs-zod` replaces, and §4 covers edit without create, which ticket `13` records as a required-scope gap.
- **The dependency rule should be tested by violating it once.** Before this slice closes, introduce a deliberate import from `shared/domain` into `server/links-data-access`'s direction of travel — or any edge the rule forbids — confirm `pnpm lint` fails, and revert. Asserting that a lint rule bites without checking is the failure mode that produced entries 01–05 of `docs/decisions/ai-collaboration.md`.
- **Commits follow conventional commits and land documentation with the change**, per the repo's existing history and the rule in `map.md`.
- **The natural next slice is telemetry** — Simulator, ring buffers, bus, and the real `TelemetryPort` implementation — because it fills an interface this slice has already pinned and turns every `down: stale` in the contract tests into live data.
