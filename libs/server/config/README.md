# server-config

The configuration seam: `PORT`, `SWAGGER_UI_ENABLED`, `ASSISTANT_PROVIDER`
and `ASSISTANT_PROVIDER_KEY`, validated for coherence rather than presence —
every variable is individually optional, so a fresh clone with no `.env`
starts and runs the Assistant on the stub, and an incoherent one fails
`NestFactory.create()` naming the variable that caused it.

`loadEnvironment` is the pure function this validation lives in;
`ServerConfigModule` wires it into `ConfigModule.forRoot({ validate })` so
the failure happens at boot, and `ServerConfigService` is the one typed
place every other library reads the result through.

See the root [README](../../../README.md#configuration) for the variable
table and the [`.env.example`](../../../.env.example) file.

## Running unit tests

Run `nx test server-config` to execute the unit tests via [Vitest](https://vitest.dev/).
