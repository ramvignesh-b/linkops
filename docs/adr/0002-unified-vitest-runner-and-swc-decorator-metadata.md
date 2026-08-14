# 2. Unified Vitest runner, with an SWC transform for the Nest projects

## Status

Accepted.

## Decision

Vitest is the only test runner in the workspace. `@nx/nest`'s generators offer `unitTestRunner: ["jest","none"]` only, so the four Nest projects are generated with `none` and hand-wired into the root `vitest.config.ts` via `test.projects` (`vitest.workspace.ts` does not exist in vitest 4). Those projects additionally get **`unplugin-swc`** with `decoratorMetadata: true`, because without it Nest's dependency injection fails at runtime under test.

## Why the SWC transform is not optional

Vitest transforms TypeScript with **esbuild, which does not implement `emitDecoratorMetadata`**. Nest resolves constructor dependencies by reading the `design:paramtypes` metadata that flag emits. No flag, no metadata, no DI.

This is easy to get wrong in a specific way, so it is worth stating what is *not* the problem:

- **`@nestjs/testing` is not the problem.** At v11 it declares exactly one dependency: `tslib`. There is no `jest`, no `jest-mock`. `Test.createTestingModule()` is runner-agnostic. A plan that avoids `@nestjs/testing` on the theory that it drags in Jest is solving a problem that does not exist.
- **Avoiding `Test.createTestingModule()` does not avoid the problem either.** The HTTP contract test boots the real Nest application, under the same Vitest transform, and needs the same metadata. Keeping backend unit tests framework-free is right for other reasons — it is not a workaround for this.
- **The production build is unaffected.** `tsc@6.0.3` still ships both `--experimentalDecorators` and `--emitDecoratorMetadata` (verified 2026-08-14). This is a Vitest-transform problem exclusively.

## Considered Options

- **`unplugin-swc@1.5.11` on the Nest Vitest projects** — chosen. One plugin, one config file, ordinary Nest idiom preserved in every source file. Peer-deps `@swc/core ^1.2.108`.
- **Explicit `@Inject(TOKEN)` on every Nest constructor parameter** — works without any transform, and taxes every file the project will ever have in order to save one devDependency.
- **Build with `tsc` first, run the contract test against the artifact in a spawned process** — makes `pnpm test` depend on build ordering — a hidden coupling that fails for whoever runs the tests without having just built, which is everyone except the person who wrote it.
- **Jest for `apps/api`, Vitest for the client** — the honest fallback, and the one this ADR exists to reject. Two runners, two config dialects, two mocking APIs, and `pnpm test` stops being one command.

## Consequences

- `@swc/core` and `unplugin-swc` are devDependencies. They are the only hand-versioned test-tooling packages in the repo, since Nx has no version map for them.
- If a Nest provider ever fails to resolve in a test with a `Nest can't resolve dependencies` error while working in production, the SWC plugin has fallen out of that project's Vitest config. That is the first thing to check, not the module wiring.
