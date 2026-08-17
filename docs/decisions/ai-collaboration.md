# AI Collaboration Log

A running record of where an AI tool's proposal was changed before it reached the codebase, and why.

The assignment asks for two things this file feeds:

- *"Note in the README how you used them"* — the usage summary at the bottom.
- *"How you used AI tools, and one place where you overrode what the tool suggested"* (README §12) — pick the strongest `Human → AI` entry below.

## How to read the direction field

- **`Human → AI`** — a human rejected or amended what the tool proposed. **These are the entries README §12 asks for.**
- **`AI → AI`** — the tool caught an error in its own earlier output, usually by checking a fact it had previously assumed. Evidence the verification loop works; not what §12 is asking about.

## Entries

### 01 — Hand-pinned TypeScript 5.9.3 could not build Angular 22

**2026-08-14 · `AI → AI` · environment setup**

An earlier session wrote a `package.json` pinning `typescript: 5.9.3` alongside Angular 22.1.2, under a heading claiming the toolchain had been "verified against the live npm registry." It had been verified to *exist*, not to be mutually compatible. `@angular/compiler-cli@22.1.2` declares `typescript: >=6.0 <6.1`; `ngtsc` enforces that with a hard error. The build could never have succeeded.

**Resolution:** stop hand-pinning. `@nx/js@23.1.1` installs `typescript ~6.0.3` on its own.

### 02 — Hand-pinned Vitest 3 against a framework requiring Vitest 4

**2026-08-14 · `AI → AI` · environment setup**

The same `package.json` pinned `vitest ^3.0.7`. `@angular/build@22.1.2` declares `vitest ^4.0.8`. Separately, the plan called for a root `vitest.workspace.ts` — a file concept that does not exist in vitest 4 (grep of the published `dist`: zero occurrences). Two errors compounding: the wrong major, and a config file that would have been silently ignored.

**Resolution:** Nx-managed vitest (`^4.0.8` via `@nx/angular`), and `test.projects` in a root `vitest.config.ts`.

### 03 — `nx init` described as detecting a `package.json` it would actually overwrite

**2026-08-14 · `AI → AI` · environment setup**

The setup plan opened with "`npx nx init` initializes Nx in-place, detecting our pinned `package.json`." The premise was inverted: that `package.json` was itself agent-written, and `nx init` is a tool for adopting Nx into a project, not for honouring a hand-authored dependency set.

**Resolution:** delete the hand-written config and let init and the generators supply versions.

### 04 — `npx nx init` would have silently converted the repo to npm

**2026-08-14 · `AI → AI` · environment setup**

The plan offered `pnpm dlx nx@23.1.1 init` and `npx nx@23.1.1 init` as interchangeable. Reading `detectPackageManager` in Nx 23.1.1 shows the fallback chain ends at `npm_config_user_agent`, defaulting to npm. With no lockfile present — the actual state of this repo — `npx` would have run `npm install` and written `package-lock.json`, quietly discarding the pnpm decision and its phantom-dependency rationale.

**Resolution:** `pnpm dlx` only, stated as a rule in the plan.

### 05 — Generator invocations used a syntax Nx 23 no longer accepts

**2026-08-14 · `AI → AI` · environment setup**

The plan wrote `@nx/nest:app api --directory=apps/api`. In Nx 23 both app generators declare `directory` as required and bound to positional argument 0. Related: `@nx/angular:app` defaults `e2eTestRunner` to `playwright`, so the plan as written would have scaffolded an unwanted e2e project and a browser download — directly against the assignment's five-minute clean-machine bar.

**Resolution:** positional directory, and `--e2eTestRunner=none` on both apps.

### 06 — Rejected "keep the hand-written config" in favour of a clean `nx init`

**2026-08-14 · `Human → AI` · environment setup**

Presented with the choice between keeping the hand-written `nx.json`/`package.json`/`tsconfig.base.json` and starting over with `nx init`, the tool recommended keeping them, arguing they were more deliberate than what init produces — they already encoded the twelve path aliases and the scope tags.

**Overridden.** The reasoning was that config authored by an agent and never validated is not "deliberate," it is merely specific; and that industry-standard Nx conventions are worth more here than preserved intent, because a reviewer can recognise the former. Entries 01 and 02 are the direct evidence: both wrong pins lived in exactly the files the tool wanted to keep.

**Consequence:** the whole plan re-sequenced around `nx init`, which surfaced entries 04 and 05.

### 07 — Rejected "bump to latest Angular" in favour of Nx's tested pin

**2026-08-14 · `Human → AI` · environment setup**

Having established a general preference for latest versions, the tool proposed generating on Nx's `~22.0.4` and then immediately bumping to Angular 22.1.4 as a separate bisectable commit.

**Overridden** — Nx-managed, no bump. The version Nx's generators and migrations are tested against is worth more than three patch releases, and "latest is greatest" was never meant to override a framework's own tested matrix. The tool's own principle, applied without the constraint attached to it.

### 08 — Rejected `git stash -u` as unnecessary ceremony

**2026-08-14 · `Human → AI` · environment setup**

The tool proposed stashing the config files before deleting them, having first warned that a plain `git stash -u` would sweep up `plan.md`, `.scratch/` and the rest of the untracked tree.

**Overridden** — just delete them. Nothing was committed, so there was no commit to protect, and the files were being replaced precisely because they were wrong. The tool had correctly identified the blast radius but then proposed a narrower version of the same unnecessary step rather than questioning whether the step was needed at all.

**Consequence:** Step 0 copies the three files to a scratch directory purely so six npm scripts and twelve path aliases don't get retyped, then deletes them.

### 09 — A plan review invented a Jest dependency that does not exist, and missed the real blocker

**2026-08-14 · `AI → AI` · testing**

An AI-generated review of the plan warned that "NestJS's `Test.createTestingModule()` and its jest-mock dependencies assume Jest," and recommended restructuring the backend test strategy around avoiding `@nestjs/testing`.

`@nestjs/testing@11` declares exactly one dependency: `tslib`. No `jest`, no `jest-mock`. The premise was invented.

