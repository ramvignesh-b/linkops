# Spec — Streaming: the SSE Endpoint, the Event Catalogue, and the Wire Format

Status: ready-for-agent
Covers: M4, and `plan.md` §10 verification steps 3 and 5
Slice chosen: 2026-08-16, following `spec-foundation.md` and `spec-telemetry.md`. Per `docs/agents/issue-tracker.md` this effort has no single `spec.md`; this is the third per-area spec.

## Problem Statement

The Simulator writes a Sample for every Link every second, and nothing can watch it happen. Every read the API offers is a poll: `GET /api/links` answers "what is true right now" and then goes quiet. An operator console built on that surface has two bad options — poll at 1 Hz and pay N requests per second for data the server already knows changed, or refresh on a button and stop being an operator console.

Polling also cannot express the one distinction this product exists to make. A poll that returns the same numbers cannot tell an operator whether the fleet stopped moving or their own connection did, and by `CONTEXT.md`'s definition that is a **Stall** — the worst customer-visible fault here, because it looks exactly like everything being fine.

There is a narrower problem too. `TelemetryBus` was built in the telemetry slice as a producer with no consumer: one batch per Tick, published and dropped on the floor. It was drawn ahead of its use for the same reason Foundation drew `TelemetryPort` ahead of the Simulator — and, like that seam, it is unproven until something on the other side actually subscribes to it. If the batch is the wrong shape, or the Bus is in the wrong library, this is the slice that finds out.

Finally, three claims the repository has made in ADRs and never demonstrated: that one frame per Tick is what a client receives regardless of fleet size, that a reconnecting client resynchronises from a single `fleet.snapshot` rather than three REST calls, and that a disconnected client's subscription is released rather than leaked. All three are wire-level behaviour, and none of them is currently observable.

## Solution

One endpoint — `GET /api/stream` — served by `server/stream-api`, the library scaffolded for it and empty since.

On connect, every client receives a `fleet.snapshot`: Roster, latest Sample per Link, and Fleet Summary captured together, carrying `retry: 3000`. Thereafter each Tick produces one batched `link.telemetry` frame carrying every Link's Sample as an array element, a `fleet.summary`, and whichever edge-triggered events that Tick's Roster diff produced — `link.created`, `link.updated`, `link.deleted`, `link.status`. A `: hb` comment line every 15 s keeps an idle connection alive through anything that would otherwise time it out. The event id is the Tick number, it is diagnostic only, and the server ignores `Last-Event-ID` because it never replays.

At the end of this slice `curl -N http://localhost:3000/api/stream` prints a snapshot immediately, then one telemetry frame per second; creating, editing and deleting a Link in another terminal shows up as events on that open stream within a Tick; killing the curl releases the subscription; and stopping the API ends the response cleanly rather than severing it mid-frame.

## User Stories

**The operator (through any client built on this stream)**

1. As an operator, I want the fleet's readings to update on their own once, so that a number on screen going still means the fleet went still and not that I forgot to refresh.
2. As an operator, I want a Link that transitions to `degraded` to announce itself, so that I notice trouble without scanning every row.
3. As an operator, I want a `down` Link's `reason` to travel with the transition, so that "the feed is silent" and "the signal is bad" stay different things at the moment I am told about them.
4. As an operator, I want a Link another operator created to appear in my view without a reload, so that two people working the same fleet see the same fleet.
5. As an operator, I want a Link another operator deleted to disappear from my view, so that I never act on a row that no longer exists.
6. As an operator, I want a Link another operator reconfigured to show its new configuration, so that the capacity a throughput reading is judged against is the one currently in force.
7. As an operator, I want the KPI header's counts and total throughput to move with the same Tick the rows move on, so that the header can never contradict the list I am reading it against.
8. As an operator, I want my client to recover on its own after a network wobble, so that a dropped stream costs me a few seconds rather than a reload.
9. As an operator, I want the readings after a recovery to be current rather than a replay of what I missed, so that I never act on a thirty-second-old signal presented as live.
10. As an operator, I want a restart of the API to look like a brief pause, so that routine maintenance does not read as a fleet-wide outage.

**The author of a second client, working only from the README**

