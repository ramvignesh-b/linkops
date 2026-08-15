# LinkOps Console

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/` and are mirrored to GitHub Issues on `ramvignesh-b/linkops` for live progress tracking. See `docs/agents/issue-tracker.md`.

### Commit and issue closure conventions

Every ticket implementation commit follows the existing repository commit standard:
- **Header**: Conventional commit format (`type(scope): subject`).
- **Body**: Natural, narrative prose explaining the *why*, architectural trade-offs, root causes, and verification evidence—preserving the established documentation voice.
- **Footer**: Append `Closes #N` on the final line to auto-link and resolve the GitHub issue.
- **No synthetic bot comments**: Never post canned bot comments (e.g. "Resolved via /implement"). The commit message and git diff provide the durable audit trail.

### Triage labels

The five canonical roles, each label string equal to its name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` and one `docs/adr/` at the repo root. See `docs/agents/domain.md`.

`CONTEXT.md` is the glossary and exists now — read it before naming anything. `docs/adr/` holds ADRs 0001–0007; where an ADR and a planning document disagree, the ADR wins.

### Documentation voice

**Committed artifacts** — `CONTEXT.md`, `docs/adr/`, `docs/decisions/`, and all source and comments — justify every decision in product and engineering terms. No milestone or bonus ids (`M4`, `B2`), no "the brief", no "the reviewer", no section numbers from the assignment's README structure. Cross-reference our own documents by name ("the README's API reference"), not by number.

Two hard limits on that voice:

- **Never invent product facts to justify a decision.** No memory ceilings, deployment topologies, bandwidth budgets, or user roles that aren't real. A fabricated constraint is worse than an honest "we chose N and here is why" — and it cannot be defended when someone asks. The grounded framing available is: a management UI served next to the device, an embedded host, long-lived, where a stall or a leak is a customer-visible fault.
- **Never replace a true reason with a better-sounding one.** Telemetry is batched per tick because it collapses N change-detection passes into one, not because of radio channel bandwidth. If a rationale needs upgrading, upgrade the decision.

**Gitignored working docs** (`.scratch/`) keep the requirement vocabulary deliberately — that is where coverage of `M1`–`M8` and `B1`–`B6` is tracked, and stripping it would destroy the traceability. `docs/decisions/ai-collaboration.md` is likewise exempt: it is a meta-document about tooling.

### Working docs — read before planning anything

The active effort is `linkops`. Its working documents live in `.scratch/linkops/` and are **gitignored**, so a plain `grep`/`rg` will not find them — search that path explicitly.

| File                                         | What it is                                                                                                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.scratch/linkops/map.md`                    | Wayfinder map — destination, decisions so far, open questions. **Start here.**                                                                                                                                             |
| `.scratch/linkops/environment-setup-plan.md` | Current source of truth for toolchain, versions and scaffolding                                                                                                                                                            |
| `.scratch/linkops/plan.md`                   | Architecture plan. **Partially superseded twice** — its toolchain claims are wrong and seven further items are stale; read both warnings at its top before using it                                                        |
| `.scratch/linkops/issues/`                   | Numbered tickets, `NN-<slug>.md`. Grilled decisions land under `## Answer`; the spec for a ticket is written into that same file by `/to-spec` — this effort has **no** `spec.md`, because it spans too many areas for one |
| `.scratch/linkops/preserved-config/`         | Pre-`nx init` config kept for reference only. Never restore these files — two of their version pins were unbuildable                                                                                                       |

Never hand-pin `typescript`, `@angular/*`, `vitest` or `@nx/*` versions. They are Nx-managed, and hand-pinning them is what broke this workspace once already.

**Never run `git clean -fdx` in this repo.** `.scratch/`, `docs/decisions/` and `docs/study/` are gitignored, so `-x` deletes them — the map, every ticket, both plans, `preserved-config/` and the AI collaboration log — and none of it is committed, so there is no reflog, no stash and no way back. Verified: `git clean -fd` spares ignored directories, `git clean -fdx` destroys them. Use `git clean -fd`, or `rm -rf node_modules` when that's the actual goal. Copy `.scratch/` outside the repo before any destructive step such as `nx init` or a full reinstall.

### Logging course-corrections

When the user rejects, reverses or materially amends something you proposed, append an entry to `docs/decisions/ai-collaboration.md` before continuing with the work. Do the same when you contradict your own earlier output after verifying a fact.

Tag every entry with a direction: `Human → AI` when a human overrode you, `AI → AI` when you corrected yourself. Only `Human → AI` entries satisfy what the assignment's README §12 asks for, so the distinction has to survive into the file. Record what was proposed, what replaced it, and the reasoning — not just the outcome.

The user can also log one deliberately with `/override`.

### Teaching & Study Workspace

All interactive lessons, reference sheets, learning records, and study resources produced by `/teach` must live in `docs/study/` (e.g. `docs/study/lessons/`, `docs/study/reference/`, `docs/study/learning-records/`, `docs/study/MISSION.md`, `docs/study/RESOURCES.md`) to keep the repository root clean.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
