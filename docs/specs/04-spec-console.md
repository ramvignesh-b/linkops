# Spec — Console: the Fleet View, the Detail View, and the Link Form

Status: ready-for-agent
Covers: M5, M6, M7, B3, B5's per-Tick measurement, and `plan.md` §10 verification steps 2, 4, 5 (console half) and 6
Slice chosen: 2026-08-16, following `spec-foundation.md`, `spec-telemetry.md` and `spec-streaming.md`. Per `docs/agents/issue-tracker.md` this effort has no single `spec.md`; this is the fourth per-area spec.

## Problem Statement

Three slices have built a Server that seeds ten Links, produces a Sample for every one of them every second, drives some of them through Degradation Episodes, and streams the whole thing over `GET /api/stream` with a seven-event catalogue and a documented within-Tick ordering. **Nobody has ever seen it.** Every claim the repository makes about this product is currently verified by a test or by `curl -N`, and the product is an operator console — a thing a human being looks at.

That is not only a demo gap. Four decisions taken in grilling exist to protect an operator from a specific misreading, and none of them can be checked until there is a screen:

- **Freezing on a stream gap** (ticket `08`) exists so that *the fleet died* and *my connection died* do not look identical. That claim is about pixels. There is no code path today that could freeze anything.
- **The Fleet Summary being server-authoritative** (ticket `10`) exists so the KPI header can never contradict the rows beneath it. Two surfaces that cannot disagree require both surfaces to exist.
- **The sparkline's visible break across a gap** (ticket `09`) exists because a straight line drawn across thirty missing seconds reads as *steady*, which is the most dangerous of the three honest options. There is no sparkline.
- **The Console owning operator copy** (ticket `12`) exists because the Server's `message` is diagnostic prose. Today `message` is the only human-readable string the system produces, so the rule is stated and unenforced.

There is also a contract claim that is currently half-proven. ADR-0006 says one zod schema drives the server pipe, the client validators and the OpenAPI document — and ticket `08` is explicit that this claim rests on the schemas rather than on `deriveStatus`, because the schemas "genuinely execute on both sides". Only one side executes them. Until a form in the browser runs `linkCreateSchema` and a stream client runs `streamEventSchema`, the central architectural claim of this repository has one caller.

And finally the ordinary product problem the brief describes: an operator managing a fleet of point-to-point radio links needs to see every Link's health and throughput at a glance, notice a degraded one without scanning rows, drill into one Link's recent history, and change a Link's configuration without silently overwriting a colleague's edit.

## Solution

An Angular Console at `/links`, served on 4200, proxying `/api` to the Server on 3000.

**First paint comes over REST** — the Roster and the Fleet Summary — because [ADR-0005](../../docs/adr/0005-snapshot-on-connect-no-telemetry-replay.md) makes the stream the resync path and not the load path, and an operator opening the console during a network wobble should still see their fleet. **The stream takes over immediately after**: `fleet.snapshot` replaces the loaded state wholesale on every connection including the first, and thereafter one Tick's worth of events applies to the store as a single write.

The fleet view is a sortable, filterable list of Links carrying live Status and Throughput, with a KPI header rendering the Server's `FleetSummary` verbatim and a **New link** action beside it. Filter and sort live in the URL, so the view is shareable and survives a reload by construction.

The detail view drills into one Link: its configuration, its current readings, and a hand-rolled SVG sparkline of the last five minutes of Throughput — fetched once on entry, appended live, capped at 300 Samples, drawing a **visible break** wherever consecutive Samples are more than two Ticks apart.

One `LinkFormComponent` serves creation and editing, driven by the shared zod schemas. A stale edit comes back 409 with the current Link attached, and the Console renders a field-level **theirs versus mine** diff with two working resolutions rather than a toast.

When the stream drops, every row **freezes** at its last known value, a banner names the time of the last good frame, and nothing on screen invents a Status. When it comes back, the snapshot replaces the frozen state in one event.

At the end of this slice, `pnpm start` and a browser at `http://localhost:4200` is the whole demonstration: ten Links updating at 1 Hz, Degradation Episodes visibly arriving and clearing, a restart of the API reading as a brief pause, and two tabs editing the same Link producing a conflict one of them can resolve.

## User Stories

**The operator, watching the fleet**

1. As an operator, I want the fleet list to appear as soon as the page loads, so that a stream that is slow to connect does not cost me a blank screen.
2. As an operator, I want every Link's Status shown as `up`, `degraded` or `down`, so that I can judge the fleet without reading numbers.
3. As an operator, I want a `down` Link to tell me whether the feed is silent or the signal is bad, so that I know whether to check the radio or the telemetry path.
4. As an operator, I want Throughput shown against the Link's Capacity, so that 40 Mbps reads as healthy on a 50 Mbps Link and as a fault on a 1000 Mbps one.
5. As an operator, I want the readings to update on their own once a second, so that a number going still means the fleet went still.
6. As an operator, I want degraded Links to stand out without my scanning for them, so that trouble finds me rather than the other way round.
7. As an operator, I want counts of up, degraded and down plus total Throughput in a header, so that I can judge the whole fleet before reading any row.
8. As an operator, I want the header's numbers to move on the same Tick the rows move on, so that the header can never contradict the list I am reading it against.
9. As an operator, I want the header to describe the whole fleet even when I have filtered the list, so that a filter never hides a `down` Link from my counts.
10. As an operator, I want the worst Link in the fleet called out, so that I have somewhere to start when several things are wrong.
11. As an operator, I want a Link another operator created to appear without my reloading, so that two people working the same fleet see the same fleet.
12. As an operator, I want a Link another operator deleted to disappear, so that I never act on a row that no longer exists.
13. As an operator, I want a Link another operator reconfigured to show its new Capacity, so that the ceiling I am judging Throughput against is the one currently in force.

