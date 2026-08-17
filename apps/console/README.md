# console

The Angular host shell: routes, providers, global styles, and the Module
Federation setup. It owns no domain logic — screens are `console/feature-*`
libraries, state is `console/data-access`, and components are `console/ui`.

`main.ts` calls `initFederation('federation.manifest.json')` before importing
the real bootstrap, so remotes are read from a manifest at startup rather than
fixed at build time. `federation.config.mjs` declares `@linkops/shared/domain`
and `@linkops/console/data-access` as singletons alongside the framework
packages: that is correctness rather than size, because a class compared with
`instanceof` across the host/remote boundary must be one class, not two.

The application runs zoneless. zone.js is not a dependency and the build
declares no polyfills entry for it, which the once-per-tick store write makes
comfortable — a 1 Hz fleet costs one change-detection pass per second rather
than one per link.

The dev server listens on 4200 and proxies `/api` to the API through
`proxy.conf.js`, which reads the same port variable the API does, so the
Console calls identical relative paths in development and production. This
project also owns the `verify-bundle-budget` target, which measures the real
first load against the budget by serving the production build and driving a
headless browser at it.

See the root [README](../../README.md#5-run-it) to start it, and the measured
bundle numbers in the README's decisions section for what that target reports.

## Running unit tests

Run `nx test console` to execute the unit tests.
