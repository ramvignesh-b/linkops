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

### Filtering and sorting the Fleet

`GET /api/links` narrows and orders the Roster with `status`, `band`, `q`,
`sort` and `dir` — see the [API reference](#get-apilinks) for the full
parameter table. Where each filter runs is not arbitrary: `band` and `q` are
fields the repository owns, so `libs/server/links-data-access` filters on
them directly. `status` is derived from Samples the repository has never
seen — giving it that knowledge would make a data-access library depend on
telemetry, against the layer rule — so status filtering, and the two
Sample-derived sorts (`status`, `throughputMbps`), happen in
`libs/server/links-api`, above the repository, once the telemetry port has
supplied the Sample each one needs. `libs/server/links-data-access` imports
nothing from `libs/server/telemetry`.

**The Console filters and sorts locally**, over the store it already holds
from the stream, rather than calling this endpoint's query parameters. The
server supports them because the contract promises them and a second client
needs them — refetching on every sort change would fight the stream that is
keeping the Console's store live. Both are correct; this reference documents
the server's behaviour without implying the Console exercises it.

### Deleting a Link

A Link together with its `version` is the unit of concurrent modification;
Telemetry Samples sit deliberately outside that boundary, with their own
lifecycle and their own storage. That is why deleting a Link is not complete
until its Samples are gone with it — a ring buffer that outlived its Link
would be a leak, and a console that runs alongside the fleet it manages is
long-lived enough for a leak to become an outage. `DELETE /api/links/:id`
removes the Link from the repository first and only then tells the telemetry
port to drop its Samples: repository-first means the Simulator, which reads
the Roster fresh every Tick, can never produce a Sample for a Link that is
already gone.

### Telemetry history and the Fleet Summary

`GET /api/links/:id/telemetry?window=5m` and `GET /api/fleet/summary` are the
two remaining reads the API promises, and both go through `TelemetryPort`
rather than the repository — the repository only ever answers "does this Link
exist", never "what has it reported". Until the Simulator lands, the answer
both endpoints give is the honest one for a fleet that has never reported: an
empty history, and a Summary where every Link is `down`, every total is zero,
and `worstLinkId` is `null`. Pinning that now is what makes the next slice's
arrival of real Samples a visible change rather than a silent one.

**The Summary is server-authoritative, and the Console never aggregates it.**
`FleetController` renders `TelemetryPort.summary()` verbatim — no counting,
no filtering, no combining it with the repository happens in
`server/links-api`. The redundancy of computing the same numbers twice, once
on the server and once on the Console, is removed rather than arbitrated: a
Tick applies as one atomic store write on the Console, so the KPI header can
never contradict the list beneath it.

**`worstLinkId` is a selection, not an aggregate.** It is the lowest `snrDb`
among Links that currently have a Sample, ties broken on the lowest `id` so
the choice is deterministic across Ticks, and Links with no Sample yet are
excluded entirely — a Link with no reading is not the worst Link in the
fleet, it is an unknown one, and `status: down, reason: stale` already says so
separately. `worstLinkId` is `null` only when no Link anywhere has reported.

### Where things live

| Library | Owns |
|---|---|
| `libs/shared/domain` | The wire schemas (`Link`, `TelemetrySample`, `FleetSummary`), the branded `LinkId`, `deriveStatus` — the one function in the system entitled to an opinion about what "good" is — and the error vocabulary (`ApiErrorBody`, the `code` union, `FieldIssue`, `zodIssuesToFieldIssues`). Framework-free, one runtime dependency: zod. |
| `libs/server/links-data-access` | `LinkRepository`, its in-memory implementation, and the ten-Link seed. Status is deliberately absent from the stored record — it is derived from Telemetry the repository has never seen. |
| `libs/server/telemetry` | `TelemetryPort`, the read side of telemetry, landed ahead of its real implementation so the REST surface doesn't change shape when the Simulator arrives. |
| `libs/server/links-api` | The HTTP surface — `GET /api/links`, `GET /api/links/:id`, `POST /api/links`, `PATCH /api/links/:id`, `DELETE /api/links/:id`, `GET /api/links/:id/telemetry`, `GET /api/fleet/summary` — the DTOs `createZodDto` generates from the shared schemas, the globally registered `nestjs-zod` validation pipe, and the one exception filter mapping domain errors onto the error envelope. |
| `apps/api` | Module registration only. |

## API reference

### `GET /api/links`

Returns the Fleet Roster with `status` derived per Link, filtered and sorted
per the query string.

| Parameter | Values | Default | Behaviour |
|---|---|---|---|
| `status` | `up` \| `degraded` \| `down` | *(none)* | Keeps only Links whose derived `status.status` matches |
| `band` | `5GHz` \| `5.8GHz` \| `11GHz` \| `24GHz` | *(none)* | Keeps only Links in that Band |
| `q` | any string | *(none)* | Case-insensitive substring match across `name`, `siteA` and `siteB` |
| `sort` | `name` \| `capacityMbps` \| `status` \| `throughputMbps` | `name` | The field rows are ordered by |
| `dir` | `asc` \| `desc` | `asc` | Sort direction |

Filters combine — `?band=5GHz&q=depot` returns only 5GHz Links whose name or
Sites contain "depot" — rather than one overriding another. Ties on the
`sort` field always break on `id` ascending, so the order is total and two
identical requests return an identical result. An unknown `sort` key or `dir`
value is rejected as `400` `VALIDATION_FAILED`, the same as any other
malformed query, rather than silently ignored.

Every seeded Link reads `down: stale` until the Simulator lands, so
`?status=down` returns the whole fleet in this slice — asserted
deliberately, not a gap.

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

### `DELETE /api/links/:id`

Decommissions a Link. Returns `204` with no body; the Link is gone from a
subsequent `GET /api/links`, and `GET /api/links/:id` for it returns `404`
`LINK_NOT_FOUND`, same as deleting an unknown id.

The repository delete runs first, and the telemetry port's `dropLink(id)`
runs second — see [Deleting a Link](#deleting-a-link) above for why that
order is load-bearing.

### `GET /api/links/:id/telemetry`

Returns the recent Telemetry Samples for one Link — what the detail view's
sparkline draws from.

| Parameter | Values | Default | Behaviour |
|---|---|---|---|
| `window` | a number followed by `s`, `m` or `h`, e.g. `30s`, `5m`, `1h` | `5m` | How far back to look for Samples |

```json
[]
```

Every seeded Link returns an empty array in this slice, since no Sample has
ever been produced — the same honest answer as `status: down, reason: stale`
on `GET /api/links`. A `window` that does not match the pattern above returns
`400` `VALIDATION_FAILED` naming `window` as the offending field. An unknown
Link id returns `404` `LINK_NOT_FOUND`, checked against the repository —
existence is a Roster question, not a telemetry one.

### `GET /api/fleet/summary`

Returns the Fleet Summary — the counts and totals a KPI header renders,
computed once by `server/telemetry` and never recomputed by a client.

```json
{
  "total": 10,
  "up": 0,
  "degraded": 0,
  "down": 10,
  "totalThroughputMbps": 0,
  "worstLinkId": null
}
```

Every seeded Link counts as `down` and `worstLinkId` is `null` in this slice,
for the same reason every Link reads `down: stale` on `GET /api/links` — no
Link has ever produced a Sample. `worstLinkId` selects the lowest `snrDb`
among Links that currently have a Sample, ties broken on the lowest `id`;
Links with no Sample yet are excluded from the selection entirely rather than
treated as the worst, and the field is `null` only when nothing in the fleet
has reported.

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
| `LINK_NOT_FOUND` | 404 | `{ id }` | `GET`, `PATCH` or `DELETE` on `/api/links/:id` with an unknown id |
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
