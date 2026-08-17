import { InjectionToken, type Type } from '@angular/core';
import { loadRemoteModule } from '@angular-architects/native-federation';

/** The Assistant remote's name and exposed module, as declared on both ends of the federation boundary. */
const ASSISTANT_REMOTE = 'assistant';
const ASSISTANT_EXPOSED_MODULE = './Component';

/**
 * Loads the Assistant panel's component class from the `assistant` remote —
 * the one thing `AssistantWrapper`, right below, needs to mount it, and the
 * one seam this token exists to make swappable.
 *
 * A token rather than calling `loadRemoteModule` directly, for the same
 * reason `EVENT_SOURCE` (`console/data-access`) is one: the real
 * implementation crosses a browser network boundary — fetching
 * `remoteEntry.json` from a running `assistant` dev server or deployment —
 * that a test environment cannot cross. `bootConsole` (`apps/console/src/app/testing/console-harness.ts`)
 * overrides it with a loader that resolves to the real `AssistantPanel`
 * class directly, so the composition under test is exactly what ships,
 * minus the one step no test environment can perform: fetching code over
 * the network.
 *
 * Living here, next to `AssistantWrapper`, rather than in
 * `console/data-access` (where it lived until this was diagnosed) is load-
 * bearing, not a style preference: `console/data-access` is a
 * `sharedMappings` entry, built as its own standalone bundle
 * (`_linkops_console_data_access.js`) separate from `apps/console`'s
 * `main.ts`. `@angular-architects/native-federation` cannot itself be
 * declared a shared external — it is the package that establishes the
 * shared-import mechanism in the first place, so `main.ts`'s own bootstrap
 * import of it can never be resolved through it. Left un-shared, it gets
 * inlined independently into every bundle that imports it — `main.ts`'s
 * and, when this token lived in `console/data-access`, that library's own
 * separate bundle too, each with its own copy of the package's
 * module-scoped `federationPromise`. `main.ts`'s `initFederation()` only
 * ever resolved its own bundle's copy; `loadRemoteModule`, called from the
 * other one, awaited a `federationPromise` nothing had ever settled —
 * forever, with no error and no request, since that await happens before
 * any fetch is attempted. `console/feature-fleet` is not a shared mapping —
 * it is lazy-loaded application code, bundled through the same graph as
 * `main.ts` — so this token's `loadRemoteModule` call and `main.ts`'s
 * `initFederation()` call now share the one instance that matters.
 */
export const ASSISTANT_REMOTE_LOADER = new InjectionToken<
  () => Promise<Type<unknown>>
>('ASSISTANT_REMOTE_LOADER', {
  providedIn: 'root',
  factory: () => () =>
    loadRemoteModule(ASSISTANT_REMOTE, ASSISTANT_EXPOSED_MODULE).then(
      (remoteModule) => remoteModule['AssistantPanel'] as Type<unknown>,
    ),
});
