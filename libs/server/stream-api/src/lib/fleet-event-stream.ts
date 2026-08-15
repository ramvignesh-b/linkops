import { Inject, Injectable, type MessageEvent } from '@nestjs/common';
import {
  concat,
  defer,
  endWith,
  ignoreElements,
  interval,
  map,
  merge,
  Observable,
  of,
  share,
  takeUntil,
  concatMap,
} from 'rxjs';
import { withDerivedStatus, type StreamEvent } from '@linkops/shared/domain';
import {
  LINK_REPOSITORY,
  type LinkRepository,
} from '@linkops/server/links-data-access';
import {
  Simulator,
  systemClock,
  TELEMETRY_BUS,
  TELEMETRY_PORT,
  type Clock,
  type TelemetryBus,
  type TelemetryPort,
  type TelemetryTick,
} from '@linkops/server/telemetry';

/**
 * How often a comment line is written to an otherwise idle connection. Long
 * enough that an idle connection costs almost nothing, short enough that
 * whatever sits between the Server and the Client keeps seeing traffic — a
 * connection dropped for inactivity is a Transport Failure the Client would
 * have to notice and reconnect from.
 */
export const HEARTBEAT_MS = 15_000;

/** The reconnect delay a Client is asked to use, sent once per connection. */
export const RECONNECT_HINT_MS = 3_000;

/**
 * Every Client's view of the Fleet, built once and multicast.
 *
 * The Tick→events pipeline runs once no matter how many operators are
 * watching, and the heartbeat is one timer for the whole server. A connection
 * therefore costs one subscription and the Fleet Snapshot it opens with — no
 * per-connection buffer, no per-connection timer, and no per-Tick work that
 * grows with the number of Clients.
 */
@Injectable()
export class FleetEventStream {
  /**
   * Everything a connected Client receives after its Snapshot: the events of
   * each Tick, and the heartbeat riding alongside them. One subscription to
   * this is one connection.
   */
  private readonly live$: Observable<MessageEvent>;

  private readonly clock: Clock = systemClock;

  constructor(
    @Inject(TELEMETRY_BUS) bus: TelemetryBus,
    @Inject(TELEMETRY_PORT) private readonly telemetry: TelemetryPort,
    @Inject(LINK_REPOSITORY) private readonly repository: LinkRepository,
    @Inject(Simulator) private readonly simulator: Simulator,
  ) {
    // The Bus completing is the Fleet ending, and `takeUntil` is what carries
    // that through to the heartbeat. Without it the merge would wait on an
    // interval that never completes, and stopping the API would hang on a
    // response that never ends instead of ending it cleanly.
    const ended$ = bus.asObservable().pipe(ignoreElements(), endWith(true));

    this.live$ = merge(
      bus.asObservable().pipe(concatMap((tick) => this.messagesFor(tick))),
      interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ comment: 'hb' }))),
    ).pipe(takeUntil(ended$), share());
  }

  /**
   * One connection: the Fleet Snapshot it opens with, then the shared stream.
   * `share()` above the merge is what makes this one subscription, one
   * heartbeat timer for the whole server, and one Tick's work however many
   * Clients are watching.
   */
  connection(): Observable<MessageEvent> {
    return concat(
      // Deferred so the Snapshot is captured when a Client subscribes rather
      // than when this is called — a Snapshot built any earlier describes a
      // Fleet the Client was not yet watching.
      defer(() => of(this.snapshot())),
      this.live$,
    );
  }

  /**
   * The Roster with Status derived, the latest Sample per Link and the Fleet
   * Summary, all read at one instant — so the Summary a Client opens with can
   * never contradict the Roster it opens with. The Tick number comes from the
   * Simulator, which owns it, and is `0` before its first Tick.
   */
  private snapshot(): MessageEvent {
    const now = this.clock.now();
    // The same presenter the REST reads use, so the Status a Client opens
    // with is the value `GET /api/links` would give it at this instant.
    const links = this.repository
      .findAll()
      .map((record) =>
        withDerivedStatus(record, this.telemetry.latestSample(record.id), now),
      );
    const samples = [...this.telemetry.latestSamples().values()];

    return {
      ...this.toMessage(
        {
          event: 'fleet.snapshot',
          data: {
            tick: this.simulator.ticks,
            ts: now.toISOString(),
            links,
            samples,
            summary: this.telemetry.summary(),
          },
        },
        this.simulator.ticks,
      ),
      // The reconnect hint rides on the first message of every connection,
      // which is where a reconnecting Client will see it too — ADR-0005.
      retry: RECONNECT_HINT_MS,
    };
  }

  /**
   * A Tick's events, in the order a Client may rely on: the readings first,
   * then the Summary describing the state they just produced.
   */
  private messagesFor(tick: TelemetryTick): MessageEvent[] {
    const events: StreamEvent[] = [
      {
        event: 'link.telemetry',
        data: { tick: tick.tick, ts: tick.ts, samples: [...tick.samples] },
      },
      { event: 'fleet.summary', data: this.telemetry.summary() },
    ];

    return events.map((event) => this.toMessage(event, tick.tick));
  }

  /**
   * The `id:` is set explicitly on every event, because Nest numbers a
   * message that arrives without one — a second counter on the wire that
   * would not be the Tick number. Every event from one Tick shares its id.
   */
  private toMessage(event: StreamEvent, tick: number): MessageEvent {
    return { type: event.event, id: String(tick), data: event.data };
  }
}