11. As that author, I want one endpoint carrying the whole catalogue, so that I do not have to discover a second stream.
12. As that author, I want each per-Sample object to be exactly the shape the REST endpoints return, so that one parser serves both surfaces.
13. As that author, I want the batched frame documented as an array, so that I do not write a per-Link handler and then find out at fleet scale.
14. As that author, I want `fleet.snapshot` documented with its payload, so that I know the resync path exists at all.
15. As that author, I want the README to state plainly that `Last-Event-ID` is ignored and telemetry is never replayed, so that I do not build resumption on top of a server that does not offer it.
16. As that author, I want the event id to be the Tick number, and events from one Tick to share it, so that I can tell what arrived together.
17. As that author, I want events from one Tick to arrive in a documented order, so that I never receive a Sample for a Link I have not been told about.
18. As that author, I want the stream's `status` for a Link to be the same value `GET /api/links` would give at that moment, so that the two surfaces cannot disagree.
19. As that author, I want a `curl -N` to be a complete and sufficient client, so that I can inspect the stream before writing any code.

**The engineer who built the telemetry slice**

20. As that engineer, I want the streaming slice to subscribe to `TelemetryBus` without reopening the Simulator, so that publishing a batch nobody consumed turns out to have been the right seam.
21. As that engineer, I want the Bus batch to carry its Tick number, so that the wire's `id:` comes from the component that owns the Tick rather than from a counter kept in sync by hand.
22. As that engineer, I want `Bus.complete()` on shutdown to end every open response cleanly, so that the shutdown work done in that slice has a visible consequence.

**The engineer running this alongside the device for days**

23. As that engineer, I want a disconnected client's subscription released immediately, so that a client that comes and goes all day cannot accumulate subscriptions.
24. As that engineer, I want the per-Tick work to be done once and shared across connections, so that a second operator opening the console does not double the server's per-Tick cost.
25. As that engineer, I want one heartbeat timer for the whole server rather than one per connection, so that connections stay cheap in timers as well as in memory.
26. As that engineer, I want an idle connection to survive an intermediary's idle timeout, so that a quiet fleet does not look like a dead one.
27. As that engineer, I want the subscriber count to be readable from inside the process, so that the health instrument in the observability slice has something true to report.
28. As that engineer, I want deleting a Link while clients are streaming to be ordinary, so that the case the brief names explicitly is not the case that takes the server down.

**The reviewer**

29. As a reviewer, I want the tests to assert on the actual bytes a client receives, so that "the wire format is this" is demonstrated rather than described.
30. As a reviewer, I want the heartbeat tested with a fake clock, so that a 15-second behaviour costs the suite nothing and is deterministic.
31. As a reviewer, I want a real client disconnect in the tests rather than a simulated one, so that subscription release is proven against the mechanism that actually releases it.
32. As a reviewer, I want two concurrent clients in one test, so that "one frame per Tick regardless of who is watching" is checked with more than one watcher.
33. As a reviewer, I want the edge-triggered events driven by real REST calls against the same running app, so that the diff is exercised through the path an operator actually takes.
34. As a reviewer, I want a Status transition asserted to be emitted once rather than every Tick, so that "edge-triggered" is a tested property and not a naming convention.
35. As a reviewer, I want no test in this slice to sleep, so that the bar Foundation and Telemetry set is met by a component whose entire subject is elapsed time.

## Implementation Decisions

### `server/stream-api` — the endpoint

