# 15. The Assistant panel is packaged as a Module Federation remote

## Status

Accepted. Implements and extends
[ADR-0014](./0014-programmatic-component-remotes-for-module-federation.md),
which chose programmatic Component Remotes over the Angular Router for this
integration. That choice holds exactly as recorded; this ADR covers what
implementing it actually decided — which federation tooling, which library
the panel moves into, what has to be shared and why, and what the bundle
budget means afterwards.

One correction to ADR-0014's sketch: it names `@nx/angular/mf`'s
`loadRemoteModule`. That package's Angular Module Federation support is
deprecated on this Nx version (see "Considered Options" below), so the
implementation uses `@angular-architects/native-federation`'s
`loadRemoteModule` instead. The shape ADR-0014 describes — a local wrapper
fetching the remote, `NgComponentOutlet`, an explicit spinner, all inside
the host's existing `@defer` block — is unchanged.

## Decision

The triage panel — the Assistant's Surface, rendered inside the Fleet
route — is extracted from `apps/console` into its own application,
`apps/assistant`, built and served independently (port 4201) and loaded
into the Console at runtime rather than compiled into it. The two are
joined with [Native Federation](https://github.com/angular-architects/module-federation-plugin),
Angular's esbuild-based Module Federation successor: `apps/console` is a
dynamic host, reading a manifest at startup that names `assistant` as a
remote it can ask for; `apps/assistant` exposes one Component,
`AssistantPanel` (`libs/console/feature-assistant`), and nothing else.

The panel's own composition — its renderer, its session state, its HTTP
client — moves with it into `libs/console/feature-assistant`, a
`type:feature` library imported only by `apps/assistant`. `console/feature-fleet`
gains a small local component, `AssistantWrapper`, whose entire job is
calling `loadRemoteModule('assistant', './Component')`, showing a spinner
while that promise is pending, and mounting whatever it resolves to with
`NgComponentOutlet`.

## Why

**This is a Component Remote, not a routed one.** The panel has no
shareable URL of its own — [ADR-0011](./0011-feature-composition-through-ui-and-data-access.md)
already established why: its Surface is server-authored, not reproducible
from an address. Module Federation's routed pattern (a host lazy-loading a
remote's `Routes` onto a path of its own) does not fit here for the same
reason it never did; what this ticket needed was the panel to keep
appearing exactly where it always has, inside `FleetPage`'s existing
`@defer` block, with its code now fetched rather than bundled.

**This does not reopen ADR-0011.** That decision's rule —
`@nx/enforce-module-boundaries` bans one `type:feature` library from
importing another — still holds, and still should: it is what keeps the
dependency graph legible everywhere else in the workspace. What changes is
*how* the panel reaches the Fleet route. `AssistantWrapper` never imports
`@linkops/console/feature-assistant`; it names `'assistant'` and
`'./Component'` as strings, resolved by Module Federation's runtime loader.
There is no edge in the static import graph for the boundary rule to see,
because the two libraries are never composed at build time at all — only
at runtime, across a federation boundary neither one has to know the
internals of. `console/feature-assistant` is a real `type:feature` library
today, legally, for the first time: the thing that stopped it before
(`FleetPage`, a `type:feature`, needing to import it) no longer applies,
because nothing imports it except the one application that builds it.

**Why now, and why this panel specifically.** The B4 requirement asked for
one feature area packaged as an independently deployable remote, to prove
the pattern works in this workspace. The triage panel was the deliberate
choice: it is already the one piece of the Console whose state is scoped
to a single component rather than threaded through the route
(`AssistantSession`, previously provided by `FleetPage`, now by
`AssistantPanel` itself), already gated behind `@defer` so its absence
from the initial bundle was already a design goal, and already the
smallest surface in the Console with no inbound dependents — no other
feature imports anything from the old inline composition. Extracting it
changes what has to cross a boundary; it does not change what the panel
is answerable to.

## Considered Options

- **Recreate `console/feature-assistant` as a statically-imported library**,
  the shape ADR-0011 deleted. Rejected for the reason ADR-0011 gives: the
  one route that would compose it (`FleetPage`) cannot legally import a
  second `type:feature` library, and disabling the rule for this one case
  is how a second exception gets argued for later. Module Federation
  sidesteps this rather than overriding it — see "Why," above.
- **A routed remote**, `loadChildren` on a path like `/assistant`, the
  pattern Nx's own generators default to. Rejected for the same reason a
  named router outlet was rejected in ADR-0011: it would promise a
  shareable address the panel's server-authored Surface cannot honour.
- **Deprecated `@nx/angular` webpack Module Federation** (`setup-mf`,
  `remote`, `host`) — the generators this Nx version ships. Rejected: they
  print their own deprecation on every run ("no longer supported... Removed
  in Nx v24"), and adopting them would also move `apps/console`'s build off
  its esbuild-based `@angular/build:application` executor onto webpack, a
  build-tooling regression this ticket did not ask for and the existing
  650 kB budget was tuned against. [Native Federation](https://github.com/angular-architects/module-federation-plugin)
  is what Nx's own deprecation notice points to for this Angular version,
  and it keeps `apps/console` on esbuild — `federation.config.mjs`'s
  `withNativeFederation` wraps the same `@angular/build:application`
  output the project already produced.

## Consequences

- `apps/console`'s production build carries no trace of the Assistant —
  not in the initial bundle, not in a lazy chunk of its own — and the
  triage panel's code ships only from `apps/assistant`'s own build.
  Angular's own reported initial bundle drops from 616.33 kB to 126.53 kB
  raw as a result, but that comparison is not the whole picture — see the
  next bullet.
- **Angular's own bundle budget cannot see Native Federation's shared-
  dependency bundles, and a single "initial bundle" number stopped
  meaning one thing.** `main.js`/`polyfills.js`/`styles.css` are the only
  files Angular's bundler emits as an initial `<script>` tag, so they are
  the only ones `esbuild`'s `budgets` config checks. The shared-dependency
  bundles this same PR's `sharedMappings` and `shareAll` config produce
  (`_angular_core.<hash>.js`, `zod.<hash>.js`, and the rest) are built by a
  separate step and are invisible to that check — but they are not
  optional: they are fetched before the Fleet route ever renders.
  `tools/verify-bundle-budget.mjs` measures both, for real, by serving the
  real production build (gzip included) and asking a real headless
  browser what it downloaded landing on `/`, and reports them as two
  numbers rather than folding them into one:
  - **This app's own code** (`main`/`polyfills`/`styles`/its own route
    chunks) — **322 kB raw / 97 kB gzip**. Gated against the 650/1000 kB
    budget `esbuild`'s own config already states, since this is what a
    Console change actually moves, and the number that budget was written
    for in the first place.
  - **Shared infrastructure** — **1,061 kB raw / 261 kB gzip**. Reported,
    not gated: a one-time, content-hashed, cacheable cost paid once per
    browser regardless of how many times the Fleet route is visited, and
    not something a Console feature change can shrink by itself — sharing
    `@angular/core`, `@angular/router` and the rest is what buys the
    duplication-free `AssistantInvalidPayloadError` guarantee two bullets
    below, not a cost this PR's own code introduced by writing too much
    of it.
  - Three things had to go wrong, in sequence, before landing on this
    shape. The CI report this surfaced from (`.github/workflows/ci.yml`)
    had summed only files referenced by name in `index.html`, silently
    excluding every shared-dependency bundle since they started existing.
    The first replacement classified files by name instead
    (`chunk-<hash>.js` = lazy, excluded) and was wrong in the opposite
    direction: the specific chunk the `/` → `/links` redirect pulls in
    is not optional on a normal visit, and no filename can say which
    chunk belongs to the default route and which is genuinely deferred.
    Only measuring a real browser's real downloads settled it — and
    once that was trustworthy, the true finding wasn't "over budget," it
    was "the budget was being compared against the wrong number": this
    app's own code was passing by a wide margin the whole time.
  - `zod` alone accounts for 385 kB of the shared total: a shared-
    dependency bundle builds from the package's own entry point, not from
    what this workspace calls, so it ships zod's whole public API rather
    than the handful of schema builders `shared/domain` and
    `shared/a2ui-protocol` actually use. Skipping it from the shared list
    was tried, on the theory it would then tree-shake to actual usage; it
    didn't — zod resists dead-code elimination regardless of where it is
    bundled — and removing it from `shared` only stopped it being
    deduplicated across `apps/console` and `apps/assistant`, raising the
    total further. Reverted; not part of this PR's diff. Shrinking the
    shared-infrastructure number, if that is ever worth doing, is
    separate, not-yet-scoped work — it is reported, not gated, precisely
    so that work stays optional rather than blocking.
- `console/data-access` and `libs/shared/domain` are declared shared
  singletons in both `federation.config.mjs` files. This is not an
  optimisation: `AssistantInvalidPayloadError` is defined in
  `console/data-access`, and `AssistantSession` tells it apart from a
  transport failure with `instanceof` — two separately bundled copies of
  the class would silently break that check the moment both were loaded
  together.
- `AssistantSession`'s in-flight request now cancels on the panel's own
  destruction (`takeUntilDestroyed`), not only when a second `open()`
  supersedes it. Necessary because the session is now scoped to
  `AssistantPanel`, which is destroyed and recreated on every close and
  reopen, rather than surviving inside a persistent `FleetPage` the way it
  used to — closing the panel is what ends its request now, exactly the
  way closing anything else in the Console does.
- Every test that exercises the panel (`apps/console/src/app/assistant.spec.ts`)
  still runs as an integration test through `bootConsole`, per ADR-0011's
  testing note — nothing about that changed. What changed is one seam:
  `ASSISTANT_REMOTE_LOADER` (`console/feature-fleet`, alongside the wrapper
  that injects it) stands in for `loadRemoteModule` the same way
  `EVENT_SOURCE` (`console/data-access`) stands in for the browser's own
  `EventSource` — real in production, resolved to the real `AssistantPanel`
  class directly in tests, so the composition under test is exactly what
  ships, minus the one step — fetching code over the network — no test
  environment can perform.
- **`ASSISTANT_REMOTE_LOADER` cannot live in a `sharedMappings` library.**
  It did briefly, in `console/data-access`, and the panel never loaded: the
  spinner spun forever, with no network request and no error. A
  `sharedMappings` entry is built as its own standalone bundle, separate
  from `apps/console`'s `main.ts` — and `@angular-architects/native-federation`
  cannot itself be declared a shared external (it is the package that
  establishes the shared-import mechanism `main.ts`'s own bootstrap import
  of it runs before any such mechanism exists), so it gets inlined
  independently into every bundle that imports it. Two inlined copies means
  two separate instances of the package's module-scoped `federationPromise`
  — `main.ts`'s `initFederation()` resolves one, and `loadRemoteModule`,
  called from the other, awaits a promise nothing has ever settled, forever,
  since that await happens before any fetch is attempted. The fix was
  relocating the token to `console/feature-fleet` — lazy-loaded application
  code, bundled through the same graph as `main.ts`, not a separate shared
  mapping — which is also why `apps/console/src/app/testing/console-harness.ts`
  now imports it dynamically (`await import('@linkops/console/feature-fleet')`)
  rather than statically: that library is lazy-loaded from
  `app.routes.ts`, and `@nx/enforce-module-boundaries` bans a project from
  also statically importing a library it lazy-loads elsewhere. No test seam
  in this repository catches this class of bug directly — it is a real
  cross-bundle runtime interaction, only observable when `loadRemoteModule`
  actually crosses the federation boundary, which is exactly the one step
  `ASSISTANT_REMOTE_LOADER` exists to substitute away in every other test.
  It was caught with a real headless-browser run against both dev servers,
  not a unit test.
- Version Skew — a host and a remote built at different times, deployed
  independently, disagreeing about a contract — is a risk this pattern
  does not remove in general. It does not apply here today: `apps/console`
  and `apps/assistant` build from the same commit, in the same `pnpm
  build`, with exactly one deployment path. See
  [the README's Version Skew note](../../README.md#the-assistant-remote)
  for what would have to change before that stopped being true.
