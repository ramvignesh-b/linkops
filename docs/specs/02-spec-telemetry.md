# Spec — Telemetry: Simulator, Ring Buffers, and the Live TelemetryPort

Status: ready-for-agent
Covers: M2, and the part of M7/M8 that only becomes checkable once real Samples exist
Slice chosen: 2026-08-15, following `spec-foundation.md`. Per `docs/agents/issue-tracker.md` this effort has no single `spec.md`; this is the second per-area spec.

## Problem Statement

The Foundation slice built a complete, curl-able REST contract, but every Link in it reads `down: stale` forever, because nothing ever writes a Telemetry Sample. That is the correct answer for a fleet that has never ticked — Foundation asserted it deliberately — but it is also the entire reason the product exists: an operator cannot spot a degraded Link, watch a sparkline, or trust a KPI header that can only ever say "everything is down because nothing has reported."

Foundation drew `TelemetryPort` as an interface precisely so this could be built without reopening a controller. That promise is untested until something actually implements the interface a second way. `server/links-api` has never been asked to serve real, moving data; if the seam is in the wrong place, this is the slice that finds out.

There is a second, quieter problem: a `Map<LinkId, RingBuffer>` that never shrinks is a leak by `CONTEXT.md`'s own definition, and a `setInterval` with no way to stop it is an orphaned timer the moment the process is asked to shut down cleanly. Both have to be closed in the same slice that opens them, not deferred to whichever ticket happens to need them next.

## Solution

One fleet-wide Simulator, ticking at 1 Hz, that reads the Roster fresh from `LinkRepository` on every Tick, walks each Link's signal forward, and writes the result into a per-Link ring buffer capped at 300 Samples. A `SimulatorTelemetryPort` replaces `NoSampleTelemetryPort` behind the existing `TELEMETRY_PORT` token, so `server/links-api` changes no controller. A `TelemetryBus` — the seam a future streaming slice will subscribe to — receives exactly one batch per Tick, unconsumed in this slice but proven to exist and to complete on shutdown.

At the end of this slice a reviewer can run the same `curl` sequence Foundation's README documents and see it come alive: `GET /api/links` shows a mix of `up`, `degraded` and `down: metrics` instead of uniform `down: stale`; `GET /api/fleet/summary` reports non-zero throughput and a real `worstLinkId`; `GET /api/links/:id/telemetry` returns a growing, capped history. Killing the process cleanly leaves no interval still firing and no incomplete stream for the next slice to inherit.

## User Stories

**The operator**

1. As an operator, I want a Link that is producing good readings to show `up`, so that a healthy fleet reads as healthy rather than as universally unreachable.
2. As an operator, I want a Link whose signal has degraded to show `degraded`, so that I can see trouble before it becomes an outage.
3. As an operator, I want a Link with a genuinely bad reading to show `down` with reason `metrics`, distinct from `stale`, so that "the feed is bad" and "the feed is silent" never look the same.
4. As an operator, I want the fleet to occasionally show a Link mid-Degradation-Episode, so that the console has something real to demonstrate rather than a fleet that is either always perfect or never running.
5. As an operator, I want the KPI header's counts and total throughput to move over time, so that I can tell the data is live rather than a fixture.
6. As an operator, I want `worstLinkId` to point at the Link with the worst signal right now, so that the header directs my attention correctly.
7. As an operator, I want a newly created Link to start reporting on the very next Tick, so that I do not have to guess how long "not yet listed" is supposed to last.
8. As an operator, I want a deleted Link's history to disappear immediately, so that nothing I removed can reappear or keep consuming memory.
9. As an operator, I want the detail view's sparkline window to fill in with real Samples up to the requested window, so that drill-down shows an actual trend rather than an empty chart.

**The engineer who built Foundation**

10. As the Foundation engineer, I want the `TELEMETRY_PORT` swap to be the only change `server/links-api` sees, so that drawing the seam ahead of its implementation is proven to have worked rather than merely asserted.
11. As the Foundation engineer, I want `NoSampleTelemetryPort` to keep passing its own tests unmodified, so that the no-Simulator case remains documented, correct behaviour rather than dead code nobody can explain.

