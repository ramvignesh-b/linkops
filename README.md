# LinkOps Console

An operator console for a fleet of point-to-point radio links: live status and
throughput for every link, degraded ones visible immediately, drill-down into
one link's telemetry, and link configuration editing. Telemetry comes from a
simulator inside the API — there is no hardware and no external service.

See [`CONTEXT.md`](./CONTEXT.md) for the project's glossary and
[`docs/adr/`](./docs/adr/) for the decisions this build rests on.

## How it works

The workspace is an Nx monorepo with two runtime artifacts — the API
(`apps/api`, NestJS) and the Console (`apps/console`, Angular) — sharing a
domain contract (`libs/shared/domain`) so client and server validate against
the same rules.

### The Fleet Roster

`GET /api/links` returns every Link in the Fleet, each carrying a derived
`status`. Status is never stored and never accepted from a client — it is
computed on every read from the Link's most recent Telemetry Sample:

- **`up`** — `snrDb >= 18` and `throughputMbps >= 0.6 * capacityMbps`
- **`degraded`** — `snrDb >= 10` and `throughputMbps >= 0.2 * capacityMbps`
- **`down`, reason `metrics`** — reporting, but below the degraded floor
- **`down`, reason `stale`** — no Sample within the last 5 seconds

Staleness takes precedence over even a perfect reading: a five-second-old
Sample is not evidence a Link is healthy right now. A Link that has never
produced a Sample reads `down: stale` — the honest answer for a fleet with no
data, not a placeholder for one.

The API seeds ten Links on boot, spread across Bands, Modes and Capacities.
The seed is a fixed table, not randomly generated, so two boots produce the
same fleet.

### Where things live

| Library | Owns |
|---|---|
| `libs/shared/domain` | The wire schemas (`Link`, `TelemetrySample`, `FleetSummary`), the branded `LinkId`, `deriveStatus` — the one function in the system entitled to an opinion about what "good" is — and the error vocabulary (`ApiErrorBody`, the `code` union, `FieldIssue`, `zodIssuesToFieldIssues`). Framework-free, one runtime dependency: zod. |
| `libs/server/links-data-access` | `LinkRepository`, its in-memory implementation, and the ten-Link seed. Status is deliberately absent from the stored record — it is derived from Telemetry the repository has never seen. |
| `libs/server/telemetry` | `TelemetryPort`, the read side of telemetry, landed ahead of its real implementation so the REST surface doesn't change shape when the Simulator arrives. |
| `libs/server/links-api` | The HTTP surface — `GET /api/links`, `GET /api/links/:id`, `POST /api/links`, `PATCH /api/links/:id` — the DTOs `createZodDto` generates from the shared schemas, the globally registered `nestjs-zod` validation pipe, and the one exception filter mapping domain errors onto the error envelope. |
| `apps/api` | Module registration only. |

## API reference

### `GET /api/links`

Returns the Fleet Roster with `status` derived per Link.

```json
[
  {
    "id": "lnk_0001",
    "name": "North Ridge to Depot",
    "siteA": "North Ridge",
    "siteB": "Depot",
    "band": "5GHz",
    "mode": "PtP",
    "capacityMbps": 300,
    "txPowerDbm": 20,
    "channelWidthMhz": 40,
    "status": { "status": "down", "reason": "stale" },
    "version": 1,
    "createdAt": "2026-08-15T09:00:00.000Z",
    "updatedAt": "2026-08-15T09:00:00.000Z"
  }
]
```

Every Link reads `down: stale` until the Simulator lands — no Telemetry
Sample has ever been produced yet, and that is the correct answer, not a
limitation.

### `GET /api/links/:id`

Returns one Link together with its most recent Telemetry Sample in a single
request, so drill-down never costs two round trips.

```json
{
  "link": {
    "id": "lnk_0001",
    "name": "North Ridge to Depot",
    "siteA": "North Ridge",
    "siteB": "Depot",
    "band": "5GHz",
    "mode": "PtP",
    "capacityMbps": 300,
    "txPowerDbm": 20,
    "channelWidthMhz": 40,
    "status": { "status": "down", "reason": "stale" },
    "version": 1,
    "createdAt": "2026-08-15T09:00:00.000Z",
    "updatedAt": "2026-08-15T09:00:00.000Z"
  },
  "latestSample": null
}
```

`latestSample` is `null` until the Simulator lands — same honest answer as
`status: down, reason: stale`, for the same reason. An unknown id returns
`404` with the error envelope below.

### `POST /api/links`

Creates a Link from the eight operator-editable fields and returns it at
`version: 1`, with `createdAt` and `updatedAt` set. The created Link appears
in a subsequent `GET /api/links`.

```json
{
  "name": "North Ridge to Depot",
  "siteA": "North Ridge",
  "siteB": "Depot",
  "band": "5GHz",
  "mode": "PtP",
  "capacityMbps": 300,
  "txPowerDbm": 20,
  "channelWidthMhz": 40
}
```

