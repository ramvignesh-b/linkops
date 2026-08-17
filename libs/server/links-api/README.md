# server-links-api

The REST surface for links and the fleet summary: list with filters and sorting,
read, create, update, delete, and telemetry history. The controllers here hold
no domain rules — they validate against the shared schemas, call the repository,
and map a result to a status code.

That mapping is the whole job. A stale version becomes 409, a taken name 400, an
unknown id 404, and every failure leaves as the same envelope, so a client can
switch on the error code exhaustively instead of parsing messages. Status is
never accepted from a request body: it is derived on the server from the latest
sample.

`openapi-document` builds the OpenAPI description from the same zod schemas the
validation pipe uses, which is why the published contract cannot drift from the
one actually enforced. It is served at `/api/openapi.json` whether or not the
Swagger explorer is mounted.

See the root [README](../../../README.md#9-api-reference) for the endpoint table
and the error envelope, and
[ADR-0006](../../../docs/adr/0006-shared-zod-schema-as-the-contract.md) for the
single-schema decision.

## Running unit tests

Run `nx test server-links-api` to execute the unit tests via [Vitest](https://vitest.dev/).
