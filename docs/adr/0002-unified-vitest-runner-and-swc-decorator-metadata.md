# 2. Unified Vitest runner, and the decorator metadata question

## Status

Accepted, **substantially corrected 2026-08-14** — see [Correction](#correction). The unified-runner decision stands. The SWC transform this record was half about turned out to be unnecessary on the toolchain we actually installed, and has been removed.

## Decision

Vitest is the only test runner in the workspace. `@nx/nest`'s generators offer `unitTestRunner: ["jest","none"]` only, so the four Nest projects and `apps/api` are generated with `none` and hand-wired with their own `vitest.config.mts`, picked up by the root `vitest.config.ts` through `test.projects` (`vitest.workspace.ts` does not exist in vitest 4).

**No decorator transform plugin is needed.** `emitDecoratorMetadata` in `tsconfig.base.json` is sufficient.

## Why no transform is needed

Nest resolves constructor dependencies by reading the `design:paramtypes` metadata that `emitDecoratorMetadata` emits. The question is only whether the test-time transform implements that flag.

**Vite 8 transforms through rolldown/oxc, not esbuild, and oxc implements it.** Verified by experiment rather than assumed — see the Correction below for what was measured.

Some things that are _not_ the problem, worth stating because they are each easy to believe:

- **`@nestjs/testing` is not the problem.** At v11 it declares exactly one dependency: `tslib`. No `jest`, no `jest-mock`. `Test.createTestingModule()` is runner-agnostic. A plan that avoids `@nestjs/testing` on the theory that it drags in Jest is solving a problem that does not exist.
- **Avoiding `Test.createTestingModule()` would not have helped either.** The HTTP contract test boots the real Nest application under the same transform and needs the same metadata. Keeping backend unit tests framework-free is right for other reasons — it was never a workaround for this.
- **The production build was never at risk.** `tsc@6.0.3` still ships both `--experimentalDecorators` and `--emitDecoratorMetadata`, and the API builds through webpack and `tsc` regardless.

## Considered Options

- **No plugin, relying on the compiler flag** — chosen, after measuring that it works.
- **`unplugin-swc` with `decoratorMetadata: true`** — what this ADR originally mandated. Correct for a vite 5/6 workspace where esbuild does the transform; dead weight here, and `@swc/core` is a large native dependency against a five-minute install budget.
- **Explicit `@Inject(TOKEN)` on every Nest constructor parameter** — works under any transform, and taxes every file the project will ever have to save one devDependency.
- **Jest for `apps/api`, Vitest for the client** — the honest fallback, and the one this ADR exists to reject. Two runners, two config dialects, two mocking APIs, and `pnpm test` stops being one command.

## Consequences

- No hand-versioned test-tooling packages remain. Every version in the workspace is Nx-managed or a direct product dependency.
- `libs/server/health/src/lib/di-metadata.spec.ts` guards this decision. It asserts both that `design:paramtypes` is emitted and that Nest resolves a constructor dependency by type alone. If a toolchain upgrade ever moves the transform back to something that drops decorator metadata, that test fails rather than every DI-backed test failing at once with a confusing error.
- If a Nest provider ever fails to resolve in a test with `Nest can't resolve dependencies` while working in production, check that guard test first: it isolates the transform from the module wiring.

## Correction

**"Vitest transforms TypeScript with esbuild, which does not implement `emitDecoratorMetadata`" → false for this workspace.**

The claim was true of the toolchain the plan was written against and was carried forward without being tested here. Vite **8.2.1** lists `rolldown` among its dependencies, not `esbuild`; rolldown transforms through oxc, which honours the compiler flag.

Measured three ways, each on the real project rather than a sketch:

1. With `unplugin-swc` removed from the project's Vitest config, the DI test still passed.
2. With **every** plugin removed, it still passed — so no other plugin was quietly supplying the transform.
3. With `emitDecoratorMetadata` deleted from `tsconfig.spec.json` it still passed, which located the live setting in `tsconfig.base.json`, where Nx had put it.

`unplugin-swc` and `@swc/core` were then removed. This is the same failure shape as ADR-0001's Corrections 1, 2 and 6: a fact verified in a plan and treated as verified in the environment. The difference is that this one would never have announced itself — the plugin would have sat in five config files doing nothing, and the ADR defending it would have read as rigorous.
