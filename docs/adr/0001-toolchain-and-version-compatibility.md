# 1. Toolchain Selection and Version Compatibility Matrix

## Status

Accepted. **Corrected 2026-08-14** — see [Corrections](#corrections). Three claims in the original text were wrong on the day they were written; they have been fixed in place rather than superseded, because no decision was reconsidered — facts were checked for the first time.

## Context

LinkOps Console targets Angular 22 and NestJS 11, holds all state in memory, and must come up on a machine that has never seen it before in under five minutes — anyone joining the project, or rebuilding it on a new host, gets one install and one command. That onboarding budget is the binding constraint on this decision: it rules out toolchains that need a browser download, a container runtime, or a manual dependency-resolution step. We need a monorepo toolchain that prevents peer-dependency conflicts, enforces strict layer boundaries, and eliminates runtime drift without spending that budget.

## Decision

### Versions we pin

Only two, and both are environment rather than dependency:

- **Node**: `24.18.0`, via `.nvmrc`
- **Package manager**: `pnpm@11.21.0`, via the `packageManager` field, reproduced by `corepack enable` (documented fallback: `npm install -g pnpm@11.21.0`). The pin must always name the pnpm that actually wrote `pnpm-lock.yaml` — see [Corrections](#corrections) 6

### Versions Nx owns — we do not pin these

`@nx/angular`, `@nx/js` and `@nx/nest` at Nx **23.1.1** supply the framework versions, and hand-pinning any of them is forbidden (see [Corrections](#corrections) 1 and 2 for what happened the last time):

| Package | Version Nx installs | Source |
|---|---|---|
| `@angular/*` | `~22.0.4` | `@nx/angular@23.1.1` `dist/src/utils/versions.js` |
| `typescript` | `~6.0.3` | `@nx/js@23.1.1` `dist/src/utils/versions.js` |
| `vitest` | `^4.0.8` | `@nx/angular@23.1.1` |
| `jsdom` | `^27.1.0` | `@nx/angular@23.1.1` |
| `prettier` | `~3.6.2` | `@nx/angular@23.1.1` |

Plugins are added with `nx add`, never `pnpm add -D`, because only `nx add` runs the plugin's init generator — which is what supplies the matched versions above and registers the plugin in `nx.json`.

Nx installs Angular `22.0.4`, not the latest `22.1.4`. That is deliberate: the version Nx's generators and migrations are tested against is worth more than three patch releases.

### The rest of the stack

- **Monorepo architecture**: integrated **Nx 23.1.1** workspace, single root `package.json`, strict `@nx/enforce-module-boundaries` lint rules across three tag axes (`platform:`, `domain:`, `type:`) — see [ADR-0009](./0009-three-tag-axes-platform-domain-type.md)
- **Frontend**: Angular (Nx-managed), standalone, zoneless via `provideZonelessChangeDetection()`
- **Client state**: a `FleetStore` built on native Angular signals (`signal`, `computed`, `DestroyRef`) with no third-party store
- **Backend**: NestJS 11 with in-memory repositories
- **Test runner**: **Vitest across the whole workspace**, which on the server side requires an SWC transform — see [ADR-0002](./0002-unified-vitest-runner-and-swc-decorator-metadata.md)
- **Validation**: **zod `4.4.3`** as the single shared contract between client and server. Not an ADR of its own: choosing the current major of a library already decided on is neither surprising nor a real trade-off. zod 3 was the only alternative, and it lacks `z.toJSONSchema()`, which is what makes the OpenAPI decision below cheap
- **OpenAPI**: `@nestjs/swagger` with **`nestjs-zod`**, so the document is generated from the shared zod schemas rather than from a parallel set of annotated classes. The interactive UI is **gated behind a config flag** — see [ADR-0006](./0006-shared-zod-schema-as-the-contract.md)
- **A2UI protocol renderer**: custom whitelist renderer — see [ADR-0007](./0007-own-a2ui-renderer.md)

## Compatibility Analysis & Considered Alternatives

| Tool / Package | Selected | Considered Alternative | Why |
|---|---|---|---|
| **Nx Workspace** | `23.1.1`, integrated | Package-based monorepo, Turborepo | `@nx/angular@23.1.1` peer-deps `@angular/build >=20 <23`, so Nx 23 + Angular 22 is a supported pairing. An integrated workspace is what makes "Nx owns the versions" enforceable rather than aspirational |
| **Framework versions** | Nx-managed | Hand-pinned in `package.json` | Hand-pinning produced two unbuildable combinations. See Corrections 1 and 2 |
| **Angular patch level** | `~22.0.4` (Nx's) | Bump to `22.1.4` after generating | Nx's tested combination beats three patch releases. Revisit only if a specific `22.1.x` fix is needed |
| **OpenAPI** | `@nestjs/swagger@11.4.6` + `nestjs-zod@5.5.0` | `z.toJSONSchema()` and a hand-built document; `@nestjs/swagger` with hand-written `@ApiProperty()` DTO classes | The objection to `@nestjs/swagger` is its expectation of class DTOs — hand-writing them alongside the schemas would restate every rule and defeat [ADR-0006](./0006-shared-zod-schema-as-the-contract.md). `nestjs-zod`'s `createZodDto()` removes that objection by generating the class *from* the schema, so there is still one source of truth. It also supplies the validation pipe and response serializer, replacing code we would otherwise hand-roll — net less code, not more. `swagger-ui-dist@5.32.8` adds 11.7 MB unpacked, roughly 1% of this workspace's `node_modules`, which does not move install time |
| **Client state** | Native Angular signals | `@ngrx/signals`, RxJS `BehaviorSubject` | No extra runtime dependency, and SSE frames are batched per tick ([ADR-0004](./0004-batched-per-tick-sse-framing.md)), so there is one signal update per second to manage — not a volume that justifies a store library |
| **Test runner** | Vitest, workspace-wide | Jest server-side + Vitest client-side | One `pnpm test`. Costs an SWC transform on the Nest projects — [ADR-0002](./0002-unified-vitest-runner-and-swc-decorator-metadata.md) |
| **Package manager** | pnpm `11.21.0` | npm, yarn | Strict about phantom dependencies, so a library that imports something it never declared fails at install rather than in production. That makes the layer boundaries real instead of conventional. `corepack enable` removes the first-run risk |
| **A2UI** | In-house renderer | `@a2ui/angular@0.10.5` | Peer-deps `@angular/core: ^21.2.5` — incompatible with our Angular 22 — and peer-deps `@a2ui/markdown-it`. Verified against the registry 2026-08-14; `0.10.5` is the latest published version. See [ADR-0007](./0007-own-a2ui-renderer.md) |

## Consequences

- No `--legacy-peer-deps`, no `overrides`, no forced resolutions.
- `pnpm test` is one command across both apps.
- The workspace has no browser-download step: `--e2eTestRunner=none` on both app generators, because Playwright's default would spend the whole five-minute budget on a Chromium download.
- **Upgrades run through `nx migrate`, not `pnpm update`.** Because Nx owns the framework versions, editing them by hand silently reintroduces exactly the failure mode Corrections 1 and 2 describe.
- Nothing in this ADR ships to the browser bundle, so the client bundle budgets are unaffected by any choice in it.

## Corrections

Each entry names a claim that was in the original text, what replaced it, and the log entry that caught it.

**1. "Angular `22.1.2`" as a pinned version → Nx-managed `~22.0.4`.**
The original pinned `typescript: 5.9.3` alongside Angular `22.1.2`. `@angular/compiler-cli@22.1.2` declares `typescript: >=6.0 <6.1` and `ngtsc` enforces it with a hard error, so that combination could never have built. The heading claimed the toolchain was "verified against the live npm registry" — it had been verified to *exist*, not to be mutually compatible. `docs/decisions/ai-collaboration.md` entry 01.

**2. "Vitest unified across client and server via `@angular/build:unit-test` and `@nx/vite`" → true for the client, wrong for the server.**
`@nx/nest:app` and `@nx/nest:lib` offer `unitTestRunner: ["jest","none"]` only — no vitest at any version. A unified Vitest setup requires hand-wiring the Nest projects, and that hand-wiring has a failure mode the original sentence concealed entirely: see [ADR-0002](./0002-unified-vitest-runner-and-swc-decorator-metadata.md). Related: the original plan called for a root `vitest.workspace.ts`, a file concept that does not exist in vitest 4 (`test.projects` replaced it). Entries 02 and 09.

**3. "Zero peer-dependency warnings or conflicts during `pnpm install`" → an aspiration stated as a result.**
This was asserted before an install had ever been run in this workspace. It is now framed as a consequence we intend to hold, not an observation. Nothing had been measured.

**4. "Sub-second" test execution and "sub-microsecond" signal updates → removed.**
Both numbers were invented. Neither had been measured, and neither is load-bearing for any decision in this ADR.

**5. "Two tag axes (`scope:`, `type:`)" → three (`platform:`, `domain:`, `type:`).**
[ADR-0009](./0009-three-tag-axes-platform-domain-type.md) added a `domain:` axis and renamed `scope:` to `platform:`, but this record still described the original pair — so the two ADRs contradicted each other on the taxonomy that governs every library's tags. Corrected here rather than in ADR-0009, because ADR-0009 is the decision and this is a summary of it that went stale.

**6. "pnpm `10.29.1`" → `11.21.0`, the version that actually ran.**
`nx init` installed dependencies with the pnpm on the machine — **11.21.0** — so `pnpm-lock.yaml` was written by pnpm 11, and `nx init` omits the `packageManager` field entirely. Restoring the field with `10.29.1` would have pinned a package manager that has never run against this lockfile: `corepack enable` would fetch pnpm 10 on a clean machine, and any resolution difference between the two majors surfaces as a `--frozen-lockfile` failure at exactly the moment the install has to work first time. Lockfile format is not the risk — both majors write `lockfileVersion: '9.0'` — peer resolution is.

The general rule this makes explicit: **the `packageManager` pin names whatever wrote the lockfile, and is re-read from the environment rather than carried forward from a plan.** Pinning a version verified to exist rather than verified to have run is the same error as Corrections 1 and 2, in a third place.

Consequence: the husky `prepare`-script behaviour recorded during planning was observed on pnpm 10.29.1 and has to be re-confirmed on 11.21.0 when the hooks land, not assumed.