**The engineer taking the next slice (streaming)**

12. As the engineer building SSE, I want a `TelemetryBus` already emitting one batch per Tick, so that I can subscribe to it without touching the Simulator.
13. As the engineer building SSE, I want the Bus to `complete()` on shutdown, so that an in-flight `@Sse()` observable in the next slice terminates instead of being severed mid-frame.
14. As the engineer building SSE, I want the batch shape to already be "every Sample produced this Tick", so that framing it onto the wire is a formatting step, not a data-gathering one.

**The engineer running this for a long time**

15. As that engineer, I want a Link's ring buffer capped at a fixed size, so that a fleet running for hours cannot grow memory without bound.
16. As that engineer, I want a deleted Link's buffer freed immediately rather than waiting for eviction, so that churn in the fleet does not accumulate garbage.
17. As that engineer, I want the Simulator to run on one interval regardless of fleet size, so that adding Links never adds timers.
18. As that engineer, I want a clean shutdown to actually clear the interval, so that a stopped process cannot keep writing Samples into buffers nobody will read.

**The reviewer**

19. As a reviewer, I want the ring buffer's wrap-around behaviour unit-tested at exactly its capacity boundary, so that the 300-Sample bound is demonstrated, not claimed.
20. As a reviewer, I want a delete racing an active Tick tested directly, so that "no ghost telemetry" is proven for the actual race, not just for the common ordering.
21. As a reviewer, I want a Degradation Episode's start and end forced deterministically in a test, so that the behaviour the operator stories depend on is pinned rather than left to chance.
22. As a reviewer, I want the HTTP-level contract test from Foundation extended to run across several real Ticks, so that the "every Link reads `down: stale`" assertion Foundation pinned is now shown to change once the Simulator is wired in.
23. As a reviewer, I want the shutdown hook tested by advancing the clock after `app.close()` and observing no further Samples, so that "stops cleanly" is a state assertion rather than an assumption about `clearInterval` having been called somewhere.
24. As a reviewer, I want no test in this slice to sleep, so that the "fast, deterministic" bar Foundation set is met by injection here too rather than relaxed for a component that has a literal `setInterval` in it.

## Implementation Decisions

### `server/telemetry` — the producer

