# 4. One batched SSE frame per tick, not one event per link

## Status

Accepted.

## Decision

The telemetry stream emits **one `link.telemetry` frame per simulator tick** carrying every link's sample as an array element, rather than one event per link per second. That is 1 message/second regardless of fleet size instead of N. `link.status`, `link.created` and `link.deleted` are **edge-triggered** — emitted only on transition. `fleet.summary` is emitted once per tick.

The per-sample object keeps exactly its documented shape; it is now an array element rather than a message body.

## Why

At ten links the difference is invisible. The decision is about what the shape says: a per-link event stream makes fleet size the message rate, and every consumer — the browser, the change detector, any future second client — pays for that linearly. Batching makes the tick the unit of change, which is what it actually is, since one simulator interval produces all of it.

On the client this has a concrete consequence worth naming: one frame produces **one** signal update per tick, so a zoneless Angular app has one change-detection pass per second rather than N.

## Considered Options

- **One event per link per tick** — the most literal reading of the event names, and it needs no array handling. Rejected: N messages/second, N signal updates, and a change-detection storm that grows with the fleet.
- **Per-link events with client-side coalescing** — moves the problem to every client instead of solving it once at the source. A second client author would have to rediscover it.
- **Delta frames (changed links only)** — the correct answer at scale and premature here. Recorded in the README's decisions section as the first thing to build when the fleet grows: at 10,000 links the per-tick full-fleet frame is roughly 1 MB of JSON per second *per connected client*, and that is the first bottleneck — not the `Map`, not sample generation.

## Consequences

- Every SSE consumer must handle an array, including a one-line `curl -N`. The README event catalogue therefore shows the frame shape, not a single sample.
- The edge-triggered events are the only way a client learns about status transitions and fleet membership changes. A client that ignores them and reads only `link.telemetry` will show a stale roster — see [ADR-0005](./0005-snapshot-on-connect-no-telemetry-replay.md) for the recovery path.

## Amendment — `link.updated`, a seventh event

The catalogue this ADR named — `link.status`, `link.created`, `link.deleted` — closed the hole for Fleet *membership*: a Link created or deleted in one tab now shows up in another. The same hole existed for *configuration*: a `PATCH` in one tab left stale `capacityMbps` in every other client until it reloaded, which matters precisely because Throughput is only meaningful against Capacity. `link.updated` closes it, edge-triggered on a `version` change, carrying the Link with its Status derived — the same payload shape `link.created` carries.

Detecting it costs nothing beyond what the Roster diff already computes: `link.status` needs a previous-versus-current comparison no matter where it is published from, so the diff exists either way, and a `version` comparison per Link is one more field read inside a loop it already runs. All four edge-triggered events — `link.created`, `link.updated`, `link.deleted`, `link.status` — come from one per-Tick Roster diff inside `server/stream-api`, never from a mutation-time publish in `server/links-api`: a diff anchored to the Tick cannot race the telemetry frame the way a mutation-time publish can, and `type:feature` → `type:feature` is banned by the boundary rules regardless.