Worse, the recommended workaround would not have helped even if the premise had been true. The actual blocker is that **Vitest transforms TypeScript with esbuild, which does not implement `emitDecoratorMetadata`** — so `design:paramtypes` is never emitted and Nest cannot resolve constructor dependencies by type. That bites the supertest contract test too, because it boots the real Nest app under the same transform. Avoiding `@nestjs/testing` dodges nothing.

**Resolution:** `unplugin-swc` with `decoratorMetadata: true` on the five Nest Vitest projects → ADR-0002. Verified alongside it that `tsc@6.0.3` still ships both decorator flags, so the production build was never at risk.

### 10 — Overrode "drop OpenAPI entirely" after a question about cost

**2026-08-14 · `Human → AI` · API documentation**

Both the review and the tool agreed: pick the README table, skip Swagger, on the grounds that annotating DTOs is "~30 minutes of mechanical work" that is easy to forget under time pressure. The tool recommended dropping OpenAPI outright.

**Overridden** — the human did not accept the recommendation and instead asked what the overhead actually was and whether it could be deferred. Measuring it inverted the answer twice over. The 30-minute estimate assumed **class DTOs**, an architecture this project had already rejected: types are `z.infer`'d, so there is nothing to hang `@ApiProperty()` on, and doing it properly would have meant hand-writing parallel DTO classes — hours of work that would have destroyed the single-source-of-truth argument that is one of README §12's three defended decisions. Meanwhile zod 4 ships `z.toJSONSchema()`, which makes a real OpenAPI document nearly free and needs no `@nestjs/swagger` at all — avoiding 11.7 MB of `swagger-ui-dist` against a five-minute clean-machine install bar.

**Consequence:** OpenAPI kept, generated from the shared schemas, deferred to Day 3 with `nestjs-zod@5.5.0` as the documented fallback. Both AI positions — "do Swagger properly" and "skip it" — were wrong, and the estimate that anchored them was quietly assuming an architecture that did not exist.

### 11 — "Is this over-engineering?" demoted a header and promoted the mechanism that mattered

**2026-08-14 · `Human → AI` · streaming**

The plan listed `X-Accel-Buffering: no` and SSE heartbeat comment lines in the same breath, and the review proposed a README troubleshooting section framing the header correctly for nginx deployments. Asked directly whether this was over-engineering or premature optimisation, the tool had to answer that it was neither — one response header costs nothing — but that the *treatment* was disproportionate.

**Overridden in scope.** The header stays; its README section is cut to a single line, because a reviewer evaluating locally will never be behind nginx. More usefully, the question exposed a flattening: **heartbeats are the load-bearing anti-stall mechanism**, defending against idle-connection timeouts that can bite locally and through any proxy, and the plan had given them the same apparent weight as a hedge. Heartbeats now get a design decision and a test; the header gets one line in each of code and README. Also recorded: whether the Angular dev-server proxy streams unbuffered is to be **verified** with `curl -N` through port 4200, not asserted.

### 12 — Rejected a wall-clock stop on Nx scaffolding

**2026-08-14 · `AI → AI` · process**

The review proposed a hard two-hour stop on Nx scaffolding plus boundary verification, after which the project would fall back to pnpm workspaces.

Rejected. The setup plan already had a de-risking mechanism — Step 2's dry-run of `nx init` on a throwaway copy — which fails cheaply and *diagnostically*, whereas a timer can fire while the dry-run is still producing useful information. The fallback is also not free: B1 is an explicitly named bonus, and dropping Nx forfeits the `nx graph` output promised in `plan.md` §1 and README §7.

**Resolution:** the fallback trigger is evidence from Step 2, not elapsed time. Recorded in the setup plan at Step 2 rather than as a separate rule, so it sits where the decision would actually be made.

### 13 — Cut a promised ADR that did not earn one

**2026-08-14 · `AI → AI` · documentation**

The setup plan promised `0003-zod-4.md` as one of three ADRs. Applying the bar — hard to reverse, surprising without context, the result of a real trade-off — it fails two of three: choosing the current major of a library already decided on is not surprising and had no genuine alternative. Writing it would have padded the record and diluted the ADRs that do carry weight.

**Resolution:** cut to a row in ADR-0001. The seven surviving ADRs are a superset of README §12's three, and §12 selects the product decisions a reviewer can argue with rather than the toolchain ones, where there was only ever one right answer once the facts were checked.

### 14 — Advice to sound more like a real product came with a fabricated product

**2026-08-14 · `AI → AI` · documentation**

An AI tool argued — correctly — that ADRs justifying choices by citing milestone and bonus ids read like homework rather than engineering, and that the committed documentation should be written in product terms instead. It supplied a table of replacement rationales.

The stance was right. Every specific in the table was invented, and one contradicted its own source:

| Proposed rationale | What the source actually says |
|---|---|
| "deterministic memory cap (**<50 MB**) on embedded field gateways" | No figure exists. The instruction is to pick the buffer size and say why |
| "constrained out-of-band management channels… avoids **saturating the radio channel**" | The stated reason for coalescing is that the UI must not re-render once per message per link — a rendering concern, not a bandwidth one |
| "**field technicians** and automated orchestration scripts… disrupt **cell tower backhauls**" | "Link was modified by someone else" |

The third row is the instructive one: it would have replaced a correct, sourced rationale in ADR-0004 with a fabricated one. Against a standing rule that every line must be explainable on demand, inventing a deployment topology manufactures lines that cannot be defended — to an audience that builds the actual product and knows its own link budget.

The tool had also placed ADRs outside the graded surface, when a short ADR or two is itself part of what was asked for.

**Resolution:** adopt the stance, reject the specifics. The product framing was already available from the source and did not need inventing — a management UI served next to the device, an embedded host, long-lived, where a stall or a leak is a customer-visible fault. Fourteen phrases were rewritten across seven ADRs, the rule was recorded in `AGENTS.md` with two explicit limits — never invent product facts, never replace a true reason with a better-sounding one — and the gitignored working documents keep the requirement vocabulary, because that is where coverage is tracked.

Worth noting what the measurement showed: the contamination was fourteen phrases, not a pervasive stance problem, and `CONTEXT.md` was already clean. The advice described a rewrite; the evidence supported a copy-edit.

### 15 — Overrode a rewrite of a glossary term that was already right

