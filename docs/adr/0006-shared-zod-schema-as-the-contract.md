# 6. One zod schema is the contract — server validation, client validation, and OpenAPI

## Status

Accepted.

## Decision

Every shape in `libs/shared/domain` is defined once as a zod schema; TypeScript types are `z.infer`'d from it. That single schema drives four things:

1. **Server validation** — `nestjs-zod`'s `ZodValidationPipe`.
2. **Server DTOs** — `createZodDto(schema)`, which generates the DTO class *from* the schema rather than beside it.
3. **Client validation** — Angular form validators derived from the same schema through a small `zodValidator()` adapter.
4. **The OpenAPI document** — `@nestjs/swagger`, reading those generated DTOs, with `cleanupOpenApiDoc()` post-processing the result.

No rule is written twice anywhere in the system.

### The Swagger UI is gated

The generated document is always available; the interactive explorer is mounted only when a config flag enables it, defaulting off in production. An unauthenticated API explorer that can `DELETE` a link is a different proposition on a host that manages live radio infrastructure than it is on a developer's laptop, and the endpoint table in the README — not the UI — is the contract.

## Why

Client-side validation has to mirror the server's rules, or an operator fills in a link configuration the form accepts and the API rejects. Every other approach makes that mirroring a statement of intent that decays; this one makes it true by construction, because there is only one place a rule can live. When a field's constraint changes, the pipe, the form and the API document all change with it or none of them do.

## Considered Options

- **`class-validator` + `class-transformer` DTOs** — the Nest default, and it restates every rule as decorators on classes that then have to be kept in step with the client. Two sources of truth with a convention holding them together.
- **Zod on the server, hand-written Angular validators on the client** — the common compromise. The drift is silent: the form accepts something the server rejects, and nothing fails until a user hits it.
- **`@nestjs/swagger` with hand-written `@ApiProperty()` DTO classes** — the conventional Nest setup, and the one this ADR exists to avoid: classes parallel to the schemas, restating every rule, drifting silently.
- **zod 4's `z.toJSONSchema()` plus a hand-built OpenAPI document** — no `@nestjs/swagger` at all, and briefly the chosen route. Rejected once the cost was measured properly: it still leaves us hand-rolling the validation pipe and assembling the document, where `nestjs-zod` supplies both. The objection that swung it originally — 11.7 MB of `swagger-ui-dist` — was about 1% of this workspace's `node_modules` and did not survive contact with the denominator.

## Consequences

- `libs/shared/domain` has exactly one runtime dependency: zod. **`nestjs-zod` does not belong there** — `createZodDto()` is a server concern and lives in `server/links-api`, or the shared library stops being framework-free and the client starts importing Nest.
- Adopting `nestjs-zod` is a first-endpoint decision, not a later one: retrofitting it means rewriting every DTO signature and the pipe registration.
- The `zodValidator()` adapter has to map zod issue paths onto Angular control error objects. That mapping is the only place the two worlds meet, and it is small enough to test exhaustively.
- Branded ids (`LinkId`) are branded; scalars like Mbps and dBm deliberately are not — the schema already enforces range at every boundary, and branded numbers added ceremony without catching a real bug. Stated here rather than left for a reader to infer as an oversight.
