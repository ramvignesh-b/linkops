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
| `libs/server/links-api` | The HTTP surface — `GET /api/links`, `GET /api/links/:id` — and the one exception filter mapping domain errors onto the error envelope. |
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
| `LINK_NOT_FOUND` | 404 | `{ id }` | `GET /api/links/:id` on an unknown id |
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

Only `LINK_NOT_FOUND` is produced by the endpoints in this slice; the other
members are declared now, ahead of the endpoints that produce them, so a
client's exhaustive `switch` on `code` never has to grow between slices.

## Development

```sh
pnpm install
pnpm test      # nx run-many -t test
pnpm lint      # nx run-many -t lint
pnpm build     # nx run-many -t build
pnpm start     # serves both apps/api and apps/console
```