**2026-08-14 · `Human → AI` · documentation**

Applying entry 14, the tool proposed replacing `CONTEXT.md`'s opening — "An operator console for a fleet of point-to-point radio links" — with source-quoted phrasing about a management UI served next to the device.

**Overridden**: "operator console" stayed. It is the better term — shorter, already the project's own word, and it names the reader rather than the deployment. Having just decided to write in product language, the tool immediately over-applied it and started editing text that was already in product language. Adopting a rule is not a licence to rewrite what already satisfied it.

### 16 — Overrode "no Swagger" after the deciding argument failed a sanity check

**2026-08-14 · `Human → AI` · API documentation**

Entry 10 records the tool being reversed once on OpenAPI. This is the second reversal, in the opposite direction, and it is the tool's own fault.

Having been pushed to measure the cost of `@nestjs/swagger`, the tool produced two objections: it expects class DTOs this codebase does not have, and it drags in `swagger-ui-dist` at **11.7 MB unpacked** "against a five-minute install budget." The first objection was sound. The second was arithmetic the tool never did: 11.7 MB is roughly **1% of an Nx + Angular + Nest `node_modules`**, and does not move install time at all. A real number was quoted without its denominator, which made a rounding error look like a constraint.

Asked whether Swagger could simply be included cleanly during implementation, the tool checked `nestjs-zod@5.5.0` properly and found the first objection dissolves too: `createZodDto(schema)` generates the DTO class *from* the shared schema, so there is still one source of truth, and the package additionally supplies the `ZodValidationPipe` the plan had specified as ~15 hand-rolled lines. The chosen route was **more** code than the rejected one.

**Overridden:** `@nestjs/swagger` + `nestjs-zod`, wired from the first endpoint rather than bolted on at the end, since retrofitting means rewriting every DTO signature.

**Consequence:** grilling the reversal surfaced a decision nobody had made — whether an unauthenticated interactive API explorer capable of `DELETE`ing a link should be mounted on a console that manages live radio links. It is now gated behind a config flag. ADR-0001 and ADR-0006 rewritten.

The pattern worth naming: a specific-looking measurement is not a checked one. "11.7 MB" survived three sessions unchallenged because it had a decimal point in it.

### 17 — Removed the AI co-author trailer from commits

**2026-08-14 · `Human → AI` · process**

The tool's default is to append a `Co-Authored-By: Claude Opus 5` trailer to every commit. It flagged this before the first commit rather than doing it silently, and recommended against it.

**Confirmed: no trailer.** AI usage is disclosed deliberately and in detail — this file, and a dedicated README section — which is a more informative disclosure than a line repeated on every commit, and it keeps the disclosure somewhere it can be read as a whole rather than inferred from a log.

### 18 — Nearly re-pinned a pnpm version that had never run here

**2026-08-14 · `AI → AI` · environment setup**

`nx init` omitted the `packageManager` field, exactly as the setup plan predicted it would, and the plan's instruction was simply to "re-add it". Doing that literally would have written `pnpm@10.29.1` — the version recorded in ADR-0001 and carried through every planning document.

The machine runs **pnpm 11.21.0**, and pnpm 11 is what wrote `pnpm-lock.yaml`. Restoring `10.29.1` would have pinned a package manager that has never once resolved this dependency graph, and `corepack enable` would then fetch pnpm 10 on the reviewer's clean machine — where any resolution difference between the two majors surfaces as a `--frozen-lockfile` failure on the one install that has to work first time.

**Resolution:** pinned `pnpm@11.21.0`, and ADR-0001 corrected. Checking rather than assuming also disposed of the scarier hypothesis: both majors write `lockfileVersion: '9.0'`, so the format was never the risk.

**The pattern, and why it is entry three of its kind.** ADR-0001's Corrections 1 and 2 are both "a version verified to *exist* treated as a version verified to *work*." This is the same error in different clothes: a version verified in a *plan* treated as verified in the *environment*. A plan's facts have a shelf life, so the pin is now specified as "whatever wrote the lockfile", re-read at the point of use.

### 19 — Corrected the unitTestRunner flag from `vitest` to `vitest-angular`

**2026-08-14 · `Human → AI` · tooling**

The plan artifact for `@nx/angular` configuration specified `"unitTestRunner": "vitest"` in `nx.json` generator defaults.

**Overridden by human.** The human asked whether the runner flag should be `"vitest-angular"`. Verifying the primary source — `application/schema.json` and `library/schema.json` in `@nx/angular@23.1.1` — confirmed the accepted enum is `['vitest-angular', 'vitest-analog', 'jest', 'none']`. Using `"vitest"` would have failed generator schema validation during scaffolding.

**Resolution:** `nx.json` generator defaults and the execution plan updated to `"unitTestRunner": "vitest-angular"`.

**Amended when it ran.** `vitest-angular` is valid but rejected for libraries that are not buildable, which all five Console libraries are. They generate with **`vitest-analog`** instead — still Vitest, so the single-runner decision survives. The applications keep `vitest-angular`.

### 20 — An entire ADR defended a plugin that does nothing

**2026-08-14 · `AI → AI` · testing**

ADR-0002 mandated `unplugin-swc` with `decoratorMetadata: true` on all five Nest test projects, on the stated grounds that "Vitest transforms TypeScript with esbuild, which does not implement `emitDecoratorMetadata`." Entry 09 shows how hard that reasoning was fought for — it was itself the correction to an AI review that had invented a different problem.

It is false here. Vite **8.2.1** depends on `rolldown`, not `esbuild`, and rolldown transforms through oxc, which honours the flag.

Caught only because the plugin was wired up and then **checked** rather than assumed load-bearing. A test asserting both `design:paramtypes` emission and real Nest constructor injection passed with the plugin removed; passed again with every plugin removed; and passed a third time with `emitDecoratorMetadata` stripped from the spec tsconfig — which located the live setting in `tsconfig.base.json`.

**Resolution:** `unplugin-swc` and `@swc/core` removed, ADR-0002 rewritten around what was measured, and the probe kept as a permanent guard test so a future toolchain change fails one obvious test rather than every DI test at once.