- **`RingBuffer<T>`**, a fixed-capacity circular buffer. Capacity is `300`, a module-level constant matching ticket `02`'s injected-not-configured decision — never an env var. Pushing past capacity overwrites the oldest entry; reading it back (`toArray()` or equivalent) returns entries in chronological order, since that is what `history()` and a sparkline both need.
- **`Map<LinkId, RingBuffer<TelemetrySample>>`**, allocated lazily on a Link's first Sample, exactly as ticket `02` pins it. `dropLink(id)` deletes the map entry outright — the buffer is freed immediately, not left to be overwritten.
- **`Simulator`** owns one fleet-wide `setInterval` at 1000 ms — never a timer per Link. Constructor-injected: `LinkRepository` (read-only; the Simulator holds no Roster of its own, so a deleted Link is simply absent from the next Tick's read — this is what makes "no ghost telemetry" structural rather than defensive), a `Clock` (`{ now(): Date }`, injected rather than read from the global `Date`, so a Sample's `ts` is deterministic in tests without monkey-patching `Date` itself), and a `Random` (`() => number` in `[0, 1)`, injected the same way `Clock` is) — both new abstractions this slice introduces, and both exist because a `setInterval`-driven component cannot otherwise be tested without a sleep.
- **Per-Tick behaviour**: read the Roster, then for each Link advance that Link's own simulation state — a mean-reverting random walk on `rssiDbm` and `snrDb`, clamped to schema-valid ranges (`rssiDbm <= 0`; `snrDb` bounded to a realistic band) — and derive `throughputMbps` as a function of the walked `snrDb` relative to that Link's own `capacityMbps`, plus a small independent noise term. `throughputMbps` is deliberately coupled to `snrDb` rather than walked independently: `deriveStatus`'s `up`/`degraded` thresholds are a joint condition on both, and two unrelated randoms would occasionally produce a physically incoherent Sample (excellent SNR, terrible throughput) with no explanation. Every Sample produced in a Tick is pushed onto its Link's ring buffer, and the whole batch is published to the `TelemetryBus` once, after all Links in that Tick have been processed.
- **Degradation Episode** — per `CONTEXT.md`'s definition, a deliberate multi-Tick excursion with a start and an end, not a fault. Per-Link simulation state carries an optional in-progress episode. On a Tick where a Link is not already in one, the injected `Random` decides (against a fixed, low, testable probability) whether to start one; while active, the random walk's reversion target is pulled into degraded-or-down territory for a duration itself chosen once at start (a short multi-Tick range) from the same injected `Random`; when the countdown reaches zero the episode ends and the target reverts to the Link's healthy baseline. A test can force one deterministically by supplying a `Random` stub that always starts an episode of a known length.
- **`TelemetryBus`** is an RxJS `Subject` (or equivalent) that `server/telemetry` constructs and exports. The Simulator publishes one batch per Tick onto it — `{ tick, ts, samples }`, where `samples` is every `TelemetrySample` produced that Tick — and nothing in this slice subscribes to it. It exists now, unconsumed, so the streaming slice can subscribe unchanged, matching how Foundation drew `TelemetryPort` ahead of this slice's implementation.
- **`SimulatorTelemetryPort implements TelemetryPort`**, backed by the ring-buffer `Map`: `latestSample`/`latestSamples` read each buffer's newest entry; `history(id, windowMs)` filters a buffer for entries within `windowMs` of `Clock.now()`; `summary()` calls `deriveStatus` for every Link the repository currently holds against its latest Sample and `Clock.now()`, producing `up`/`degraded`/`down` counts, `totalThroughputMbps` summed only over Links that have a Sample (a Link with none contributes nothing, rather than being coerced to zero throughput as if it had reported one), and `worstLinkId` via the existing `selectWorstLinkId` (ticket `22`) — the lowest `snrDb` among Links with a Sample, ties on lowest `id`, `null` when nothing has reported, per ticket `10`. `dropLink(id)` delegates to the `Map`'s deletion.
- **`OnApplicationShutdown`** on the provider that owns the interval: `clearInterval` on the Simulator's handle, then `TelemetryBus.complete()`. Per ticket `06`'s own answer, this "lands with the thing it stops" — the mechanism belongs here even though the logging around it is a later ticket's concern.

### `server/links-api` / `apps/api` — wiring only

- `ServerLinksApiModule`'s `TELEMETRY_PORT` factory constructs `SimulatorTelemetryPort` (with the repository, a real `Clock`, a real `Random`, and the `TelemetryBus`) in place of `NoSampleTelemetryPort`. No controller changes — this is the seam Foundation drew being exercised for the first time.
- `NoSampleTelemetryPort` is not deleted. It stops being wired into `ServerLinksApiModule`, but its own spec keeps passing unmodified: it remains the documented, correct behaviour for a fleet that has never ticked, and deleting working, meaningful code because it is no longer on the happy path would be removing prior art for no reason.
- `apps/api`'s `main.ts` calls `app.enableShutdownHooks()`, which it does not yet do. Without it, `OnApplicationShutdown` above is dead code — Nest never calls it.

## Testing Decisions

**What makes a good test here**, carried forward from Foundation: assert what a caller outside the unit can observe. For the ring buffer, its read-back contents, never an internal cursor. For the Simulator, the Samples it produces and the shape of the Bus batch, never a private per-Link state object. For the port, the interface's return values, never the backing `Map`.

**Clock and randomness stay injected everywhere they are read**, extending Foundation's rule to a component that runs on its own interval rather than per-request. No test sleeps; the interval is advanced under Vitest's fake timers, and every Sample's content is deterministic because `Clock` and `Random` are test doubles, not the globals fake timers would otherwise need to intercept.

### Seam 1 — `RingBuffer`, tested directly

Pure data structure, no framework. Push past capacity evicts the oldest entry and size never exceeds `300`; pushing `1000` times leaves exactly the most recent `300`; reading back preserves chronological order; an empty buffer's read-back is empty.

