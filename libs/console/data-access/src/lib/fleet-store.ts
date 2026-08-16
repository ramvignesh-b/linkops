import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  isDevMode,
  signal,
} from '@angular/core';
import { forkJoin } from 'rxjs';
import type {
  FleetSummary,
  Link,
  LinkId,
  StreamEvent,
} from '@linkops/shared/domain';
import {
  applyStreamEvent,
  emptyFleetState,
  type FleetState,
} from './fleet-state';
import { FleetStream, type StreamMessage } from './fleet-stream';
import { TickCostTracker } from './tick-cost-tracker';

const TICK_APPLY_START_MARK = 'linkops:tick-apply-start';
const TICK_APPLY_MEASURE = 'linkops:tick-apply';

/**
 * `isDevMode()` alone is not enough of a guard: this store also runs inside
 * the console libraries' spec suites, whose jsdom does not implement the
 * User Timing API at all — `performance.mark` is `undefined` there, real
 * browsers and Node both have it. A measurement harness has no business
 * throwing in an environment it was never meant to measure.
 */
function hasUserTimingApi(): boolean {
  return (
    typeof performance !== 'undefined' &&
    typeof performance.mark === 'function' &&
    typeof performance.measure === 'function'
  );
}

/**
 * What the Console knows about its own connection to the Server. `lastFrameAt`
 * is a Server timestamp taken off the frame itself — the Console never reads
 * its own clock, which is what keeps clock skew out of the freeze banner.
 */
export type ConnectionState =
  | { kind: 'connecting' }
  | { kind: 'live'; lastFrameAt: string }
  | { kind: 'dropped'; lastFrameAt: string | null };

/**
 * The Fleet as the Console holds it: loaded over REST, then kept live by the
 * stream, and frozen exactly where it stands if the stream goes.
 *
 * Two things it deliberately does not do. It does not derive Status — the
 * Server's `status` is rendered unchanged, so a gap in the stream can never
 * make the Console a second, disagreeing producer of health. And it does not
 * aggregate the Summary — the Server's is rendered verbatim, so the KPI header
 * cannot contradict the rows beneath it.
 */
@Injectable({ providedIn: 'root' })
export class FleetStore {
  private readonly http = inject(HttpClient);

  private readonly state = signal<FleetState>(emptyFleetState);
  private readonly connectionState = signal<ConnectionState>({
    kind: 'connecting',
  });

  /** The Roster, Status as the Server derived it. */
  readonly links = computed(() => this.state().links);
  /** The latest Sample per Link, bounded by the size of the Fleet. */
  readonly latestSample = computed(() => this.state().latestSample);
  /** The Server's Fleet Summary, verbatim; `null` before the first arrives. */
  readonly summary = computed(() => this.state().summary);
  readonly connection = this.connectionState.asReadonly();

  /**
   * The Tick in progress. Events accumulate here and reach `state` only when
   * the Tick's `fleet.summary` lands, which the Server's documented within-Tick
   * ordering guarantees is last.
   */
  private pending: StreamEvent[] = [];

  /** Set by the first frame that applies, and what makes first paint lose a race it should lose. */
  private streamHasApplied = false;

  /**
   * Dev-only: what one Tick costs this store, per ticket `36`. `isDevMode()`
   * guards every call site below, so the marking and the tracking never run
   * in production — a measurement harness that shipped would itself be a
   * per-Tick cost.
   */
  private readonly tickCostTracker = new TickCostTracker();

  constructor() {
    const subscription = inject(FleetStream).subscribe((message) =>
      this.receive(message),
    );
    inject(DestroyRef).onDestroy(() => subscription.close());

    this.loadFirstPaint();
  }