**Why this is worse than entries 01–05.** Those were wrong versions, and wrong versions announce themselves — the build refuses to start. This would never have failed. Five config files would have carried a plugin doing nothing, a large native dependency would have sat inside a five-minute install budget, and the ADR defending it was the most carefully argued document in the repo. Being well-reasoned is not the same as being true, and a sound argument from a stale premise is the hardest kind to catch.

### 21 — A lint rule added for rigour silently broke the API

**2026-08-14 · `AI → AI` · tooling**

`@typescript-eslint/consistent-type-imports` went in as part of the ruleset adopted in ticket `15`, on the stated grounds that erasing type imports keeps types out of the runtime bundle. Its `--fix` pass rewrote `import { AppService }` to `import { type AppService }` in `app.controller.ts`, because the class appears only as the type of an injected constructor parameter.

That erases the reference `emitDecoratorMetadata` builds `design:paramtypes` from, so Nest recorded `Object` and refused to boot: *"Nest can't resolve dependencies of the AppController."*

**Caught only by running the application.** Lint passed, `tsc` passed, `nx build` passed, all fifteen projects were green, and four commits had already landed on top of it. `pnpm start` had never been run — the first time it was, the API died and the Console came up fine.

There was a second trap inside the first: `curl http://localhost:4200/api` returned **HTTP 200** while the API was down, because the Angular dev server answers unmatched paths with `index.html`. A status check alone would have reported a working proxy over a dead API. Ticket `05` had already insisted proxy behaviour be verified rather than asserted; what it did not say is that the assertion has to be on the **body**, not the status.

**Resolution:** rule disabled for `apps/api/**` and `libs/server/**` — it buys bundle hygiene and the server has no bundle budget. Kept for the Console, where bundle size is real and `inject()` is the idiom. Proxy config added and verified by body content.

**The pattern.** This ruleset was adopted to make failures loud. One of its rules made a failure silent, and every automated gate in the repo agreed the code was fine. Green checks describe the checks that exist, not the program.

### 22 — Praised a spec for catching a prerequisite that ADR-0002 had already debunked

**2026-08-15 · `Human → AI` · testing / architecture**

When comparing `spec-foundation.md` against `spec.md`, the AI praised `spec-foundation.md` for identifying a "critical prerequisite" that `unplugin-swc` was missing from `package.json` and needed wiring for Nest DI under Vitest.

**Overridden by human ("for 3, check ADR2").** Checking ADR-0002 and `di-metadata.spec.ts` revealed that ADR-0002 was substantially corrected on 2026-08-14: Vite 8.2.1 transforms via rolldown/oxc, which implements `emitDecoratorMetadata` natively without plugins. `unplugin-swc` and `@swc/core` were deliberately stripped as dead weight, and `server-health`'s guard test passes out of the box.

`spec-foundation.md` had carried forward an uncorrected draft premise from before ADR-0002's correction. The AI treated this stale assumption as an insight rather than checking the ADR and running the guard test first.

### 23 — A result type's own review caught what extending it by analogy left out

**2026-08-15 · `AI → AI` · ticket 18, server API**

Ticket 18 changed `LinkRepository.create()` from returning a bare `Link` to a discriminated result — `{ ok: true, link } | { ok: false, reason: 'name-taken' }` — reasoning by analogy to `update()`'s result shape from ADR-0008, a call confirmed with the user before writing it. The analogy was sound, but two things that made the original safe didn't come along with it, and both slipped through until code review found them: the controller collapsed every failure into `LinkNameTakenError` by checking only `result.ok`, never narrowing on `result.reason`, so a second failure reason added by a later ticket would compile unchanged and be silently mislabelled; and ADR-0008's own decision table still showed `create(draft) → Link`, the signature the diff had just replaced, so the doc and the code had already diverged in the same commit that cited the doc.

**Resolution:** the controller now switches on `result.reason` with no `default` case, which `noImplicitReturns` (already on in `tsconfig.base.json`) turns into a compile error the moment an uncovered reason is added — the same exhaustiveness the codebase already gets for free from `ApiErrorCode` and `LinkStatus`. ADR-0008's table and prose were updated to show the actual signature, with a note that the result shape was added in ticket 18 rather than foreseen when the ADR was first written.

**The pattern.** Both gaps have the same root cause: extending an established interface by analogy — "this should look like `update`'s result" — carries the shape of the original decision but not the guarantees that made it safe. Exhaustiveness and up-to-date documentation don't follow automatically just because the new code cites the old decision in a comment; each has to be re-earned at the new call site. Caught only because code review was run before committing, not because anything failed loudly on its own — the same category as entries 20 and 21.

### 24 — Declined a review's fix because the spec's own silence was the answer

**2026-08-15 · `Human → AI` · ticket 18, server API**

The same code review that produced entry 23 also flagged `InMemoryLinkRepository`'s duplicate-name check — plain `===` — on the grounds that `"Depot Link"` and `"depot link"`, or a stray leading space, would both be accepted as distinct Links, against the ticket's own stated rationale: "two Links with the same name are indistinguishable in a list." The finding was real and the reasoning behind it was sound.

**Declined by the human, on a question rather than an assertion.** Asked directly whether to trim-and-case-fold the comparison, the human chose to leave it exact. The deciding fact wasn't in the finding — it was what `spec-foundation.md`'s testing decisions say elsewhere in the same document: the `q` free-text filter is specified as explicitly case-insensitive, and name uniqueness is not. Where the spec wanted case-insensitivity it said so; where it didn't say so here, that reads as a boundary the spec drew on purpose, not an oversight. Adding fuzzy matching would have been solving a problem the spec doesn't ask this ticket to solve, with its own unstated rules — which whitespace to strip, whether to fold Unicode case — that nothing in this slice specifies either.

**The pattern.** A code review's finding can be correct about the code and still be arguing for scope the spec never asked for. The tell here wasn't in the finding itself, it was in what the rest of the same source document chose to say explicitly about a sibling rule and chose not to say about this one — the same kind of check entry 22 used against a stale premise, applied here against a plausible-sounding scope expansion instead.

---

### 25 — Rejected a horizontal layer-cake breakdown for Telemetry tickets

**2026-08-15 · `Human → AI` · telemetry tickets**

