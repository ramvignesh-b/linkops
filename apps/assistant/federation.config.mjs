import {
  withNativeFederation,
  shareAll,
} from '@angular-architects/native-federation/config';

export default withNativeFederation({
  name: 'assistant',

  // The Assistant panel itself — a Component Remote, not a routed one. The
  // host's `AssistantWrapperComponent` (`console/feature-fleet`) is the only
  // thing that ever names this path, via `loadRemoteModule`, so there is no
  // static import from the host into `console/feature-assistant` for
  // `@nx/enforce-module-boundaries` to flag as a feature importing a
  // feature — composition happens at runtime instead.
  exposes: {
    './Component': './libs/console/feature-assistant/src/index.ts',
  },

  // Both singletons for the same reason: `@linkops/console/data-access`
  // carries `AssistantInvalidPayloadError`, and `AssistantSession` tells it
  // apart from a transport failure with `instanceof` — two separate copies
  // of the module (one bundled into this remote, one into the host) would
  // be two separate classes, and that check would silently stop matching.
  // `@linkops/shared/domain` shares the same DI context for the same class
  // of reason. Neither library is an npm dependency `shareAll` can see, so
  // each is declared explicitly rather than relying on it.
  sharedMappings: [
    [
      ['@linkops/shared/domain', '@linkops/console/data-access'],
      { singleton: true, strictVersion: true, requiredVersion: 'auto' },
    ],
  ],

  shared: {
    ...shareAll(
      {
        singleton: true,
        strictVersion: true,
        requiredVersion: 'auto',
        build: 'package',
      },
      {
        overrides: {
          // includeSecondaries is an opt-out of ignoreUnusedDeps, so all of
          // @angular/core is shared to prevent mismatches.
          '@angular/core': {
            singleton: true,
            strictVersion: true,
            requiredVersion: 'auto',
            build: 'package',
            includeSecondaries: { keepAll: true },
          },
        },
      },
    ),
  },

  skip: [
    'rxjs/ajax',
    'rxjs/fetch',
    'rxjs/testing',
    'rxjs/webSocket',
    // Add further packages you don't need at runtime
  ],

  // Please read our FAQ about sharing libs:
  // https://shorturl.at/jmzH0

  features: {
    // ignoreUnusedDeps is enabled by default now
    // ignoreUnusedDeps: true,

    // Opt-in: groups chunks in remoteEntry.json for smaller metadata file
    denseChunking: true,
  },
});