| Field | Range |
|---|---|
| `name` | 3–40 characters, unique |
| `band` | `5GHz` \| `5.8GHz` \| `11GHz` \| `24GHz` |
| `mode` | `PtP` \| `PtMP` \| `S2S` |
| `capacityMbps` | 10–1000 |
| `txPowerDbm` | −10–30 |
| `channelWidthMhz` | 20 \| 40 \| 80 |

A `status` or `version` on the request body is not honoured — both are
stripped by the schema before the request reaches the repository, since
`status` is derived and `version` is repository-owned. A body outside the
ranges above returns `400` `VALIDATION_FAILED` naming the offending field; a
`name` already in use returns `409` `LINK_NAME_TAKEN`.

The DTO validating this body is generated from `linkCreateSchema` with
`createZodDto()`, and validated by `nestjs-zod`'s pipe, registered globally —
there is no hand-rolled validation pipe anywhere in this API.

### `PATCH /api/links/:id`

Edits a Link. The body carries any subset of the eight editable fields plus
the `version` the operator was looking at, and returns the whole Link at the
next version with `updatedAt` moved. `createdAt` never changes.

```json
{ "version": 1, "capacityMbps": 500 }
```

`version` is **required**, and required by `linkPatchSchema` rather than by a
check in the handler — an edit that names no version cannot be represented, so
there is no code path in which one lands without a compare-and-swap. That
asymmetry (every editable field optional, `version` mandatory) is the whole of
optimistic concurrency expressed in a schema.

If the `version` no longer matches, the answer is `409` `LINK_VERSION_CONFLICT`
carrying the **whole** current Link, not just its version number:

```json
{
  "error": {
    "code": "LINK_VERSION_CONFLICT",
    "message": "...",
    "details": {
      "currentVersion": 2,
      "current": {
        "id": "lnk_0001",
        "name": "North Ridge to Depot",
        "siteA": "North Ridge",
        "siteB": "Depot",
        "band": "5GHz",
        "mode": "PtP",
        "capacityMbps": 500,
        "txPowerDbm": 20,
        "channelWidthMhz": 40,
        "status": { "status": "down", "reason": "stale" },
        "version": 2,
        "createdAt": "2026-08-15T09:00:00.000Z",
        "updatedAt": "2026-08-15T09:04:00.000Z"
      }
    }
  }
}
```

Carrying the whole Link is the load-bearing part: it lets the Console show
theirs-versus-mine field by field. A response saying only "someone changed
this, reload" throws the operator's work away and makes them find the
difference by eye.

Renaming a Link onto a name another Link already holds returns `409`
`LINK_NAME_TAKEN`; resending a Link's own name is a no-op, not a collision. An
unknown id returns `404` `LINK_NOT_FOUND`.

The compare-and-swap lives in the repository signature —
`update(id, patch, expectedVersion)`, never `save(link)` — so a write that
skips the version check cannot be expressed. See
[ADR-0008](docs/adr/0008-repository-interface-carries-the-version-check.md).

### Errors

Every failure this API produces — across this endpoint and every one that
follows it — is the same shape:

```json
{ "error": { "code": "LINK_NOT_FOUND", "message": "...", "details": { "id": "lnk_9999" } } }
```

The HTTP status carries the class of failure; `code` carries the meaning, so
a client can handle a category generically (on the status) and a case
specifically (on `code`). `details` is typed per `code`, as a discriminated
union, so a consumer reads e.g. `details.current` without a cast.

**`message` is diagnostic** — for logs and API consumers, never for an
operator. Clients should switch on `code` for user-facing text; the Console
owns that copy because the Server does not know where an error lands.

| `code` | HTTP status | `details` | Produced by |
|---|---|---|---|
| `LINK_NOT_FOUND` | 404 | `{ id }` | `GET` or `PATCH` on `/api/links/:id` with an unknown id |
| `LINK_VERSION_CONFLICT` | 409 | `{ currentVersion, current }` | Editing a Link with a stale `version` |
| `LINK_NAME_TAKEN` | 409 | `{ name }` | Creating or renaming a Link to a name already in use |
| `VALIDATION_FAILED` | 400 | `{ issues: FieldIssue[] }` | A request body failing schema validation |
| `A2UI_INVALID_PAYLOAD` | 400 | `{ reason }` | An assistant payload the renderer will not accept |

The `code` union is closed and has no internal-error member: an error the
exception filter does not recognise is never wrapped in a synthesised
envelope, because that would misrepresent where the failure came from. It
passes through as Nest's default response instead, so a second client can
tell "the Server said no" from "something else broke" by whether the body
matches this shape at all.

Every code above except `A2UI_INVALID_PAYLOAD` is produced by the endpoints
documented here; that one is declared now, ahead of the endpoint that produces
it, so a client's exhaustive `switch` on `code` never has to grow between
slices.

## Development

```sh
pnpm install
pnpm test      # nx run-many -t test
pnpm lint      # nx run-many -t lint
pnpm build     # nx run-many -t build
pnpm start     # serves both apps/api and apps/console
```