The AI proposed breaking the `spec-telemetry.md` work into three tickets sliced by architectural layer: one for the `RingBuffer` data structure, one for the `Simulator` ticking engine, and one to wire them into the live `SimulatorTelemetryPort`. 

**Overridden by the human.** The human rejected this as a "horizontal layer cake" disguised as tickets. Slicing by architecture violates the rule that each ticket must cut a narrow, complete path through all layers and be independently verifiable. A ticket that only builds a `RingBuffer` produces no observable change in the application. Furthermore, the AI's breakdown deferred the teardown hooks (`clearInterval` and `TelemetryBus.complete()`) to a later ticket, directly violating the spec's warning that timer and memory leaks must be closed in the same ticket that opens them.

**Resolution:** The tickets were re-sliced vertically by product behaviour. Ticket 24 now delivers the entire end-to-end "happy path" (the ticking Simulator wired into the live API, complete with both leak closures), and ticket 25 layers on the Degradation Episodes business logic.

---

### 26 — Misattributed what `app.enableShutdownHooks()` actually gates

**2026-08-15 · `AI → AI` · ticket 24, server API**

Ticket 24's first pass wired `app.enableShutdownHooks()` into `apps/api/main.ts` and every test app instance, with a comment claiming it was "required for the Simulator's `OnApplicationShutdown` hook to fire at all — without it, `app.close()` leaves the Simulator's interval and `TelemetryBus` running past shutdown."

A code review flagged the claim as unverified. Checked directly against the installed `@nestjs/core` source: `NestApplicationContext.close()` calls `callDestroyHook`, `callBeforeShutdownHook`, `dispose` and `callShutdownHook` — the chain that invokes `onApplicationShutdown` — unconditionally, with no guard on whether `enableShutdownHooks()` was ever called. A throwaway spec confirmed it experimentally: a bare `app.close()` fired a probe provider's `onApplicationShutdown` with no `enableShutdownHooks()` call anywhere in the setup. `enableShutdownHooks()`'s actual job is registering the SIGTERM/SIGINT listener that invokes `close()` in the first place — load-bearing in `main.ts`, since that process never calls `close()` itself, but no-op busywork in every test that already calls `app.close()` directly.

**Resolution:** the `main.ts` comment was corrected to name the real mechanism. The now-pointless `enableShutdownHooks()` calls were removed from the two general-purpose test helpers in `server-links-api.module.spec.ts`; the one call kept was in the dedicated shutdown test, re-captioned as mirroring production wiring rather than being load-bearing for that test's own assertions.

---

### 27 — Over-applying assignment guidelines and misidentifying required scope

**2026-08-15 · `Human → AI` · ticket 24, telemetry and domain**

The AI proposed a plan that would convert the assignment PDF's illustrative telemetry ranges (`-30..-90` for RSSI, `0..40` for SNR) into hard Zod schema constraints (`.min()/.max()`). The same plan also proposed deleting `TelemetryBus` on the grounds of "speculative generality," and re-extracting a test factory (`link()`) that had already been extracted in an earlier commit on the active branch.

**Overridden by the human.** The human rejected all three parts of the plan:
1. The PDF explicitly disclaims those ranges as "a starting point, not a specification. Tighten them if you can justify it." Enforcing them as hard schema bounds is the opposite of the assignment's intent. The correct fix is to re-ground the simulator's internal constants (`RSSI_FLOOR_DBM`, `SNR_FLOOR_DB`, `SNR_CEILING_DB`) to match these values (leaving a little headroom for ticket 25), and cite the PDF in the comments instead of inventing a "sanity backstop."
2. `TelemetryBus` is not speculative generality—it is the explicit seam required for the M4 (Live stream over SSE) requirement. Deleting a component built for a known, imminent, mandatory requirement is not YAGNI.
3. The AI failed to check the current branch state, planning work that was already shipped.

**Resolution:** The plan was scrapped. A targeted follow-up was executed to strictly update the simulator's constants (`-90` for RSSI floor, `-5..42` for SNR bounds) and document the source of those numbers.

---

### 28 — Surfaced a fleet-scale ambiguity in the Degradation Episode probability, deferred rather than fixed blind

**2026-08-16 · `AI → Human` · ticket 25, telemetry**

