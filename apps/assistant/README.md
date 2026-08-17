# assistant

The Module Federation remote. Its entire job is building and serving one
component — `AssistantPanel`, from `libs/console/feature-assistant` — for the
Console to fetch at runtime.

`federation.config.mjs` exposes it as `./Component` and declares the same
singletons the host does, so the two share one copy of `@linkops/shared/domain`
and `@linkops/console/data-access`. `main.ts` initialises federation against a
fixed single-remote manifest before bootstrapping, where the host reads a
manifest file instead.

**This app must be running for the panel to load.** It serves on 4201, and the
Console fetches from it on demand rather than opening it directly; `pnpm start`
runs it alongside the API and the Console for exactly this reason. Start the
Console alone and everything works except the panel, which will spin and never
resolve.

Host and remote build from the same commit in the same build, so the version
skew Module Federation is usually warned about does not apply here today. What
would have to change before that stopped being true is written down in the root
README's note on the Assistant remote.

See [ADR-0014](../../docs/adr/0014-programmatic-component-remotes-for-module-federation.md)
for why this is a component remote rather than a routed one, and
[ADR-0015](../../docs/adr/0015-assistant-as-a-module-federation-remote.md) for
why the triage panel was the piece extracted.

## Running unit tests

Run `nx test assistant` to execute the unit tests.
