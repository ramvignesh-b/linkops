# 9. Three tag axes — platform, domain, type — with platform as the outer constraint

## Status

Accepted.

## Decision

Every library carries three tags, and `@nx/enforce-module-boundaries` constrains all three:

```
platform: shared | server | console
domain:   links | telemetry | assistant | fleet | platform
type:     domain | data-access | feature | ui
```

Directories stay grouped by **platform** — `libs/shared/…`, `libs/server/…`, `libs/console/…`, with the thin application shells in `apps/api` and `apps/console`. Domain is expressed as a tag, not as a folder.

## Why the browser platform is `console`, not `client`

"Client" was doing three jobs at once: the browser platform, the HTTP and SSE *client objects* inside `console/data-access`, and *a consumer of our API* — the sense used when the streaming ADRs say a second-client author must be able to work from the README. Three meanings for one word, in a project whose central claim is that client and server cannot drift.

The browser side already has a name the product owns — Console, as in `apps/console` and LinkOps Console. Taking it frees `client` to mean only "a consumer of the API", which is how the rest of the documentation already uses it.

`server` stays as-is: it describes a runtime honestly, and it covers a Nest application and a telemetry simulator equally well, where `api` would have been accurate for only one of them.

## Why platform is the outer constraint

The server↔console rule is the only boundary here that is *architectural* rather than organisational: the two must never import each other, and a violation is a real defect rather than untidiness. Grouping directories by domain would put both sides of that firewall inside the same folder — `links/feature` holding a Nest controller and an Angular component — which makes the one rule that matters the hardest one to see.

Domain-first would also multiply the library count. Four domains × two platforms × three types is roughly twenty libraries for a ten-link console, most of them holding one file. That is the "dead abstraction built for later" this project is explicitly avoiding.

## Why domain is a tag anyway

Platform and type alone answer "what may import what" but not "what is this about". The domain tag adds the second question at almost no cost — tags live in `project.json` and never touch an import path — and it makes `nx graph` filterable by domain, which is a more legible artifact for the README's project-structure section than a flat thirteen-node graph.

## Considered Options

- **Platform + type only, browser side called `client`** — what was originally planned. Sufficient for enforcement, silent about subject matter, and carrying the overloaded term.
- **Three axes, platform-grouped directories, browser side called `console`** — chosen.
- **`api` and `console` as the two platform names**, mirroring the app names exactly — symmetric, but it makes `api` mean "belongs to the api app" rather than "is an API", trading one overloaded word for another.
- **Domain-grouped directories** — rejected above: it buries the firewall and inflates the library count.

## Consequences

- `depConstraints` gains a block per axis. A rule such as `domain:links may not depend on domain:assistant` is available if it ever earns its place; it is not enforced now, because at this size it would forbid nothing real.
- Adding a library means choosing three tags rather than two. `platform` is the one to check first, because it is the one that maps to a genuine defect.
- The naming half of this is cheap **now and expensive later**: directory names become import paths the moment the generators run. The tag axes themselves are metadata and can be revised at any time.