**The operator, when the connection goes**

14. As an operator, I want the rows to keep their last known values when the stream drops, so that I can still see what was true a moment ago.
15. As an operator, I want the Console never to mark a Link `down` on its own during a gap, so that *the fleet died* and *my connection died* stay two different screens.
16. As an operator, I want a banner naming the time of the last good frame, so that I know exactly how old what I am looking at is.
17. As an operator, I want the connection to come back by itself, so that a network wobble costs me seconds rather than a reload.
18. As an operator, I want the whole screen to be replaced by current state when it does, so that no stale row survives the recovery.
19. As an operator, I want restarting the API to look like a brief pause, so that routine maintenance does not read as a fleet-wide outage.

**The operator, finding and sharing a view**

20. As an operator, I want to filter the list by Status, so that I can look only at what is wrong.
21. As an operator, I want to filter by Band, so that I can check whether a problem tracks a frequency band.
22. As an operator, I want to search by name or Site, so that I can find one Link in a fleet without scrolling.
23. As an operator, I want to sort by name, Capacity, Status or Throughput, so that I can order the fleet by whatever I am currently investigating.
24. As an operator, I want my filter and sort to be in the URL, so that I can send a colleague exactly what I am looking at.
25. As an operator, I want a reloaded page to keep my filter and sort, so that a refresh does not cost me my place.
26. As an operator, I want a Link that becomes degraded to enter my degraded-only view immediately, so that a filter is a live view rather than a snapshot of when I set it.
27. As an operator, I want a nonsense URL to load the default view rather than an error, so that a mistyped link is not a broken console.

**The operator, drilling into one Link**

28. As an operator, I want to open one Link and see its full configuration, so that I can check what it is provisioned for.
29. As an operator, I want its current RSSI, SNR and Throughput, so that I can see the readings the Status was derived from.
30. As an operator, I want the last five minutes of Throughput as a chart, so that I can tell a momentary dip from a sustained problem.
31. As an operator, I want the chart to keep drawing while I watch, so that the detail view is as live as the list.
32. As an operator, I want a gap in the chart drawn as a break, so that I am never shown a straight line across data nobody collected.
33. As an operator, I want the chart to stop growing without bound while I leave the page open, so that a console I keep open all day does not become the reason my browser slows down.
34. As an operator, I want an unknown Link id in the URL to say the Link does not exist, so that a deleted Link's bookmark is not an empty screen.

**The operator, changing configuration**

35. As an operator, I want to create a Link from the fleet view, so that adding one does not require me to know a URL.
36. As an operator, I want invalid values rejected before I submit, so that I find out about a bad Capacity without a round trip.
37. As an operator, I want the message about a bad field attached to that field, so that I know which input to fix.
38. As an operator, I want a rule only the Server can enforce — a name already in use — to land on the same field with the same treatment, so that where a rule runs is not something I have to think about.
39. As an operator, I want to be taken to the new Link after creating it, so that I can confirm it is real and watch it come up.
40. As an operator, I want to edit an existing Link with its current values pre-filled, so that I am changing a configuration rather than re-entering one.
41. As an operator, I want my edit refused if someone changed the Link while I was typing, so that I cannot silently overwrite their work.
42. As an operator, I want to see exactly which fields differ between their version and mine, so that I can decide rather than guess.
43. As an operator, I want to take their version, so that abandoning my edit is one click.
44. As an operator, I want to keep mine on top of theirs, so that deciding I am right is also one click.
45. As an operator, I want a second conflict while resolving the first to be handled the same way, so that a busy Link does not trap me in a loop I cannot exit.
46. As an operator, I want deleting a Link to require confirmation naming the Link, so that I cannot delete the wrong one by reflex.
47. As an operator, I want the deleted Link gone from my view immediately, so that the confirmation and the screen agree.
48. As an operator, I want every failure to produce words I can act on, so that nothing I do ever silently does nothing.
49. As an operator, I want never to be shown a developer's diagnostic sentence, so that the console speaks to me rather than to the person who built it.

**The engineer who built the Server**