### Seam 2 — `Simulator` and `SimulatorTelemetryPort`, tested as a collaboration inside `server/telemetry`

Real `InMemoryLinkRepository`, a fake `Clock`, a stubbed `Random`, Vitest fake timers driving the interval. Covers: a Link created mid-run produces its first Sample on the next Tick and none before; a delete racing an active Tick — using an order-recording double per ticket `20`'s pattern — leaves no buffer and no Sample written for that Link either way the race lands; a Link's buffer never exceeds `300` after `1000` Ticks; a `Random` stub that always starts an episode produces a traceable start-then-end pair, with the Link's derived Status changing during it and reverting after; `summary()` mid-run matches `deriveStatus` computed independently per Link, sums throughput only over Links with a Sample, and picks `worstLinkId` per ticket `10`'s rule; the `TelemetryBus` receives exactly one batch per Tick containing every Sample produced that Tick; after `app.close()`, advancing the fake clock produces no further Samples and the Bus observable has completed.

### Seam 3 — the HTTP boundary, extending Foundation's contract run

`supertest` against the real Nest application, `SimulatorTelemetryPort` now wired in, same fake `Clock`/`Random` doubles. One run advancing several Ticks: `POST` a Link, advance N Ticks, `GET /api/links` shows it at `up` or `degraded` rather than `down: stale`; `GET /api/links/:id` returns a non-null `latestSample`; `GET /api/links/:id/telemetry?window=…` returns a bounded, growing history; `GET /api/fleet/summary` reflects non-zero throughput and a real `worstLinkId`. Alongside it: `DELETE` a Link, advance another Tick, and confirm no orphaned Sample was written — the same assertion ticket `20` made when the port was a no-op, now meaningful because the port actually holds state.

**Every assertion Foundation pinned about a Sample-less fleet stays true until this slice's Ticks start** — the contract test extends Foundation's lifecycle run rather than replacing it, so the moment data starts flowing is the visible seam in the test itself.

### Prior art, and what is deliberately not reused

Foundation's factory-parameterised contract suite for `LinkRepository` exists because a second, real implementation was always the point (ADR-0008's stated test). `TelemetryPort` has no such second production implementation planned — `NoSampleTelemetryPort` and `SimulatorTelemetryPort` are the null case and the real case, not two interchangeable stores — so a suite parameterised over "any `TelemetryPort`" would be speculative reuse with nothing to prove it against. `NoSampleTelemetryPort`'s own spec remains the closest prior art for testing an implementation of this interface directly. The supertest lifecycle-run pattern and the table-driven pure-function style both carry over unchanged from Foundation.

## Out of Scope

- **SSE and `server/stream-api`** — ticket `01`, M4. The next slice subscribes to the `TelemetryBus` this one exposes; the six-event catalogue, wire framing, `fleet.snapshot`, heartbeat and reconnect are all untouched here.
- **`server/health`, the health payload, and structured lifecycle logging** — ticket `06`. `sseSubscribers` cannot exist before SSE does, and the rest of the logging table is additive on top of behaviour this slice already implements correctly without it.
- **The whole Console** — no Angular code in this slice.
- **Any configuration of Simulator tuning.** Tick interval and ring-buffer capacity are coupled constants with reasoning attached, injected for tests — not environment variables, per `map.md`.
- **Real persistence.** Unchanged from Foundation.

## Further Notes

- **Where this slice's rationale already lives**, and is deliberately not restated: ticket `02` (the lifecycle contract — no-Roster-of-its-own, one interval, deletion ordering, the 300 bound), ticket `10` (the Summary and `worstLinkId` rule), ticket `06` (why the shutdown mechanism belongs in `server/telemetry` specifically), `CONTEXT.md`'s **Tick**, **Degradation Episode** and **Snapshot vs Replay** entries, and `plan.md` §3's scalability argument for one fleet-wide interval over one timer per Link.
- **The natural next slice is streaming** — `server/stream-api`, the six-event catalogue, and the wire framing ADR-0004/0005 already pin — because it fills a Bus this slice has already built and turns every Tick this slice produces into something a browser can watch.
- **Commits follow conventional commits and land documentation with the change**, per the repo's existing history.