- **`GET /api/stream`**, a `StreamController` using Nest's `@Sse()`. The path is the one `plan.md` §10 verification step 3 already names, so the verification script and the code agree without either being rewritten.
- **`@Sse()` rather than a hand-written `@Res()` response.** Verified against `@nestjs/core@11.1.29`'s `SseStream`: it serializes `event:`, `id:`, `retry:`, `data:` and — the part that decides this — **comment lines**, and it treats a comment-only message as exempt from its automatic id assignment. The heartbeat therefore does not need a raw socket write, and taking `@Res()` would mean re-implementing framing, header commitment and disconnect handling that already exist and are already correct.
- **The response headers come from Nest, not from us.** `SseStream.commitHeaders` already sets `Content-Type: text/event-stream`, `Connection: keep-alive`, a full no-store `Cache-Control`, and **`X-Accel-Buffering: no`**. Ticket `01` budgeted "one line in code and one in the README" for that last header; the code line turns out to be unnecessary, so this slice writes the README line and asserts the header in a test rather than setting it twice.
- **Headers are deferred until the first message.** Because `fleet.snapshot` is emitted synchronously on subscribe, a client's response headers arrive immediately — which is what makes `curl -N` show something at once rather than appearing to hang.
- **`retry: 3000` rides on the `fleet.snapshot` message** — the first message of every connection, including every reconnect, which is exactly where the hint belongs. No second mechanism, no hand-rolled backoff. Per [ADR-0005](../../docs/adr/0005-snapshot-on-connect-no-telemetry-replay.md).
- **The event id is the Tick number**, set explicitly on every message. It must be set explicitly: `SseStream` assigns its own incrementing id when one is absent, which would produce a second, subtly different counter on the wire. Several events emitted during Tick *n* all carry id *n* — meaningful rather than ambiguous, per ticket `01`.
- **`Last-Event-ID` is ignored.** No resumption, no replay ([ADR-0005](../../docs/adr/0005-snapshot-on-connect-no-telemetry-replay.md)). This needs one explicit line in the README's API reference, because a second-client author will otherwise reasonably assume the ids mean resumption works.
- **The heartbeat is a comment-only message every 15 s**, merged into the connection's stream from a single shared source. On the wire Nest renders it `: hb` — its comment prefix includes a space, where ticket `01` wrote `:hb`. The difference is invisible to any client (both are comments) and is recorded here so the test asserts what the server actually writes.
- **The heartbeat timer is fleet-wide, not per connection**, for the same reason the Simulator runs one interval rather than one per Link: connections should not add timers. A client connecting mid-interval waits less than 15 s for its first heartbeat, which is harmless.

### The fleet event stream — built once, multicast

- **One derived observable, `share()`d across connections.** The Tick→events pipeline subscribes to `TelemetryBus` exactly once and every connection reads the result. Doing the diff per connection would make the per-Tick cost proportional to the number of operators watching, which is the same shape of mistake [ADR-0004](../../docs/adr/0004-batched-per-tick-sse-framing.md) rejected when it rejected one event per Link.
- **Per-connection state is the snapshot and nothing else.** A connection is `concat(snapshot at subscribe time, the shared event stream)` merged with the shared heartbeat. There is no per-connection buffer, no per-connection diff and no per-connection timer, so a connection costs one subscription.
- **Edge-triggered events come from a per-Tick Roster diff**, computed inside `server/stream-api`, not published by `server/links-api` on mutation. Three reasons, in order of weight: `link.status` needs a previous-versus-current comparison no matter where it is published from, so a diff exists either way and publishing membership separately means maintaining two mechanisms; `type:feature` → `type:feature` is banned by the boundary rules, so a published event would have to travel through a bus in a data-access library that both features import, which is wiring bought for nothing; and a diff anchored to the Tick cannot race the telemetry frame, whereas a mutation-time publish can arrive between two Ticks and be applied by a client against a Roster it has not yet been told changed. The cost is that a create, edit or delete is announced on the next Tick — up to a second later — which is under the threshold at which an operator notices, and is the same latency the readings themselves already have.
- **The catalogue is seven events, not six.** Ticket `01` added `link.created` and `link.deleted` because nothing carried Fleet membership; the same hole exists for *configuration*, and a `PATCH` in one tab otherwise leaves stale `capacityMbps` in every other client until it reloads — which matters precisely because Throughput is only meaningful against Capacity. With the Roster diff already running, detecting it is a `version` comparison per Link. [ADR-0004](../../docs/adr/0004-batched-per-tick-sse-framing.md) gets an amendment recording the seventh event and this reason; the README's event catalogue lists all seven.

| Event | Cadence | Payload |
|---|---|---|
| `fleet.snapshot` | on every connection | `{ tick, ts, links, samples, summary }` |
| `link.created` | edge-triggered | the `Link`, status derived |
| `link.updated` | edge-triggered, on a `version` change | the `Link`, status derived |
| `link.deleted` | edge-triggered | `{ linkId }` |
| `link.telemetry` | every Tick | `{ tick, ts, samples }` — every Link's Sample as an array element |
| `link.status` | edge-triggered, on a Status change | `{ linkId, status, previous }`, carrying `reason` when `down` |
| `fleet.summary` | every Tick | the `FleetSummary` |