50. As that engineer, I want the Console to be the first real consumer of the event catalogue, so that a wire format nobody has parsed stops being a guess.
51. As that engineer, I want received frames validated against the same schemas the Server publishes them from, so that ADR-0006's claim has a caller on both sides.
52. As that engineer, I want the documented within-Tick ordering to be something the Console actually relies on, so that the guarantee is load-bearing rather than decorative.
53. As that engineer, I want the Console never to derive Status or aggregate a Summary, so that the single-authority decisions survive contact with a second implementation.
54. As that engineer, I want the Console to hold telemetry for one Link only, so that the bound the Server states has a counterpart rather than a hole.

**The engineer running this alongside the device for days**

55. As that engineer, I want one Tick to cost one change-detection pass, so that batching on the wire is not undone by the client that receives it.
56. As that engineer, I want that cost measured rather than asserted, so that the performance claim in the README is a number with conditions attached.
57. As that engineer, I want the measurement harness absent from the production bundle, so that measuring the per-Tick cost is not itself a per-Tick cost.
58. As that engineer, I want the stream closed when the app is destroyed, so that a navigation cannot leave a connection behind.
59. As that engineer, I want the viewed Link's history dropped when I navigate away, so that walking the fleet for an hour does not accumulate ten buffers.
60. As that engineer, I want zone.js absent rather than merely unused, so that "zoneless" is a property of the build and not a claim about discipline.

**The reviewer**

61. As a reviewer, I want the tests to drive the real components through the real store, so that "the wire reaches the screen" is demonstrated rather than assumed.
62. As a reviewer, I want only the browser's network primitives faked, so that everything between the wire and the DOM is the code that ships.
63. As a reviewer, I want the freeze behaviour tested, so that the most product-specific decision in this repository is not the untested one.
64. As a reviewer, I want the conflict resolution tested end to end, so that "a conflict the user can resolve" is proven rather than screenshotted.
65. As a reviewer, I want no test in this slice to sleep, so that the bar the three server slices set is met by the client too.
66. As a reviewer, I want the boundary rules to hold across the Console libraries, so that the dependency rule is a property of the whole workspace and not of its server half.

## Implementation Decisions

### The load path, and what the Console does not call

- **First paint is REST: `GET /api/links` and `GET /api/fleet/summary`, issued together.** [ADR-0005](../../docs/adr/0005-snapshot-on-connect-no-telemetry-replay.md) is explicit that the snapshot is the resync path and REST is the load path, for the stated reason that coupling first paint to a stream expected to drop gives a blank screen to anyone whose `EventSource` is blocked. This slice does not soften that.
- **`GET /api/links` is called with no query parameters.** The Console loads the whole Roster and filters and sorts it client-side, in one place, over the store.

  The alternative — passing the URL's filter and sort through to the Server — fails on the live path rather than on the load path. The stream delivers the **whole** Roster: a Link that transitions into a `status=degraded` view mid-Tick has to appear without a refetch, and the Server cannot tell a filtered client that something entered its filter. Keeping the filter server-side would mean either refetching on every Tick, which is the polling this product exists to avoid, or maintaining a second client-side filter that must agree with the server's — which is exactly the drift ADR-0006 exists to prevent.

  The honest consequence, recorded rather than hidden: **the Console never exercises `GET /api/links`'s `status`, `band`, `q`, `sort` and `dir`.** They are a second-client surface and an OpenAPI-documented one, and `linkListQuerySchema` still executes on the Console — as the parser for the URL's query string, so the Console's vocabulary and the API's are the same words by construction. A shareable Console URL and the equivalent `curl` read identically.
- **`GET /api/links/:id` is called on entering a detail view**, rather than reading the Link out of the store. Only the Server can answer "this Link does not exist" — a store miss is ambiguous between *deleted* and *my stream has not connected yet*, and a deep link or a bookmark to a deleted Link deserves a real 404 rather than a spinner. It also removes the race after a create, where the new Link is not in the Roster until the next Tick.
- **`GET /api/links/:id/telemetry?window=5m` is called on the same entry**, for history. Ticket `09` closed this: re-entry refetches, because history is held only for the Link on screen and there is nothing to reuse.

### `console/data-access` — the wire, the store, and failures

**The stream client.**

- **Native `EventSource`, obtained through an injection token.** `EVENT_SOURCE` is a factory `(url: string) => EventSourceLike`, where `EventSourceLike` is the narrow structural subset the client uses — `addEventListener`, `close`, and the `open`/`error` events. The token is not a testability affordance bolted on: **jsdom does not implement `EventSource` at all** (verified), so without it the Console's tests cannot run in the environment every other Console library already uses. A narrow structural type is what lets a fake exist without stubbing an interface the client never touches.
- **One listener per event name**, not a single `onmessage`. The catalogue is seven named events and `EventSource` dispatches by name; a single handler would have to re-derive the name the browser already knows.
- **Every frame is validated with `streamEventSchema` before it reaches the store.** This is ADR-0006's client half, and it is the reason the schema is a discriminated union over the event name rather than seven unrelated schemas. A frame that fails validation is **dropped and logged**, not fatal: one malformed frame should not blank an operator's console, and no operator action is owed a message because no operator took one.
- **`retry: 3000` is the Server's, and reconnect is the browser's.** No hand-rolled backoff, per [ADR-0005](../../docs/adr/0005-snapshot-on-connect-no-telemetry-replay.md). The client's only reconnect responsibility is to notice `error`, mark the connection dropped, and let the next `fleet.snapshot` replace state wholesale.

