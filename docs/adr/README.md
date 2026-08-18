# Architecture Decision Records

Fifteen decisions this build rests on. Each record states what was decided, why,
what was rejected, and what it costs — written when the decision was made, not
reconstructed afterwards.

A decision earns a record when it is hard to reverse, surprising without
context, or the result of a real trade-off. Choices that fail that bar are left
to the code and its comments.

## The records

| # | Decision | In one line |
|---|---|---|
| [1](./0001-toolchain-and-version-compatibility.md) | Toolchain selection and version compatibility | Only Node and pnpm are pinned; every dependency floats, and the compatibility between them was verified rather than assumed. |
| [2](./0002-unified-vitest-runner-and-swc-decorator-metadata.md) | Unified Vitest runner | Vitest is the only runner in the workspace; the Nest projects are hand-wired because `@nx/nest` offers Jest or nothing. No decorator transform is needed. |
| [3](./0003-paths-layout-over-ts-solution-setup.md) | Path aliases, not the TS solution layout | Libraries resolve through `compilerOptions.paths` in `tsconfig.base.json`. Recorded because it happens by omission — adding workspaces plus a root `tsconfig.json` would silently switch modes. |
| [4](./0004-batched-per-tick-sse-framing.md) | One batched SSE frame per tick | One `link.telemetry` frame carries every Link's Sample, so the message rate is 1/second regardless of fleet size — and one change-detection pass per tick in a zoneless client. |
| [5](./0005-snapshot-on-connect-no-telemetry-replay.md) | Snapshot on connect, never replay | Every connection opens with a `fleet.snapshot` carrying full render state. Buffered telemetry is never replayed. The snapshot is the resync path; REST is still the load path. |
| [6](./0006-shared-zod-schema-as-the-contract.md) | One zod schema is the contract | Every shape in `shared/domain` is one schema with types inferred from it, driving server validation, client validation, and the OpenAPI document. |
| [7](./0007-own-a2ui-renderer.md) | Our own A2UI renderer | The panel renders through a component registry we own, built against the A2UI v1.0 candidate spec. `@a2ui/angular` is not used. |
| [8](./0008-repository-interface-carries-the-version-check.md) | The repository interface carries the version check | `update(id, patch, expectedVersion)` returning a discriminated result, not `save(link)` — a write that skips the compare-and-swap cannot be expressed. |
| [9](./0009-three-tag-axes-platform-domain-type.md) | Three tag axes, platform outermost | Every library carries `platform`, `domain` and `type` tags, all three enforced by `@nx/enforce-module-boundaries`. |
| [10](./0010-telemetry-retention-is-capacity-bounded.md) | Retention is capacity-bounded | 300 Samples per Link — five minutes at 1 Hz — regardless of the window a client asks for. A wider request receives what exists, never an error. |
| [11](./0011-feature-composition-through-ui-and-data-access.md) | Embedded features split into UI and data-access | A feature embedded in another route is not a second `type:feature` library nested inside the first; it composes through `ui` and `data-access` instead. |
| [12](./0012-the-model-recommends-the-server-renders.md) | The model recommends, the Server renders | Gemini is asked for a judgement held to a flat four-string schema. It never authors A2UI and is never told a component type; the Server assembles the Surface. |
| [13](./0013-provider-agnostic-configuration-and-adapter-encapsulated-defaults.md) | Provider-agnostic configuration | `server/config` defines no provider-specific defaults. `ASSISTANT_MODEL` is an open optional string, and defaults like `DEFAULT_GEMINI_MODEL` live inside the adapter that needs them. |
| [14](./0014-programmatic-component-remotes-for-module-federation.md) | Programmatic Component Remotes | Module Federation without the Angular Router: a local wrapper fetches the remote component with `loadRemoteModule` and renders it through `NgComponentOutlet`. |
| [15](./0015-assistant-as-a-module-federation-remote.md) | The Assistant panel is a remote | The triage panel is extracted into its own application, served separately and fetched by the Console at runtime. Implements and extends record 14. |

## Records carrying corrections

Three have been corrected in place rather than superseded, because the
decisions stood and only the facts around them changed. Each carries its
correction at the foot of the record:

- **[1](./0001-toolchain-and-version-compatibility.md)** — three claims were
  wrong on the day they were written, including a toolchain combination that
  could never have built.
- **[2](./0002-unified-vitest-runner-and-swc-decorator-metadata.md)** — the
  unified-runner decision stands; the SWC transform this record was half about
  turned out to be unnecessary and was removed.
- **[15](./0015-assistant-as-a-module-federation-remote.md)** — the bundle warn
  budget has since been tightened.

## Related

- [`CONTEXT.md`](../../CONTEXT.md) — the domain glossary these records are
  written in.
- [`docs/specs/`](../specs/) — the specifications the build was worked
  against.
- The root [README](../../README.md#8-how-it-works) for the end-to-end flow
  these decisions shape.