- **Order within a Tick is a documented guarantee**: membership first (`link.created`, `link.updated`, `link.deleted`), then `link.telemetry`, then `link.status`, then `fleet.summary`. A client is therefore never handed a Sample for a Link it has not been told about, a Status transition is never derived from a Sample the client has not yet seen, and the Summary always arrives last, describing the state everything before it just produced.
- **`link.status` carries `previous`**, the Status the diff just replaced — the shape the API contract's own example prints. The diff holds both values at the moment it emits, so this is one property rather than a mechanism, and it lets a client say "went degraded" instead of "is degraded".
- **Status on the stream is computed exactly as the REST surface computes it** — `deriveStatus` against the Link and the latest Sample from `TelemetryPort`, at the same instant. Not a second derivation path with its own rules. Ticket `08` makes the server the single authority on Status; two authorities inside the same server would be the same bug at a smaller scale.
- **A Link created between the Simulator's Roster read and the diff** appears as `link.created` with `down: stale` and gets its first Sample on the following Tick. That is what `GET /api/links` would say about it at the same instant, so the two surfaces still agree; no special case.
- **`fleet.snapshot` reuses the Sample shape**, per ticket `01` — one apply path on the client for samples rather than two, which makes the snapshot explainable as "a `link.telemetry` frame plus Roster plus Summary". Its `tick` is the last Tick emitted, or `0` on a connection opened before the first Tick.
- **Subscriber accounting lives in a small provider in `server/stream-api`** — incremented when a connection subscribes, decremented in `finalize()`. Verified: Nest's `RouterResponseController.sse` unsubscribes on the response's `close` event, so `finalize()` is the release. This slice exposes the count only as a provider read in-process; the observability slice (ticket `06`) is what puts it on `GET /api/health` as `sseSubscribers`.

### `server/telemetry` — the Bus batch carries its Tick

- **`TelemetryBus` publishes a Tick envelope, `{ tick, ts, samples }`, rather than a bare `readonly TelemetrySample[]`.** The wire needs the Tick number for `id:` and the timestamp for the frame, and the Simulator is the component that owns both — it owns the interval. Deriving them anywhere else means a second counter that has to be kept in sync with the first, which is the thing ticket `01` rejected when it chose the Tick number as the id. `spec-telemetry.md` specified this envelope; the implementation landed the array. Nothing consumes the Bus today, so this changes no caller.
- **The Simulator holds the Tick counter**, incremented once per Tick, starting at 1 for the first Tick. Ticket `06`'s health instrument wants the same number as `ticks`, so it has one home from the start.

### Module wiring — the providers move down to the libraries that own them

- `ServerLinksApiModule` currently provides `LINK_REPOSITORY`, `TELEMETRY_SAMPLE_STORE`, `TELEMETRY_BUS`, `Simulator` and `TELEMETRY_PORT`. `server/stream-api` needs the same instances — a second Simulator or a second sample store would be two fleets in one process — and it cannot import `server/links-api`, because `type:feature` → `type:feature` is banned.
- **The fix is to move each provider into the library that owns it**: a Nest module in `server/links-data-access` providing and exporting `LINK_REPOSITORY`, and a Nest module in `server/telemetry` providing and exporting `TELEMETRY_SAMPLE_STORE`, `TELEMETRY_BUS`, `Simulator` and `TELEMETRY_PORT`, importing the first for the repository the port and Simulator read. `data-access` → `data-access` is permitted, and ticket `22` already established that edge.
- Both feature modules then import both provider modules. `ServerLinksApiModule` keeps its controllers, its `APP_FILTER` and its `APP_PIPE`; `ServerStreamApiModule` keeps the stream controller and the subscriber counter. `AppModule` imports both feature modules. The error envelope and validation pipe stay in force everywhere, because `APP_FILTER` and `APP_PIPE` are application-scoped wherever they are registered.
- This is a refactor the wiring was always going to need, and it removes an oddity that predates it: a links feature module was the only place that knew how to construct a Simulator.

### `shared/domain` — the wire schemas

- Every event payload gets a zod schema in `shared/domain`, per [ADR-0006](../../docs/adr/0006-shared-zod-schema-as-the-contract.md): the telemetry frame, the snapshot, the status event, the deleted event, and a discriminated union over the event name covering the catalogue. The Console validates against these in a later slice, and a schema is what makes a seventh event impossible to add without the union failing to compile.
- The per-Sample object stays `telemetrySampleSchema` unchanged, referenced rather than restated — that is what makes ADR-0004's "the per-sample object keeps exactly its documented shape" literally true rather than approximately true.
- **The OpenAPI document lists the endpoint but not the frame shapes.** `GET /api/stream` is registered with its `text/event-stream` response so it is not invisible in a generated document, and the event catalogue lives in the README, where a shape-per-event table is readable. OpenAPI has no good vocabulary for a stream of alternating event types, and inventing one would be a document nobody can act on.