A design-tree review of `25`'s shipped code (independent of the code review that landed with the commit) raised three ambiguities. Two — a cooldown between episodes, and a Link starting already degraded on its first-ever Tick — were already settled: the first by YAGNI (no acceptance criterion asks for it, and it's already vanishingly rare), the second by the code-review fix already in `454d594` (an explicit comment accepting the rarity, matching the ticket's own "on any Tick" wording).

The third had no existing answer. `START_PROBABILITY = 0.01` is flat and per-Link, so the *fraction* of the fleet mid-episode at steady state (~10.4%, from `avg_duration / (1/p + avg_duration - 1)`) stays constant regardless of Roster size, but the *count* scales linearly — ~1.1 Links at the actual seeded fleet of 10, ~104 at a hypothetical 1,000. The AI's first instinct was to propose a fix (lower the flat rate to 0.1%) rather than surface it as an open question — which, checked against the actual 10-Link fleet, would have made episodes nearly invisible (~0.11 Links degraded on average) in the one fleet size this codebase actually runs, trading a hypothetical problem for a real regression against `25`'s own stated purpose.

**Resolution:** asked the human directly rather than picking a number. Recorded as `26` (`ready-for-human`, unresolved) instead of changed in place — no fleet-size intent is stated anywhere in this codebase's tickets or `CONTEXT.md`, and `25`'s own acceptance criterion only required "fixed, low, testable," which `1%` already satisfies. `25` needed no rework either way.

**Follow-up, 2026-08-16:** the human confirmed the fleet never grows meaningfully past the seeded handful of Links — the 1,000-Link scenario was a hypothetical stress case, not a real one. `26` closed as moot; `START_PROBABILITY` stays at `1%` with no code change.

---

## Usage summary (draft for README §12)

Claude Code (Opus 5) was used for architecture exploration, plan review, and scaffolding. The working pattern was adversarial rather than generative: plans were put through a structured grilling skill that forces every claim to be checked against a primary source — the npm registry, or the published source of the tool being invoked — before it can be accepted.

That pattern is what produced entries 01–05. Every one of them is a case of the tool contradicting its own earlier output once a fact was actually verified, and each would have been a build failure or a silent misconfiguration if the plan had been executed as first written.

Entry 09 shows the same pattern applied to an AI-generated *review* of the plan rather than the plan itself: the review invented a dependency that does not exist and missed the real defect, which sat one layer beneath it. Adversarial review is only worth what its facts are worth.

Entries 06–08, 10–11, and 19 run the other way — a human changing the outcome.

**Entry 10 is the one to expand for §12.** The tool recommended dropping OpenAPI entirely, and the human did not overrule it — they asked what it would actually cost and whether it could wait. Measuring it reversed the recommendation, because the "~30 minutes of mechanical work" estimate everyone was reasoning from silently assumed class-based DTOs, an architecture this project had already rejected. Both AI positions were downstream of an estimate that did not match the codebase, and neither had noticed.

Entry 06 is the alternative candidate and a cleaner narrative — the tool argued to preserve hand-written configuration on the grounds that it was more deliberate than generated defaults, mistaking specificity for judgement, when that configuration contained two version pins that made the project unbuildable. Entry 10 is the stronger one to tell, because the override came from a *question* rather than an assertion, and because the failure mode it exposes — an estimate quietly assuming the wrong architecture — is harder to catch than a wrong version pin.

---

### 29 — Inventing gaps in a complete specification by ignoring architectural constraints

**2026-08-16 · `Human → AI` · spec-streaming**

The AI attempted to grill the human on `spec-streaming.md`, proposing three "frontier" questions: a race condition where a client misses a Tick while connecting, a concern about losing transient Roster states within a single 1s Tick, and a proposal to recover gracefully from a crash in the shared RxJS stream. 

**Overridden by the human.** The human instructed the AI to actually check the assignment mandates.
1. The "race condition" is impossible in the chosen architecture: the snapshot read and RxJS subscription happen synchronously in the same Node.js event loop cycle, so the `setInterval` Tick cannot interrupt them. 
2. The "loss of transient states" is an explicit requirement: the assignment (M4) mandates "coalesce or throttle so the UI is not re-rendered once per message per link". A per-Tick diff inherently satisfies this.
3. Catching and recovering from an RxJS stream crash hides a catastrophic server bug; standard Node.js fail-fast practices apply, relying on the process manager to restart.

**Resolution:** The questions were abandoned. The AI confirmed that the `spec-streaming.md` frontier is genuinely empty, as the spec completely covers the M4 mandate without any open design decisions.

---

### 30 — Two corrections on the SSE baseline flood: a review's diagnosis, and a test that passed without the fix

**2026-08-16 · `AI → AI` · ticket 30, streaming**

An AI review of a captured `/api/stream` session flagged a real defect — a client connecting at Tick 16 was told at Tick 17 that all ten Links had just transitioned out of `down: stale` — and diagnosed it as the diff engine "initializing its previous state as completely down (stale)", prescribing that the baseline be primed with the simulator's actual starting state.

**Corrected after reading the code.** That priming already existed, in `FleetEventStream`'s constructor, and was the attempted fix rather than the flaw. The actual mechanism is that the Tick pipeline sits under a ref-counted `share()`, so the diff does not run until the first client subscribes: seeded eagerly, diffed lazily. Priming harder at construction cannot help, because the error scales with the gap between construction and first subscribe. The review also framed the flood as boot-only ("other than that initial flood on Tick 17"), when `share()` resets at a ref-count of zero and reopens the same gap on every reconnect after the last client leaves — which, at `retry: 3000`, is routine.

**A second correction, this one self-inflicted.** The first reconnect test asserted that a Status transition across the unwatched gap carried a `previous` matching the new client's Snapshot. It passed **without the fix**, and was only caught by running it against the stashed pre-fix source rather than trusting that a newly written test must be red. It had been waiting on the Simulator to drive a Degradation Episode through those twenty Ticks and calling that a pin. Making it deterministic through configuration does not work either — `capacityMbps` is schema-capped at 1000 and the Simulator scales Throughput to Capacity, so a raised Capacity returns the Status to where it started within a Tick or two. The slice was rewritten around membership (`link.created`/`link.deleted` across the gap), which is deterministic and exercises the identical seeding path.

**Resolution:** the baseline is now seeded on every subscription of the shared pipeline rather than once at construction; recorded as an amendment to ADR-0004 and as a client-facing guarantee in the README's event catalogue. The general lesson is the one entry 09 already records — an adversarial review is only worth what its facts are worth — with a corollary for tests: a test is only a pin once it has been observed to fail.

---

### 31 — A two-axis review of ticket 33 found seven defects the commit's own verification had passed

**2026-08-16 · `AI → AI` · ticket 33, console**

The Link detail commit shipped with all fifteen projects green — lint, typecheck, test, production build — and a commit body asserting the properties the ticket asked for. A review against the ticket and against `CONTEXT.md`/the ADRs, run as two independent passes so neither could mask the other, found seven defects underneath that green. Three matter beyond their own fix.

**A signal read but never subscribed to.** `LinkHistory`'s append effect read `store.latestSample()` and a plain field, `currentLinkId`. The field is not reactive, so setting it in `load()` did not re-run the effect: a Sample already in the store when the operator drilled in was skipped until the next Tick arrived. Every existing test pushed a Sample *after* `load()`, which is the one ordering that hides it.

**An error taxonomy collapsed at the point of use.** The route mapped *any* HTTP failure to not-found. `CONTEXT.md` distinguishes an Error Envelope ("the Server said no") from a Transport Failure ("the Server did not answer") precisely so a 502 is never rendered as a deletion, and the ticket's own reasoning — only the Server can tell *deleted* from *not yet streamed* — is the argument against doing it. A timeout was asserting a fact nobody had established.

**A bound documented but not held.** The buffer capped on read and pruned only above twice the cap, so the chart looked bounded at 300 while the map held up to 600. `CONTEXT.md`'s Leak entry says "no leaks" is a claim that has to be demonstrated rather than asserted; a comment claiming a bound the storage does not hold is the assertion standing in for the demonstration.

Also fixed: the Capacity reference line drew at `y=0`, half-clipped on the viewBox edge, with Throughput clamped at Capacity so over-capacity and at-capacity rendered identically; the five-minute window was left to the Server's default rather than requested; the store was preferred over the Server's answer for *configuration*, not just for liveness; and the window fetch failing left an empty chart that read as *this Link reported nothing*.

**On the one finding not taken.** The review flagged the Console's `HISTORY_CAP = 300` as a third hand-typed copy of a constant that already lives in `SAMPLE_BUFFER_CAPACITY` and `DEFAULT_TELEMETRY_WINDOW`, and proposed lifting it into `shared/domain`. [ADR-0010](../adr/0010-telemetry-retention-is-capacity-bounded.md) considered and rejected exactly that move, and accepted the hand-coupling in its Consequences. The ADR wins; the third site is recorded there instead.

**Resolution:** all seven fixed. The redundant lib-level component spec was dropped in favour of the app-level integration test the repo already uses for routed components, with its unique assertions folded in, and the feature library's barrel narrowed to its routes to match `feature-fleet`. The general lesson: a green pipeline verifies that the code runs, not that it means what its comments say. Each of the three above is a claim in prose that no test was asked to hold to.

---

### 32 — Allowed domain vocabulary leaks to persist in the codebase

**2026-08-16 · `Human → AI` · console**

During a hygiene and domain verification pass, the AI noted that several terms forbidden by `CONTEXT.md` had seeped into the UI codebase—such as `KpiTile` for a summary figure, "reading" for a telemetry sample, and "freeze" for a stall. The AI raised these as findings but left them as open questions, treating them as low-priority cosmetic issues against the remaining "major chunk" of A2UI.

**Overridden by the human.** The human instructed the AI to halt new feature development and run a dedicated refactor specifically to correct the vocabulary and update stale README documentation. The reasoning is that domain nomenclature is not just cosmetic—it is the shared language of the product, and allowing terms like "KPI" or "reading" to take root in the UI components creates a silent, growing drift between the code and the product definitions in `CONTEXT.md`.

**Resolution:** Work on A2UI was deferred. A dedicated ticket and branch (`37-vocabulary-and-readme-cleanup`) were created to refactor `KpiTile` to `SummaryFigureTile`, replace "reading" with "sample" / "formattedThroughput", and update comments from "freeze" to "stall". The codebase was realigned with the single source of truth.

---

### 33 — Missed vocabulary leaks in tests and documentation during domain hygiene pass

**2026-08-16 · `Human → AI` · console and documentation**

Following the domain hygiene pass in entry 32, the AI reported the codebase clean. However, the human pointed out that the test suite (`console-harness.ts` and `.spec.ts` files) still used `kpi` in its query selectors and assertions, and `README.md` still contained references to "KPIs" (e.g. "Fleet-wide KPI header"). 

The AI had treated the production code as the sole source of truth for the domain vocabulary, leaving tests and markdown docs with the old terminology.

**Overridden by the human.** The human instructed the AI to apply the domain constraints to the test assertions and the README. The reasoning is that tests act as a living specification and documentation is read by new developers; if they use forbidden terms like "KPIs", those terms will inevitably leak back into the production code.

**Resolution:** The AI updated `console-harness.ts` to use `view.summary()` instead of `view.kpi()`, replaced all corresponding `view.kpi()` calls in the `.spec.ts` files, updated remaining comments, and replaced "KPI" with "Summary" in `README.md`. These changes were amended to the existing domain refactor commit.

---

### 34 — Wrote a PR description in an invented format rather than the one the repository already uses

**2026-08-17 · `Human → AI` · process and documentation**

Asked to raise the PR for ticket `40`, the AI wrote a description in a structure of its own: a one-line `Closes`, a lead paragraph, then `## The round trip`, `## In-flight state` and `## Tests`. The content was accurate and the sections were reasonable ones for this particular change — the AI picked headings that fit the diff in front of it. It checked `.github/` for a pull request template, found none, and treated the absence of a template as the absence of a convention.

**Overridden by the human.** The convention was not absent, it was unwritten — carried in the merged PRs themselves. Reading #51 and #52 shows a stable four-part shape used across the project: a product-level lead paragraph describing what the operator can now do, `## What changed` bulleted by library with paths bolded, `## Non-obvious reasoning` where each bullet leads with a bolded claim and records a decision that would otherwise have to be rediscovered, `## Verification` naming the gate command and what the tests actually assert, and `Closes #NN` last.

The principle is the one this repository applies to code and had not been applied to its own review artifacts: match the surrounding conventions rather than the ones that seem locally reasonable. A PR description is read by a reviewer moving between PRs, and a per-PR structure makes them re-learn the layout every time. `## Non-obvious reasoning` in particular is load-bearing here — it is where the reasoning that does not fit in a commit body is preserved, and an invented structure with no equivalent section silently drops it.

**Resolution:** The body was rewritten to the four-part shape and updated on PR [#53](https://github.com/ramvignesh-b/linkops/pull/53) via `gh pr edit`. Two things were dropped in the rewrite: the session URL, which neither #51 nor #52 carries in the body because it belongs in the commit trailer, and a note about a stale `Closes #40` reference in the first commit, which is meta-commentary with no home in the convention and was raised with the human directly instead.

**Consequence:** The absence of a `.github/pull_request_template.md` is what let this happen, and it will recur. The convention is currently recoverable only by reading merged PRs, which is a step every future contributor — human or tool — has to know to take. Adding the template is not part of any open ticket; it belongs with the README and verification pass (`41` and after).

### Zod native JSON schema vs `zod-to-json-schema`

**Direction:** Human → AI
**Date:** 2026-08-17

**What was proposed:** Using the community library `zod-to-json-schema` to dynamically convert `a2uiEnvelopeSchema` into a JSON Schema for LLM Structured Outputs.

**What replaced it:** Using Zod 4's native `schema.toJsonSchema()` method directly, avoiding the external dependency.

**Reasoning:** The user challenged the absolute necessity of adding another library. After verification, we confirmed the project is using Zod v4.4.3. Zod v4 includes official, native JSON Schema support out-of-the-box (`.toJsonSchema()`), rendering the third-party `zod-to-json-schema` library obsolete and redundant for this project. The spec was updated to use the native method.

### 34 — Trusted an AI spec reviewer's hallucination about Zod's API

**2026-08-17 · `AI → AI` · ticket 44, server API**

An automated "Spec Reviewer" AI sub-agent ran against the branch and claimed that the codebase was incorrectly using `.toJSONSchema()` on a Zod schema instead of "Zod 4's native `.toJsonSchema()
`".

The AI applied the suggestion and changed the code to `.toJsonSchema()$.

**Corrected after checking the typechecker.** Running `npm run typecheck` immediately threw `Property 'toJsonSchema' does not exist on type... Did you mean 'toJSONSchema'?` The sub-agent had confidently hallucinated a camelCase method name for a library it hadn't verified against the actual installed types.

**Resolution:** Reverted the method back to `.toJSONSchema()`. The general lesson is that a code reviewer sub-agent checking against a written spec will sometimes invent or misremember library APIs to match a hallucinated best practice; relying on the typechecker is faster and more authoritative than arguing with the review output.

### 35 — Patched a failing design four times instead of questioning the design

**2026-08-17 · `Human → AI` · ticket 44, server API**

`GeminiAgent` was built to author the A2UI Surface itself: hand the model the envelope schema, let it produce the document. Three real replies came back valid against `a2uiEnvelopeSchema` and blank on screen — a `Text` carrying its content in `children`, `action` stubbed onto every component, a node nothing referenced. The AI fixed each one by adding a rule to the system prompt, committing after each, and each time reported the root cause as the specific missing instruction.

**Overridden by the human**, who ran out of patience after the fourth failure ("no fixes worked, still hitting the error"). The framing was wrong from the second failure onward. Three different symptoms sharing one shape — the model populating only the fields the schema names and ignoring the fields only prose asks for — is evidence about the design, not three separate prompt bugs. The AI treated a recurring class of failure as a sequence of individual defects, which is the specific failure mode of fixing what is in front of you without asking why it keeps happening.

The escalation made it worse before it made it better: constraining the model with a hand-written per-component-type JSON Schema replaced blank Surfaces with `400 INVALID_ARGUMENT` from the Gemini backend, and diagnosing *that* consumed nine round trips of live-API bisection driven entirely by the human running probe scripts — because the SDK reports a rejected request with no field and no reason, and the AI had shipped no logging that would have named the schema it sent.

**Resolution:** The design was inverted — the model is asked for a judgement (`intro`, `linkId`, `remediation`, `rationale`) and the Server builds the Surface from the builders the stub already uses. Recorded as [ADR-0012](../adr/0012-the-model-recommends-the-server-renders.md), because the reasoning is entirely non-obvious from the resulting code and the obvious design is the one that was rejected. Error logging naming the model and the exact schema sent was added at the same time.

**Consequence:** Two rules worth carrying forward. A fix that has to be repeated is a signal to re-examine the design, not to write the next fix — the second occurrence is the cheap moment to stop, and it was skipped here. And an integration against a third-party API should log what it sent before it is ever pointed at a real key; nine bisection round trips were the cost of not having done that first, and the human paid it.

---

### 36 — Leaked vendor-specific model default into the generic environment schema layer

**2026-08-17 · `Human → AI` · ticket 44, server config & a2ui-agent**

When making the AI model configurable via `ASSISTANT_MODEL`, the AI exported `DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'` from `environment.schema.ts` and made `ServerConfigService` fall back to that value when `ASSISTANT_PROVIDER === 'gemini'`.

**Overridden by the human.** The generic configuration library (`@linkops/server/config`) has no business knowing vendor-specific defaults like `gemini-3.5-flash-lite`. Hardcoding provider fallbacks in `ServerConfigService` creates a Divergent Change smell — adding an Anthropic or OpenAI adapter later would force `ServerConfigService` to become a bloated catalog of third-party model strings.

**Resolution:** `ServerConfigService#assistantModel` was simplified to return `this.environment.ASSISTANT_MODEL` (raw `string | undefined`), keeping the configuration layer completely provider-agnostic. `DEFAULT_GEMINI_MODEL` was moved inside `libs/server/a2ui-agent/src/lib/gemini-agent.ts`, where the adapter encapsulates its own defaults behind the `A2uiAgent` interface. Recorded as [ADR-0013](../adr/0013-provider-agnostic-configuration-and-adapter-encapsulated-defaults.md).

---

### 37 — Justified an architecture decision with assignment requirements rather than product facts

**2026-08-17 · `Human → AI` · ADR documentation**

The AI wrote ADR-0014 justifying the decision to use Component Remotes for Module Federation. The `Context` section opened by explicitly citing "the assignment stretch goal (B4)" and "the performance stretch goal (B5)" as the drivers for the architecture.

**Overridden by the human.** `AGENTS.md` sets a hard limit on the documentation voice for committed artifacts: *Never invent product facts to justify a decision*, and *No milestone or bonus ids (M4, B2), no 'the brief', no 'the reviewer', no section numbers from the assignment's README structure*. Justifying an ADR with the assignment rubric breaks the product-framing rule and reads like homework instead of an engineering record.

**Resolution:** The context in `ADR-0014` was rewritten into product terms: extracting the Assistant side-panel so the AI team can deploy independently of the core management UI, while protecting the Console's initial render-blocking bundle size by deferring the load. The architectural problem—the router crashing when targeting an outlet hidden inside a `@defer` block—remains exactly the same, but it is now grounded in the reality of the software rather than the rubric.

### 39 — Condense README documentation

**2026-08-17 · `Human → AI` · documentation**

The initial specification (`spec-readme.md`) requested preserving the full depth of the architecture and API sections. The human overrode this, requesting a more pragmatic, condensed version.

**Resolution:** Shortened the library descriptions, removed JSON payload examples, and condensed the architecture explanations to improve readability.

### 40 — Add Bonus IDs to README

**2026-08-17 · `Human → AI` · documentation**

The repository rules (`AGENTS.md`) specify that committed artifacts should not reference assignment artifacts like "bonuses" or "milestones". The human explicitly requested a section detailing the targeted assignment bonuses.

**Resolution:** Added a "Bonuses targeted and achieved" section to the README, explicitly listing B1 through B6.
