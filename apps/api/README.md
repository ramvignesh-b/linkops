# api

The NestJS shell. It bootstraps and configures; it owns no domain logic, and
every rule it enforces lives in a `server/*` or `shared/*` library.

What it does, in order: validate the environment with `loadEnvironment()` before
Nest touches anything, so an incoherent configuration produces one clean line
rather than a stack trace through `NestFactory`'s internals; create the
application; register shutdown hooks, which is what actually stops the
simulator's interval and the telemetry bus on a Ctrl-C or a container stop;
set the `api` global prefix; serve the generated OpenAPI document at
`/api/openapi.json` unconditionally, mounting the Swagger explorer at `/api`
only when it is enabled; and listen on the configured port.

`AppModule` wires four libraries — config, links-api, stream-api and
a2ui-agent. `ServerConfigModule` is imported explicitly rather than relied on
transitively, so the environment check runs even for a module built by hand in a
test.

See the root [README](../../README.md#5-run-it) for how to start it and what a
working first load looks like.

## Running unit tests

Run `nx test api` to execute the unit tests via [Vitest](https://vitest.dev/).