**A Tick applies as one write, and the Server's ordering guarantee is what makes it possible.**

- The streaming slice documented the within-Tick order as membership → `link.telemetry` → `link.status` → `fleet.summary`, with **`fleet.summary` always last and emitted every Tick**. The Console buffers a Tick's events as they arrive and applies them as a **single store write when `fleet.summary` lands**. That is the mirror image of the batching decision on the server side: [ADR-0004](../../docs/adr/0004-batched-per-tick-sse-framing.md) collapses N Links into one frame so a client is not woken N times; this collapses one Tick's frames into one signal write so the view is not recomputed four times per second.
- **The Tick number comes from `MessageEvent.lastEventId`**, which is the `id:` the Server sets. It labels the measurement and identifies the batch; it is not used for resumption, because there is none.
- **A Tick that somehow carried no `fleet.summary` coalesces into the next one** rather than stalling — the following Tick's summary flushes both. Stated because it is the failure mode of choosing a terminator, and the chosen degradation is a doubled batch rather than a frozen screen.
- **`fleet.snapshot` applies immediately and wholesale**, replacing Roster, latest Samples and Summary together. It arrives alone, before any Tick, on every connection.

**The store.** One root-provided `FleetStore` in `console/data-access`, signals throughout. Its public shape is the contract three feature libraries read, so it is pinned here; everything below it goes to code under TDD.

```ts
type ConnectionState =
  | { kind: 'connecting' }
  | { kind: 'live';    lastFrameAt: string }
  | { kind: 'dropped'; lastFrameAt: string | null };

interface FleetStore {
  readonly links:        Signal<readonly Link[]>;                       // the Roster, Status as the Server derived it
  readonly latestSample: Signal<ReadonlyMap<LinkId, TelemetrySample>>;   // bounded by fleet size
  readonly summary:      Signal<FleetSummary | null>;                    // verbatim from the Server, never computed here
  readonly connection:   Signal<ConnectionState>;
}
```

- **`links` carries the Server's `status` unchanged.** The Console imports `LinkStatus` and never calls `deriveStatus` — ticket `08`, and the README must not claim otherwise.
- **`summary` is rendered verbatim.** The Console never aggregates — ticket `10`. `null` before the first Summary arrives, which is a real state on a cold load and is rendered as such rather than as zeros.
- **`connection: 'dropped'` freezes everything.** No signal is cleared, no Status is recomputed, and `lastFrameAt` is what the banner names. This is ticket `08`'s decision and `CONTEXT.md`'s **Stall** entry rendered.
- **`link.deleted` and a local delete are both idempotent.** Deleting a Link removes it from the store on the `204`, and the `link.deleted` frame that follows up to a Tick later changes nothing. Without that, the operator who pressed the button watches the row linger for a second.

**Failures.** Ticket `12`'s types, used unchanged: `ConsoleFailure = { kind: 'api'; body: ApiErrorBody } | TransportFailure`.

- **An exhaustive `switch` on `code` returns operator copy**, taking the surface it lands on as a parameter — the same `LINK_VERSION_CONFLICT` says different words in an edit form and in a delete confirmation. Exhaustiveness is a compile-time guard with a `never` default, matching `api-error.spec.ts`'s prior art, so a sixth code cannot be added server-side without the Console failing to compile.
- **`message` never reaches the DOM.** It is diagnostic prose, per the schema's own `.describe()` and the README's API reference.
- **A `TransportFailure` is a distinct discriminant**, never a synthesised envelope. Its two Console appearances are the stream's `error` event, which drives the frozen banner, and a failed `fetch`, which drives in-place copy on whichever surface asked.

**The form adapter.** `zodIssuesToFieldIssues()` from `shared/domain` produces `FieldIssue[]`; a small Angular adapter here applies them onto a `FormGroup`'s controls with `setErrors`. **One adapter, two callers** — the client-side `safeParse` on submit, and a server `VALIDATION_FAILED` whose `details.issues` is already `FieldIssue[]`. Ticket `12`'s fourth decision, and the reason a name-uniqueness failure lands on the name control with no second code path.

**The measurement wrapper.** `performance.mark`/`measure` bracketing the single Tick apply, median and p95 over 60 Ticks, behind `isDevMode()` so it never reaches the production bundle. Ticket `14` specified this and it lands here because this is the slice that creates the function it brackets — there is exactly one, which is what coalescing bought.

### `console/ui` — presentational only

`type:ui` may depend on `type:domain` and nothing else, so these components take domain types as inputs and emit events. No store, no HTTP, no router.

