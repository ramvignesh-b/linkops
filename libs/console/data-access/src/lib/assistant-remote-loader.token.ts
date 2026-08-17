import { InjectionToken, type Type } from '@angular/core';
import { loadRemoteModule } from '@angular-architects/native-federation';

/** The Assistant remote's name and exposed module, as declared on both ends of the federation boundary. */
const ASSISTANT_REMOTE = 'assistant';
const ASSISTANT_EXPOSED_MODULE = './Component';

/**
 * Loads the Assistant panel's component class from the `assistant` remote —
 * the one thing `AssistantWrapper` (`console/feature-fleet`) needs to mount
 * it, and the one seam this token exists to make swappable.
 *
 * A token rather than calling `loadRemoteModule` directly, for the same
 * reason `EVENT_SOURCE` is one, right above: the real implementation
 * crosses a browser network boundary — fetching `remoteEntry.json` from a
 * running `assistant` dev server or deployment — that a test environment
 * cannot cross. `bootConsole` (`apps/console/src/app/testing/console-harness.ts`)
 * overrides it with a loader that resolves to the real `AssistantPanel`
 * class directly, so the composition under test is exactly what ships,
 * minus the one step no test environment can perform: fetching code over
 * the network.
 *
 * Living here rather than in `console/feature-fleet`, where the one thing
 * that injects it is defined, is deliberate: `console/feature-fleet` is
 * lazy-loaded from `apps/console/src/app/app.routes.ts`, and
 * `@nx/enforce-module-boundaries` bans a project from also statically
 * importing a library it lazy-loads elsewhere — which a test harness naming
 * this token to override it would otherwise have to do. `console/data-access`
 * carries no such restriction; the Console already depends on it eagerly.
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
