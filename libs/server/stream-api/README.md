# server-stream-api

The live stream: `GET /api/stream`, and the pipeline that turns a telemetry tick
into events a browser can apply.

One tick becomes one frame. Every link's sample for that tick travels as a
single `link.telemetry` event rather than one event per link, and every event
from a tick shares an id. The alternative — one message per sample — pushes the
cost onto the client, which then has to undo it by coalescing; batching makes
the guarantee structural instead, so one tick is one store write whether the
fleet is ten links or ten thousand.

Status changes are edge-triggered from a roster diff, so `link.status` is emitted
when a link actually transitions rather than every second. A connecting client
receives a `fleet.snapshot` immediately and telemetry is never replayed: after a
drop, resynchronising from a fresh snapshot is correct, whereas replaying a
backlog of stale samples would animate the past. `SseSubscriberCounter` tracks
live subscriptions so the stream stops producing when the last client leaves,
and the response sets the headers that stop a proxy from buffering a response
that never ends.

See the root [README](../../../README.md#9-api-reference) for the event
catalogue,
[ADR-0004](../../../docs/adr/0004-batched-per-tick-sse-framing.md) for the
framing, and
[ADR-0005](../../../docs/adr/0005-snapshot-on-connect-no-telemetry-replay.md)
for the reconnect behaviour.

## Running unit tests

Run `nx test server-stream-api` to execute the unit tests via [Vitest](https://vitest.dev/).