- **`StatusPill`** — `up` / `degraded` / `down`, with the `down` reason distinguishing *stale* from *metrics*. The one place the three-way vocabulary becomes colour and words.
- **`ThroughputBar`** — Throughput against Capacity, because `CONTEXT.md` says Throughput is only meaningful relative to Capacity and a bare number is the misreading.
- **`KpiTile`** — one Summary figure.
- **`Sparkline`** — Samples in, an SVG path out, with the break-aware path builder as an exported pure function beside it.
- **`ConnectionBanner`** — takes `ConnectionState`, renders nothing when live.
- **`LinkDiff`** — two Links in, the differing editable fields out. Presentational, so the conflict UI's hardest-to-read part is testable without a form.

**A refinement against ticket `09`**: it assigned the break-aware path builder to `console/feature-link-detail`, at a time when `console/ui` had no content. Nothing in its reasoning depends on the location, and the builder is a pure function over `TelemetrySample[]` with a presentational component wrapped around it — which is the definition of this library. It moves; the decision it encodes does not change.

### `console/feature-fleet` — the fleet view

- **Route `/links`.** Filter and sort live in query params and reach the component as `input()`s through `withComponentInputBinding()`, so the view is shareable and survives reload by construction rather than by manual synchronisation.
- **`linkListQuerySchema` parses the query string** — the same schema the Server's pipe runs. Its `.default()`s do the work: `sort` and `dir` always resolve to a concrete value, so no component has to ask what absent means for ordering.
- **An unparseable query string falls back to defaults and rewrites the URL**, rather than rendering an error. A URL is user-editable and a mistyped one is not a failure the operator took an action to cause; every other failure in this Console surfaces, and this one is stated as the deliberate exception with its reason.
- **Filtering and sorting are `computed()` over the store**, so a Link that changes Status enters or leaves a filtered view on the Tick it changes.
- **The KPI header renders `summary` verbatim and is labelled fleet-wide.** It does not change when the list is filtered — a filter that hid a `down` Link from the counts would be the header contradicting the fleet, which is the failure ticket `10` removed the redundancy to prevent.
- **`worstLinkId` is a link to that Link's detail view**, because a callout an operator cannot act on is decoration.
- **A "New link" action sits beside the KPI block**, routing to `/links/new`. Ticket `13`, which found that M6's create surface had no home in any planning document.

### `console/feature-link-detail` — detail, both form modes, and the conflict

- **Route `/links/:id`.** On entry, `GET /api/links/:id` for existence and configuration and `GET /api/links/:id/telemetry` for the window; live updates thereafter come from the store.
- **`LinkHistory` is provided on the route, not injected from root.** Its lifetime is then the route's, so "dropped on navigation away" is structural rather than a `DestroyRef` callback that has to be remembered. A refinement of ticket `09`'s mechanism, not of its decision: **history for the viewed Link only, capped at 300**, because holding it for every Link would be an unbounded structure with no stated bound — a **Leak** by `CONTEXT.md`'s own definition.
- **The merge is keyed on `ts`.** One fleet-wide interval at 1 Hz makes `(linkId, ts)` unique by construction, so the REST window and the live frames merge into a `Map` and read back sorted, with no sequence number and no server change. Ticket `09`.
- **The sparkline emits a new subpath (`M` rather than `L`) whenever consecutive Samples are more than two Ticks apart.** Interpolating invents readings; joining two points across thirty seconds draws a line an operator reads as *steady*. Ticket `09`, and `CONTEXT.md`'s **Snapshot vs Replay** principle rendered in SVG.
- **Throughput is the charted series**, with Capacity as a reference line. RSSI and SNR are numeric readouts. One chart rather than three, because the ceiling Throughput is judged against is the reading the operator is deciding on and the other two are inputs to a Status the Server already derived.

**`LinkFormComponent`, one component and two modes** — ticket `13`.

| Route | Mode | Schema | Submit | Success |
|---|---|---|---|---|
| `/links/new` | create | `linkCreateSchema` | `POST /api/links` | 201 → navigate to `/links/:id` |
| `/links/:id/edit` | edit | `linkPatchSchema` | `PATCH /api/links/:id` with `version` | 200 → navigate to `/links/:id` |

- **One form-level validator, not per-control validators.** A single validator on the `FormGroup` runs the mode's schema against the group value and distributes the issues onto controls. Decomposing into per-control `ValidatorFn`s cannot work honestly: a refinement spanning fields has no per-control home, so the decomposition would silently drop exactly the rules that matter and the "mirrors the server" claim would be false where it counts. Ticket `03`.
- **`mode` is a discriminated union, not a boolean.** Create has no `version` and no conflict path, and the types say so — the create path's exhaustive failure switch handles `VALIDATION_FAILED` and `LINK_NAME_TAKEN` and provably never needs a conflict branch.
- **The 409 conflict UI.** `LINK_VERSION_CONFLICT` carries the whole `current` Link, typed, so the diff needs no cast — this is the call site ticket `12`'s discriminated `details` exists for. Conflict state is a plain `signal<{ mine, theirs } | null>`. Two resolutions, both of which work:
  - **Take theirs** — replace the form's values with `current`, clear the conflict. The operator's edit is abandoned deliberately, by them.
  - **Keep mine** — resubmit the same patch with `current.version`. This is last-write-wins, chosen explicitly by a human who has just been shown the diff, which is a different thing from a client that retries automatically.
  - A second conflict during resolution re-enters the same state with the newer `current`. No retry loop, no automatic resubmission.