### `apps/api`

- Imports `ServerStreamApiModule` alongside `ServerLinksApiModule`. `enableShutdownHooks()` is already called; the shutdown path needs nothing new — `Bus.complete()` propagates through the derived stream and every open response ends cleanly, which is the consequence the telemetry slice built and could not yet demonstrate.

## Testing Decisions

**What makes a good test here**: assert what a client outside the process receives. For this slice that is unusually literal — the deliverable *is* the bytes on the wire, so the tests parse `event:`, `id:`, `data:` and comment lines out of a live response and assert on the parsed frames. No test reaches for the derived observable, the diff function or the subscriber provider's internals; the one thing read from inside the process is the subscriber **count**, because it is the count itself that the release story is about and the observability slice will publish it unchanged.

**One seam: the live HTTP stream.** The whole slice is tested through a real, listening server. There is no second seam for the diff or the frame builder, deliberately: every property worth pinning — ordering within a Tick, edge-triggering, id numbering, heartbeat cadence, subscriber release — is observable from outside, and a unit test of the diff would assert the same facts one layer further from the thing a client depends on.

**No sleeps.** Fake timers cover `Date`, `setInterval` and `clearInterval` and are installed *before* `app.init()`, so the Simulator's interval and the heartbeat's `interval(15_000)` are both captured; `setTimeout` stays real, which is what keeps the HTTP request/response cycle working underneath a fake clock. This is exactly `useTickingServer`'s trick from `server-links-api.module.spec.ts`, and the comment there explaining why is the prior art.

### The harness

`app.listen(0)` on an ephemeral port, then `fetch` with an `AbortController`, and a small async iterator that parses SSE frames off the response body as they arrive. Aborting the controller is a **real** client disconnect, which is what makes subscriber release testable against the mechanism that actually performs it.

Supertest was considered and is the wrong tool here, for a stated reason worth keeping: it buffers a response until it ends, and an SSE response never ends. Driving it would mean a custom `.parse()` plus a forced socket destroy, and the disconnect being tested would be one the test manufactured rather than one a client caused. Supertest stays the right tool everywhere else in the repo, and every existing HTTP test keeps using it.

### What the seam asserts

**Six tests, in this order.** They are ordered by what they defend, and the ordering is the cut list: if the slice runs long, tests are dropped from the bottom, never from the top. The three at the top are M4's three verbs, which is what a reviewer checks first.

1. **Release on disconnect** — two concurrent clients; the subscriber count goes 0 → 1 → 2 → 1 → 0 across connect, connect, abort, abort, and the surviving client keeps receiving frames uninterrupted while the other is gone. This is the leak M4 names, and it needs two clients to be worth anything.
2. **Coalescing** — advancing ten Ticks with a seeded fleet produces exactly ten `link.telemetry` frames and ten `fleet.summary` events, no more, with each frame's `samples` array holding one element per Link, key-for-key identical to the Sample shape the REST surface returns. One frame per Tick regardless of fleet size is the whole of ADR-0004, asserted in one test.
3. **Reconnect** — a second connection to the same running app receives `fleet.snapshot` first, carrying `retry: 3000`, the Roster with derived Status, the latest Sample per Link and the Summary, all agreeing with what `GET /api/links` and `GET /api/fleet/summary` return at that instant. A reconnect *is* a new connection to this server, which is why one test covers both.
4. **Edge-triggering, driven over REST against the same app** — a `POST`, a `PATCH` and a `DELETE`, then one Tick: one `link.created`, one `link.updated` carrying the new `version`, one `link.deleted`, none of them repeated on the following Tick, and no further Samples for the deleted Link in any later frame. This is also `plan.md` §10 step 5, so it is not a separate test.
5. **Heartbeat and ids** — with the fake clock advanced past 15 s a comment frame appears carrying no id and no event type, and the Tick ids either side of it are still consecutive. Two properties in one test because the second is only interesting in the presence of the first.
6. **Shutdown** — `app.close()` ends every open response cleanly; the reader sees end-of-stream rather than an error.