  /**
   * First paint over REST, before the stream has connected — because a Client
   * whose `EventSource` is blocked should still see its Fleet, and because
   * ADR-0005 makes the Snapshot the resync path rather than the load path.
   *
   * Both reads are issued together and applied as one write, so the header and
   * the rows are from one moment here too. `GET /api/links` is called with **no
   * query parameters**: the Console holds the whole Roster and filters it
   * itself, since the stream delivers the whole Fleet and the Server cannot
   * tell a filtered Client that something has entered its filter.
   */
  private loadFirstPaint(): void {
    forkJoin({
      links: this.http.get<Link[]>('/api/links'),
      summary: this.http.get<FleetSummary>('/api/fleet/summary'),
    })
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: ({ links, summary }) => {
          // The stream can win this race on a fast connection, and its
          // Snapshot is the newer state — first paint is what fills a screen
          // that has nothing on it, never what replaces something live.
          if (!this.streamHasApplied) {
            this.state.set({ links, latestSample: new Map(), summary });
          }
        },
        // A Transport Failure on the load path costs first paint and nothing
        // else: the stream is the other way this state arrives, and its own
        // failure is what raises a banner. Logged rather than rendered,
        // because no operator action is owed a message here.
        error: (cause: unknown) =>
          console.warn('First paint over REST failed', cause),
      });
  }

  /**
   * Drops a Link from the view the moment its `DELETE` succeeds, rather than
   * lingering until the `link.deleted` frame the Tick after confirms it.
   * Applied through the same reducer that frame drives, so a delete acted on
   * locally and the one the stream reports later can never disagree about
   * what "idempotent" means — the frame arriving is then a Link already gone,
   * and `applyStreamEvent`'s own filter is what makes that harmless.
   */
  removeLink(linkId: LinkId): void {
    this.state.update((current) =>
      applyStreamEvent(current, {
        event: 'link.deleted',
        data: { linkId },
      }),
    );
  }

  private receive(message: StreamMessage): void {
    switch (message.kind) {
      case 'event':
        this.receiveEvent(message.event);

        return;

      case 'failure':
        // Freeze. Nothing on screen is cleared, no Status is recomputed, and no
        // Link flips to `down` — an operator has to be able to tell *the Fleet
        // died* from *my connection died*, and a Console that kept deriving
        // would make those two situations look identical.
        //
        // The Tick in progress is the one thing that does go, because its
        // lifetime is the connection's: left buffered, it would flush behind
        // the recovering Snapshot and put a frame from before the gap on top
        // of current state.
        this.pending = [];
        this.connectionState.set({
          kind: 'dropped',
          lastFrameAt: this.lastFrameAt(),
        });

        return;
    }
  }

  private receiveEvent(event: StreamEvent): void {
    if (event.event === 'fleet.snapshot') {
      // It arrives alone and first on every connection, so there is no Tick to
      // coalesce it into and nothing left buffered to discard here — a new
      // connection is always preceded by the `error` that ended the last one,
      // and that is where the Tick in progress was dropped.
      this.apply([event], event.data.ts);

      return;
    }

    this.pending.push(event);

    if (event.event === 'fleet.summary') {
      const tick = this.pending;
      this.pending = [];
      this.apply(tick, telemetryTimestamp(tick));
    }
  }

  /**
   * One Tick, applied as one write — the client-side mirror of ADR-0004's
   * batching. Collapsing N Links into one frame on the wire buys nothing if
   * the Console un-batches it into four state changes and four
   * change-detection passes.
   *
   * A Tick that somehow carried no `fleet.summary` is not applied and not
   * discarded: it stays buffered and the following Tick's Summary flushes both.
   * The chosen degradation is a doubled batch rather than a frozen screen.
   */
  private apply(events: readonly StreamEvent[], frameAt: string | null): void {
    this.applyAndTrackCost(() =>
      this.state.set(events.reduce(applyStreamEvent, this.state())),
    );

    this.streamHasApplied = true;

    // Without a Server timestamp there is nothing honest to name as the last
    // good frame, so the previous one stands.
    const lastFrameAt = frameAt ?? this.lastFrameAt();

    if (lastFrameAt !== null) {
      this.connectionState.set({ kind: 'live', lastFrameAt });
    }
  }

  /**
   * Runs `applyState` — the store write above — bracketed with
   * `performance.mark`/`performance.measure` when both `isDevMode()` and the
   * User Timing API say it is safe to. One `if`, not two either side of the
   * write, and the one caller stays free of the bracketing detail.
   */
  private applyAndTrackCost(applyState: () => void): void {
    if (!isDevMode() || !hasUserTimingApi()) {
      applyState();

      return;
    }

    performance.mark(TICK_APPLY_START_MARK);
    applyState();
    const { duration } = performance.measure(
      TICK_APPLY_MEASURE,
      TICK_APPLY_START_MARK,
    );
    performance.clearMarks(TICK_APPLY_START_MARK);
    performance.clearMeasures(TICK_APPLY_MEASURE);

    const stats = this.tickCostTracker.record(duration);

    if (stats !== null) {
      console.warn(
        `[tick-cost] median ${stats.median.toFixed(2)}ms, p95 ${stats.p95.toFixed(2)}ms over 60 Ticks`,
      );
    }
  }

  private lastFrameAt(): string | null {
    const current = this.connectionState();

    return current.kind === 'connecting' ? null : current.lastFrameAt;
  }
}

/**
 * When a Tick's readings were taken, as the Server timestamped them.
 * `link.telemetry` is the only event in a Tick that carries a timestamp, and
 * it is in every Tick.
 */
function telemetryTimestamp(events: readonly StreamEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event !== undefined && event.event === 'link.telemetry') {
      return event.data.ts;
    }
  }

  return null;
}