- **Delete is confirmed, naming the Link.** On `204` the Console removes it from the store and navigates to `/links`.

### `apps/console` — wiring, and the seam

- **Routes**: `/` redirects to `/links`; `/links`, `/links/new`, `/links/:id`, `/links/:id/edit`. Lazy-loaded per feature library, which is also what keeps one feature area federation-shaped for B4 without building it.
- **Providers**: `provideRouter(appRoutes, withComponentInputBinding())`, `provideHttpClient()`, and the real `EVENT_SOURCE` factory. `provideBrowserGlobalErrorListeners()` stays.
- **Zoneless is a property of the build.** `zone.js` is absent from the dependency tree and from the app's polyfills (verified — it is an optional peer that was never installed), so the Console is zoneless by construction rather than by discipline. The README's note records the one adaptation that was actually needed: reactive-forms observables wrapped into signals with `toSignal`, and nothing else.
- **The shell is a header and a router outlet.** Its styling comes from the token sheet below.

### Visual design — minimal, and consistent by construction

The goal is minimal but **consistent**, and those are two different requirements. Minimal is satisfied by not building things; consistent needs a mechanism, or three surfaces that were each drawn plainly end up plainly different.

**The mechanism is a token sheet and a closed component inventory** — roughly forty lines of CSS custom properties in `apps/console/src/styles.css`, and the six `console/ui` components already listed. There is no CSS framework and no component library: at six components, a dependency would be larger than the thing it replaced, and it would put a third party's vocabulary between the domain language and the screen.

**The tokens**, by role rather than by value — values are chosen while building, and a value written here would be a number nobody could argue with:

| Group | Tokens |
|---|---|
| Surface | page background, raised surface, border, divider |
| Text | primary, muted, on-accent |
| Status | up, degraded, down — plus the focus/accent colour |
| Space | a four-step scale, used for every margin, padding and gap |
| Type | three sizes (body, small, heading) and two weights |
| Shape | one radius, one focus ring |

**One semantic decision worth stating: three Status colours, not four.** A `down` Link's `reason` — *stale* versus *metrics* — is distinguished by **label**, not by a fourth colour. The reason answers *why*, not *how bad*, and giving it its own colour would tell an operator there are four severities when there are three. `StatusPill` therefore renders one colour and two possible words.

**Layout is a fixed desktop layout** with a max width and no breakpoints. An operator console served next to the device it manages is used on a desktop; responsive behaviour would be a mechanism with no user to point at.

**One theme, no dark mode.** Two palettes double the surface every colour decision has to be right on, for a console that is one screen.

**No design phase and no prototype.** A prototype answers a design question that is hard to settle on paper; the three surfaces here are a table, a detail pane and a form, and the question "what should it look like" is already answered by *minimal and consistent*. The one genuinely novel piece of rendering is the sparkline, and its behaviour is pinned by the `d` attribute in test 6 rather than by eye.

**The durable half of this lives in `AGENTS.md`**, not here: components reference tokens and never literal colours or spacings, which is greppable and outlives this slice. What is written above is the token set this slice creates.

### Boundary consequences

- `console/feature-fleet` and `console/feature-link-detail` are both `type:feature` and therefore **cannot import each other**. The fleet view routes to `/links/new` by URL, not by importing the form. This is the rule doing its job, not fighting it.
- **A routed test that crosses both feature libraries can only live in `apps/console`**, which is `type:app` and may depend on features. This is the same wall ticket `29` hit on the server, where a test driving edge-triggered events over REST had to live in `apps/api` because it needed two feature modules in one running app. The Console hits it for the same structural reason and takes the same answer.

## Testing Decisions

**What makes a good test here**: assert what an operator sees, having fed the application what the Server actually sends. The Console's whole job is turning a documented wire format into a screen, so a test that stops short of the DOM stops short of the deliverable. No test in this slice reads a private field, calls a store method the components do not call, or asserts that a component "was created".

**One seam: the routed Console, driven through a faked wire.** The doubles are the browser's two network primitives and nothing else:

```
apps/console/src/app/*.spec.ts

  provideHttpClientTesting()                 ← REST
  { provide: EVENT_SOURCE, useClass: FakeEventSource }   ← the stream
         │
  ┌──────┴───────────────────────────────────────┐
  │ REAL: streamEventSchema validation,           │
  │ FleetStore and the Tick coalescer,            │
  │ router + withComponentInputBinding,           │
  │ LinkFormComponent + the zod bridge,           │
  │ the break-aware path builder, console/ui      │
  └───────────────────────────────────────────────┘
         │
  assertions on rendered DOM
```