**Deliberately not separate tests**: the connection headers (asserted inside test 3, where the response is already in hand), the within-Tick ordering (asserted on the frame sequence tests 2 and 4 already collect), and status-matches-REST (asserted inside test 4, where a transition is already being forced). Each is a real property; none earns its own boot of the application. The brief's own bar is *"one good API-contract test beats twenty shallow ones"*, and six tests that each defend a named requirement is the reading of that which still leaves the requirement covered.

### Prior art

`server-links-api.module.spec.ts` is the closest model in every respect that matters: it boots the real module with real providers, it fakes exactly the three timer surfaces needed and explains why, and it drives behaviour through HTTP rather than through the classes. The streaming harness is that file's `useTickingServer` with `listen(0)` and a stream reader added. The order-recording double pattern from ticket `20` is not needed here — ordering is asserted on the wire, where it is a client-visible property rather than a call sequence.

## Out of Scope

- **The whole Console.** No `EventSource` client, no store, no gap reconciliation or sparkline break — ticket `09`. This slice ends at the wire.
- **`server/health` and the logging table** — ticket `06`. The subscriber count exists as a provider here because the release story needs it; publishing it as `sseSubscribers`, reporting `ticks`, and the connect/disconnect log lines all belong to that slice.
- **`Last-Event-ID` resumption and any form of Replay** — refused by [ADR-0005](../../docs/adr/0005-snapshot-on-connect-no-telemetry-replay.md), and this slice documents the refusal rather than softening it.
- **Delta frames — changed Links only.** [ADR-0004](../../docs/adr/0004-batched-per-tick-sse-framing.md) already records this as the first thing to build when the fleet grows, and building it now would optimise a fleet of ten.
- **Verifying the stream through the Angular dev-server proxy on 4200** — ticket `05`, and impossible until there is a Console to serve. The `curl -N` verification here goes straight to 3000.
- **Authentication on the stream.** Same posture as every other endpoint in this build, for the same stated reason.
- **Backpressure handling for a slow client.** Node's socket buffering is what it is; at one frame per second and a fleet of ten there is nothing to shed, and inventing a drop policy would be a mechanism with no failure to point at.

## Budget

**Three hours, and the cut order is written down because the remaining time is 1.5 days and the Console does not exist yet.** Roughly: provider modules and the Bus envelope 45 min, the endpoint and the shared event stream 45 min, the six tests 60 min, README catalogue and the ADR-0004 amendment 30 min.

If it runs over, cut from the bottom of the test list first, then the ADR amendment (a README line covers `link.updated` until there is time to record it properly). Do **not** cut the provider modules to save time — they are what stops a second Simulator existing, and unpicking that later costs more than doing it now.

## Further Notes

- **Where this slice's rationale already lives**, and is deliberately not restated: ticket `01` (the catalogue, the framing, the id decision, the heartbeat interval), [ADR-0004](../../docs/adr/0004-batched-per-tick-sse-framing.md) (batching), [ADR-0005](../../docs/adr/0005-snapshot-on-connect-no-telemetry-replay.md) (snapshot, no replay, `retry: 3000`), ticket `08` (Status is server-derived, one authority), ticket `10` (the Summary is server-authoritative), ticket `11` (both runtime shapes are same-origin, so CORS never enters this), and `CONTEXT.md`'s **Fleet Snapshot**, **Stall**, **Leak** and **Snapshot vs Replay** entries.
- **Two documents change when this lands.** [ADR-0004](../../docs/adr/0004-batched-per-tick-sse-framing.md) gains an amendment for `link.updated` and the seventh event; the README gains the event catalogue, the ordering guarantee, the `Last-Event-ID` line, and the `X-Accel-Buffering` note. Both land in the commit that makes them true, per the repository's own rule.
- **Three facts were verified against `@nestjs/core@11.1.29`'s source rather than assumed**, because each one changed a decision: `SseStream` serializes comment lines and exempts comment-only messages from id assignment (so the heartbeat needs no raw socket write); it already sets `X-Accel-Buffering: no` (so ticket `01`'s code line is unnecessary); and `RouterResponseController.sse` unsubscribes on the response `close` event (so `finalize()` is the subscription release, not a hopeful addition).
- **The natural next slice is the Console**, which is the first consumer of everything three slices have now built, and the first place a human being sees any of it.
