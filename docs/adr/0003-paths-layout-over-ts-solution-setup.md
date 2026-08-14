# 3. Path aliases, not the TypeScript solution-style layout

## Status

Accepted.

## Decision

The workspace resolves libraries through `compilerOptions.paths` in a root `tsconfig.base.json` — the classic Nx layout — rather than TypeScript's solution-style setup with per-project references and package-manager workspaces.

## Why this needs recording

It is the default, but silently: Nx only enters TS-solution mode when the repo has package-manager workspaces **and** a root `tsconfig.json` extending `tsconfig.base.json` (`isUsingTsSolutionSetup()` in `@nx/js`). `nx init` creates neither, so paths mode happens by omission. A future reader adding a `pnpm-workspace.yaml` for an unrelated reason could flip the whole workspace's resolution strategy without realising a decision was being made — which is the reason to write it down.

## Considered Options

- **Paths** — chosen. One file describes every alias, which makes the thirteen-library dependency rule readable in one place. Nx's `@nx/enforce-module-boundaries` works identically either way, so nothing about the boundary story depends on this.
- **TS solution setup** — better incremental build characteristics on large repos and closer to where the TypeScript ecosystem is heading. Both benefits are irrelevant at thirteen small libraries, and the cost is a `tsconfig.json` per project plus a project-references graph to keep in sync — ceremony that would be read as unfamiliarity with the simpler option rather than as a deliberate choice.

## Consequences

Adding a library means adding its alias to `tsconfig.base.json`. If the workspace ever grows past the point where full type-checks are slow, migrating to the solution setup is a mechanical change — but it touches every project at once, so it is not a decision to drift into.