Everything between the wire and the pixel is the code that ships. `HttpTestingController` is Angular's own idiom and needs no invention; `FakeEventSource` is a class implementing `EventSourceLike` with a method to emit a named frame, and it exists because **jsdom has no `EventSource`** — the fake is required for the tests to run at all, which is a better reason for a seam than testability. Verified in the environment the seam actually runs in rather than assumed from jsdom's documentation: `apps/console`'s test target is jsdom 27.4.0, where `typeof EventSource` is `undefined`.

**Why not a second seam at `FleetStore`.** The properties that tempt one — merge-by-`ts` dedupe, the 300 cap, freeze on drop — are all observable through the DOM: the point count in the sparkline's `d` attribute is the buffer's size, and a frozen row is a rendered value. A direct store test would assert the same facts one layer further from the thing an operator depends on, and would create a second vocabulary for the same state. This follows `spec-streaming.md`'s one-seam call for the same reason it gave: every property worth pinning is visible from outside.

**No sleeps and no fake timers.** The Console owns no interval — the Tick, the heartbeat and the reconnect delay are all the Server's or the browser's. `FakeEventSource` emits synchronously and `fixture.whenStable()` is the only synchronisation any test needs. Where the three server slices had to fake a clock to stay fast, this slice simply has no clock to fake, and that is worth one sentence in the spec file so the next reader does not add one.

### What the seam asserts

**Seven tests, in this order.** Ordered by what they defend, and the order is the cut list: if the slice runs long, tests are dropped from the bottom, never from the top.

1. **First load, then one Tick.** `GET /api/links` and `GET /api/fleet/summary` are answered; rows render with Status and Throughput before any frame arrives. The fake stream then emits `fleet.snapshot` and one Tick's four events; the rows carry the new readings, the KPI header matches the Server's Summary field for field, and the whole Tick produces **one** application of state rather than four. This is M5's core and `plan.md` §10 step 2.
2. **Freeze on a dropped stream.** The fake source emits `error`; every row keeps its last value, no Link flips to `down: stale`, and the banner names the time of the last good frame. A subsequent `fleet.snapshot` with different values replaces the frozen state wholesale. This is ticket `08`'s decision — the most product-specific one in the repository — and `plan.md` §10 step 4.
3. **The URL is the state.** Navigating to `/links?status=degraded&sort=throughputMbps&dir=desc` renders the filtered, sorted list; changing a filter control writes the URL; and a Link whose `link.status` on a later Tick makes it `degraded` appears in the filtered view with no further request. The last clause is the one that justifies filtering client-side, so it is asserted rather than described. M5.
4. **Create, and where validation lands.** At `/links/new`, an out-of-range Capacity shows its message on that control with **no HTTP request issued**; a valid submit posts, and a server `LINK_NAME_TAKEN` lands on the name control with operator copy rather than the Server's `message`; a `201` navigates to the new Link. M6 and ticket `13`.
5. **Edit and the 409.** A `PATCH` answered with `LINK_VERSION_CONFLICT` renders a field-level theirs-versus-mine diff built from `details.current`; **Keep mine** resubmits carrying the current `version` and succeeds. This is M7 and `plan.md` §10 step 6 — the one verification step that is entirely a Console behaviour.
6. **History: dedupe, the gap, and the cap.** Entering `/links/:id` fetches the window; a REST window overlapping live frames produces no duplicate points; Samples straddling a gap produce a `d` with more than one `M`; and feeding more than 300 Samples leaves exactly 300 points. Three of ticket `09`'s four decisions in one test, because all three are properties of the same rendered attribute.
7. **Delete while streaming.** Confirm, `204`, the row is gone and the router is on `/links`; a later `link.deleted` for the same id changes nothing. The Console half of `plan.md` §10 step 5.

**Deliberately not separate tests**: zoneless (every test in the suite runs with `zone.js` absent from the dependency tree, which is a stronger statement than any assertion could make); the `message`-is-never-rendered rule (asserted inside test 4, where a server envelope is already in hand); the within-Tick ordering (relied on by the coalescer in test 1, which fails if it is violated); and `worstLinkId` linking to a detail view (asserted in test 1, where the header is already being read). Each is a real property; none earns its own boot of the application.

### Prior art

- **`server-links-api.module.spec.ts`** — the posture this suite copies: boot the real thing, fake only the edges, drive behaviour through the interface a consumer actually uses.
- **`apps/api`'s spec from ticket `29`** — the precedent for a test living in the app because it crosses two feature libraries. Same rule, same answer, different platform.
- **`apps/console`'s generated `app.spec.ts`** — the harness the seam actually runs in, and it needs no new configuration. Worth knowing that the Console's two test wirings are not the same, because the seam lives in the app rather than in a library: `apps/console` runs under the `@angular/build:unit-test` builder (`unitTestRunner: vitest-angular`), which owns `TestBed` initialisation itself and has no `vite.config.mts` and no `test-setup.ts`, while the five console libraries run under `@analogjs/vite-plugin-angular` (`vitest-analog`) with their own vite config and a `setupTestBed()` call. One Vitest, two wirings — ADR-0002's single-runner claim is about the runner, and it holds. Verified by running `nx test console`: Vitest 4.1.10, jsdom 27.4.0, green.
- **`api-error.spec.ts`** — the `never`-default exhaustiveness guard, reused for the operator copy switch.

