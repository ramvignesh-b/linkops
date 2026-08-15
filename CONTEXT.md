# LinkOps Console

An operator console for a fleet of point-to-point radio links: live status and throughput for every link, degraded ones visible immediately, drill-down into one link's telemetry, and link configuration editing. Telemetry comes from a simulator inside the API — there is no hardware and no external service.

## Language

### The fleet and its parts

**Link**:
One point-to-point radio connection, and the unit everything else is indexed by. A Link is a *configuration* — name, Sites, Band, Mode, Capacity, `version`. It never carries a status or a reading; those are derived.
_Avoid_: radio, connection, device, node

A Link together with its `version` is the **unit of concurrent modification**: two operators editing the same Link contend, two operators editing different Links never do. Telemetry Samples sit deliberately outside that boundary — they have their own lifecycle and their own storage — which is why deleting a Link is not complete until its Samples are gone with it.

**Fleet**:
The set of all Links known to the system. Used alone, it means membership and nothing else — "the fleet changed" means a Link was created or deleted, never that a reading moved.
_Avoid_: network, cluster, estate

**Fleet Roster**:
The Links themselves — the configurations. Changes only on create and delete, never on a tick.

**Fleet Summary**:
The aggregate counts and totals across the fleet (how many up, degraded, down; total throughput), and the `worstLinkId` (the reporting Link with the lowest SNR). Computed on the server, recomputed every tick, and never a source of membership: a Link's absence from a Summary means nothing.
_Avoid_: KPIs, stats, overview

**Fleet Snapshot**:
Roster, latest Telemetry Sample per Link, and Summary, captured together at one moment and sent as a single event to every new stream connection. The one artifact that carries all three, and the reason it exists is that a recovering client needs them to agree with each other.
_Avoid_: initial state, dump, sync payload

### The system

**Console**:
The browser application an operator works in, and the libraries it is composed of. Named for the product itself.
_Avoid_: client, frontend, UI app

**Client**:
Any consumer of the API — the Console is one, a `curl -N` on the stream is another, and a second client written from the README is the case the streaming design has to hold up for. Never used to mean the browser platform: that is the Console.

**Server**:
The runtime the API and the Simulator share. A description of where code runs, not of what it does — which is why the Simulator lives there without being an API.
_Avoid_: backend, API (the API is one part of the server, not the whole)

**Simulator**:
The single process that produces every Telemetry Sample for the whole Fleet, one Tick at a time. One fleet-wide instance, never a timer per Link — it reads the Roster fresh each Tick, so a Link's creation or deletion needs no code of its own to reach it.
_Avoid_: engine, generator, mock service

### Radio

The vocabulary a Link is configured and measured in. Thresholds are not defined here — they live with `deriveStatus`, which is the only thing entitled to an opinion about what "good" is.

**Site**:
One end of a Link. Every Link joins exactly two, `siteA` and `siteB`.
_Avoid_: endpoint, station, location

**Band**:
The frequency band a Link operates in — `5GHz`, `5.8GHz`, `11GHz`, `24GHz`. Higher bands carry more capacity over shorter distances and lose more to rain.

**Mode**:
The Link's topology — `PtP` point-to-point, `PtMP` point-to-multipoint, `S2S` site-to-site.

**Channel Width**:
The width of the radio channel in MHz — 20, 40 or 80. Wider carries more throughput and picks up more interference.

**Tx Power**:
The transmit power a Link is configured to emit, in dBm. Set by an operator — unlike RSSI and SNR, which are measured.
_Avoid_: power, gain

**RSSI**:
Received signal strength, in dBm. Negative, and closer to zero is stronger.
_Avoid_: signal, signal strength

**SNR**:
Signal-to-noise ratio, in dB. How far the signal sits above the noise floor, and a better predictor of usable throughput than RSSI alone. Higher is better.

**Capacity**:
The maximum throughput a Link is provisioned for, in Mbps. A configuration value, and the ceiling Throughput is judged against.

**Throughput**:
Traffic actually passing over a Link, in Mbps. Only meaningful relative to Capacity — 40 Mbps is healthy on a 50 Mbps Link and a fault on a 1000 Mbps one.
_Avoid_: bandwidth, traffic, rate

### Telemetry

**Telemetry Sample**:
One set of readings for one Link at one instant — rssi, snr, throughput. Produced by the Simulator at 1 Hz.
_Avoid_: metric, datapoint, reading, measurement

**Tick**:
One iteration of the fleet-wide simulator interval — one second. The unit of change in this system: every Sample in a batch shares a Tick, and a Tick is what a stream frame corresponds to.

**Ring Buffer**:
The bounded, per-Link storage for live Telemetry Samples. Allocated lazily on the first Sample, and evicted completely the instant a Link is deleted to prevent leaks.

**Degradation Episode**:
A deliberate multi-Tick excursion the Simulator drives a Link through so the console actually shows degraded links. It has a start and an end, and it is *simulated behaviour*, not a fault — distinct from a Link genuinely being `down`.
_Avoid_: outage, incident, failure, event

**Status**:
A Link's health at a moment, derived — never stored, and never accepted from a client. `up`, `degraded` or `down`, carrying a `reason` when down (`stale` — no telemetry — versus `metrics` — poor signal). The two reasons are different things to an operator and the UI says so.

**Snapshot** vs **Replay**:
A Snapshot is current state sent once. A Replay would be buffered history re-sent after a gap. This system snapshots and **never replays**: a reading from thirty seconds ago, indistinguishable from a live one, is a fault rather than a recovery.

### Customer-visible faults

**Stall**:
The stream stops delivering while still appearing connected — the client holds an open connection, the UI shows no error, and the numbers quietly stop moving. Visible to an operator only as data that has gone still, which is why it is worse than a disconnect.
_Avoid_: hang, freeze, lag

**Leak**:
A resource that outlives the thing that needed it — a stream subscription surviving its disconnected client, a simulator interval surviving shutdown, a ring buffer surviving its deleted Link, telemetry accumulating without bound. Named as a distinct concept because a console that runs alongside the device it manages is long-lived by definition: a leak has hours or days to become an outage, so "no leaks" is a claim that has to be *demonstrated*, not asserted.
_Avoid_: memory issue, resource issue

### Errors and Failures

**Error Envelope**:
The standard `{ error: { code, message, details } }` wrapper returned for all API-level domain and validation failures. The `message` is diagnostic prose for developers and logs. The `code` is a stable discriminant the Console uses to look up operator-facing copy, because the Server cannot know where the error lands in the UI.

**Transport Failure**:
A failure where the Server did not answer (e.g., a dropped stream, a timeout, or a 502 from a proxy), as distinct from an Error Envelope where the Server answered "no". Handled separately so the Console never synthesizes a fake envelope for an unreachable API.
