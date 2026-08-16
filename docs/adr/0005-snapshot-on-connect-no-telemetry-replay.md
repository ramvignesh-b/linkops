# 5. Snapshot on connect; never replay telemetry

## Status

Accepted.

## Decision

Every new SSE connection — first connect or reconnect — receives a **`fleet.snapshot`** event carrying the full render state: link configurations, the latest sample per link, and the fleet summary. The server **never replays buffered telemetry** on reconnect.

`fleet.snapshot` is the **resync** path, not the load path. The fleet view still loads over REST; the snapshot exists so a client that drops the stream recovers in one event rather than three requests.

## Why no replay

Stale telemetry is worse than absent telemetry. An operator console showing signal readings from thirty seconds ago, indistinguishable from live ones, is a fault — the whole product is "is this link healthy *now*". Replaying a reconnect gap would also make the client's history and the server's ring buffer disagree about what "the last five minutes" means.

## Why snapshot rather than REST-on-reconnect

A reconnecting client needs configurations, samples and summary together and atomically. Three REST calls give three moments in time and three chances to fail, and the client has to orchestrate them at exactly the point where the network has already proven unreliable.

## Why REST remains the load path

Making SSE the primary load path means a blank screen for anyone whose `EventSource` is blocked, and couples first paint to a stream that is expected to drop and recover. An operator opening the console during a network wobble should still see the fleet.

## Reconnect mechanics

Native `EventSource` reconnect, with monotonic event ids and a fixed **`retry: 3000`** hint.

Hand-rolled exponential backoff is the correct answer for a stream crossing the open internet and the wrong answer for one served next to the device it reports on: it replaces a browser primitive with code that then has to be tested, to solve a thundering-herd problem a single-operator console does not have. Three seconds is fast enough that restarting the API looks instantaneous, and slow enough that a thirty-second outage is ten requests. Note that a *clean* stream close still triggers reconnect — the `EventSource` spec only stops on HTTP 204 or a non-2xx — so this hint governs shutdown behaviour too, not just crashes.

## Amendment, 2026-08-16: the Console reopens what the browser abandons

The note above records that `EventSource` stops on a non-2xx without drawing its
consequence, and building the fleet view found it: killing the API answers the
open stream request with a 500 from the dev server's proxy — a 502 from anything
sitting in front of the API does the same — and the browser then closes that
`EventSource` permanently. The screen froze correctly and never recovered.
Restarting the API read as a fleet-wide outage until the operator reloaded the
page, which is the opposite of what "three seconds is fast enough that restarting
the API looks instantaneous" promised.

So the Console reopens the stream itself in exactly one case: the `error` where
`readyState` is `CLOSED`, meaning the browser has given up rather than gone quiet
for three seconds. It reopens at the same 3000 ms the server publishes, so there
is one cadence and not two, and a reopen pending when the application is
destroyed is cancelled with the connection it would have replaced.

This does not reintroduce the backoff this ADR refused. There is no growing
delay, no jitter and no attempt ceiling — the browser still owns reconnect
wherever it is willing to do it, and the Console covers only the case where it
provably will not.

## Consequences

- On reconnect the detail view's sparkline has a visible gap for the disconnected interval. That is honest and intended; the alternative is inventing data.
- `fleet.snapshot` is a fourth event type in the catalogue and must be documented in the README's API reference with its payload shape, or anyone writing a second client against this stream will not know it exists.
- The snapshot is the largest single frame the server sends. It is bounded by fleet size, not by buffer depth, precisely because there is no replay.