## Out of Scope

- **The A2UI assistant panel.** `shared/a2ui-protocol`, `console/feature-assistant`, `POST /api/agent/ui` and the six safety properties get their own spec. It is purely additive, it spans a server endpoint and a new shared library, and it is the clean stop if this slice eats the remaining day. Ticket `04` holds its decisions already.
- **B4 Module Federation.** The seam is preserved by lazy-loading each feature area per route; packaging one as a remote is a stretch goal and the README carries the host/remote skew answer either way.
- **Server-side filter and sort as the Console's list path** — decided against above, with the reason recorded. The endpoint keeps the capability for other clients.
- **Virtual scrolling.** Ten Links. The README names the threshold at which it would be added rather than adding it performatively.
- **`@defer` on the sparkline.** It is a hand-rolled SVG path builder with no dependency behind it; deferring it would save nothing and would cost a loading state. `@defer` earns its place on the assistant panel, in that slice.
- **Optimistic UI for create and edit.** Only delete is optimistic, and only because the operator who pressed the button would otherwise watch the row linger for up to a Tick. A create or an edit already navigates, so there is nothing to be optimistic about.
- **A toast or notification framework.** Failures render in place, on the surface that caused them — which is what makes "attached to the right field" possible at all.
- **Authentication, theming, responsive layouts below desktop, and i18n.** Same posture as every other slice, for the same stated reason.
- **Any Console derivation of Status or aggregation of the Summary** — refused by tickets `08` and `10`, and this slice documents the refusal rather than softening it.

## Budget

**Roughly one day, and the cut order is written down because the assistant panel and the README pass both come after it.**

- `console/data-access` — stream client, schema validation, the Tick coalescer, the store, failure types and copy, the form adapter: **3 h**
- `console/ui` — the token sheet, then six presentational components including the path builder: **1.5 h**
- `console/feature-fleet` — list, URL binding, KPI header: **1.5 h**
- `console/feature-link-detail` — detail, history, both form modes, conflict UI, delete: **2.5 h**
- `apps/console` — routes, providers, the harness and the seven tests: **2.5 h**
- README "How it works" and "Project structure" updates, and the B5 measurement: **1 h**

If it runs over, cut from the bottom of the test list, then the B5 measurement (ticket `14` is explicit that an unmeasured claim comes **out** of the README rather than being estimated), then `LinkDiff`'s field-level rendering degrades to a whole-Link theirs-versus-mine display — which still resolves the conflict and still beats a toast. Do **not** cut the freeze behaviour or the sparkline break: they are the two decisions this Console exists to demonstrate.

## Further Notes

- **Where this slice's rationale already lives**, and is deliberately not restated: ticket `03` (the form-level validator), ticket `08` (Status is server-derived; the Console freezes), ticket `09` (dedupe on `ts`, the visible break, re-entry refetches, history for one Link), ticket `10` (the Summary is server-authoritative), ticket `12` (the copy map, the typed `details`, transport failures as a separate type, one issue→control mapping), ticket `13` (one form component, two modes, and where creation lives), ticket `14` (how the per-Tick cost is measured), [ADR-0005](../../docs/adr/0005-snapshot-on-connect-no-telemetry-replay.md) (REST is the load path, the snapshot is the resync path, `retry: 3000`), [ADR-0006](../../docs/adr/0006-shared-zod-schema-as-the-contract.md) (the schemas execute on both sides), [ADR-0009](../../docs/adr/0009-three-tag-axes-platform-domain-type.md) (the tag axes the boundary consequences follow from), and `CONTEXT.md`'s **Console**, **Stall**, **Leak** and **Snapshot vs Replay** entries.
- **Two refinements against resolved tickets**, both mechanism rather than decision, recorded so the tickets are not silently contradicted: the break-aware path builder moves from `console/feature-link-detail` to `console/ui`, where a pure function with a presentational wrapper belongs; and the viewed Link's history is dropped by being provided on the route rather than by a `DestroyRef` callback, which makes the lifetime structural.
- **One decision taken beyond every existing ticket**: the Console coalesces a Tick's events into a single store write, using `fleet.summary` as the terminator that the streaming slice's documented ordering guarantees. It is what makes ticket `14`'s "one function to bracket" true, and it is the client-side mirror of [ADR-0004](../../docs/adr/0004-batched-per-tick-sse-framing.md) — batching on the wire is wasted if the receiver un-batches it.
- **Three documents change when this lands.** The README gains "How it works" for the client half of the telemetry path, "Project structure" for the five Console libraries, and — if the number is measured — the B5 figure with its fleet size and machine. Each lands in the commit that makes it true, per the repository's own rule.
- **This is the first slice a human being can look at.** `plan.md` §10 steps 2, 4 and 6 become runnable for the first time, and step 5 gains its client half. Step 3 already passes and does not change.
- **The natural next slice is the assistant panel**, which is the last required piece of scope and the only one with a server endpoint still unbuilt.
