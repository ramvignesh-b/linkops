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
import {
  withDerivedStatus,
  type LinkId,
  type LinkStatus,
  type StreamEvent,
} from '@linkops/shared/domain';
import {
  LINK_REPOSITORY,
  type LinkRecord,
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

/** Structural equality for `LinkStatus` — `reason` only matters when `down`. */
function statusesEqual(a: LinkStatus, b: LinkStatus): boolean {
  if (a.status !== b.status) return false;

  return a.status === 'down' && b.status === 'down'
    ? a.reason === b.reason
    : true;
}

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

  /**
   * The Roster as the last Tick's diff saw it, keyed by id — the baseline
   * every new Tick compares against. Empty until the diff starts running,
   * which is the only moment it could be read.
   */
  private previousRoster = new Map<LinkId, LinkRecord>();

  /** Every Link's Status as of the last Tick's diff — the other half of the baseline. */
  private previousStatuses = new Map<LinkId, LinkStatus>();

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
      // `share()` below is ref-counted, so this Tick pipeline runs only while
      // a Client is watching and is re-subscribed whenever the first one
      // arrives. The baseline is therefore seeded *here*, on every such
      // subscription, rather than at construction: a baseline older than the
      // diff that reads it describes a Fleet no connected Client has ever
      // been shown, and every Link whose Status moved in between would be
      // announced as a transition on the first Tick after connecting.
      defer(() => {
        this.seedBaseline(this.clock.now());

        return bus.asObservable();
      }).pipe(concatMap((tick) => this.messagesFor(tick))),
      interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ comment: 'hb' }))),
    ).pipe(takeUntil(ended$), share());
  }

  /**
   * Replaces the baseline with the Fleet as it stands right now — the Roster
   * and the Status every Link has at `now`, derived through the same
   * presenter the Snapshot and the REST reads use. A Client subscribing gets
   * its Snapshot from that same Fleet at that same instant, which is what
   * makes the first transition it is told about one it could not have
   * already seen.
   */
  private seedBaseline(now: Date): void {
    this.previousRoster = new Map(
      this.repository.findAll().map((record) => [record.id, record]),
    );
    this.previousStatuses = new Map(
      [...this.previousRoster.values()].map((record) => [
        record.id,
        this.statusOf(record, now),
      ]),
    );
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
   * A Tick's events, in the order a Client may rely on: membership first —
   * `link.created`, `link.updated`, `link.deleted`, from a Roster diff run
   * once per Tick rather than once per connected Client — then the
   * readings, then the Status transitions they explain, then the Summary
   * describing the state everything before it just produced. A Client is
   * therefore never handed a Sample for a Link it has not been told about,
   * nor a transition derived from a Sample it has not yet seen.
   *
   * The diff reads the Roster fresh rather than reusing `tick.samples`,
   * which is what makes a Link created between the Simulator's own Roster
   * read and this diff still show up as `link.created` this Tick — with
   * `down: stale`, since it has no Sample until the Simulator sees it on the
   * next one, exactly what `GET /api/links` would say about it right now.
   */
  private messagesFor(tick: TelemetryTick): MessageEvent[] {
    const { membership, statuses } = this.diffRoster(new Date(tick.ts));

    const events: StreamEvent[] = [
      ...membership,
      {
        event: 'link.telemetry',
        data: { tick: tick.tick, ts: tick.ts, samples: [...tick.samples] },
      },
      ...statuses,
      { event: 'fleet.summary', data: this.telemetry.summary() },
    ];

    return events.map((event) => this.toMessage(event, tick.tick));
  }

  /**
   * The Roster diff itself: this Tick's Roster and every Link's Status
   * against the baseline `previousRoster`/`previousStatuses` hold, in
   * Roster order rather than event-type order — the caller is what decides
   * where `link.created`/`link.updated`/`link.deleted` and `link.status`
   * land relative to `link.telemetry` and `fleet.summary`. Replaces the
   * baseline with this Tick's Roster and Statuses as a side effect, so the
   * next Tick diffs against what this one just saw.
   *
   * A Link created and deleted between two Ticks, before either edge is
   * ever diffed, produces neither event — it never appears in a Roster this
   * comparison sees. That is the accepted cost of a diff anchored to the
   * Tick rather than to the mutation, the same trade-off ADR-0004's
   * amendment records for every edge-triggered event here.
   */
  private diffRoster(now: Date): {
    membership: StreamEvent[];
    statuses: StreamEvent[];
  } {
    const roster = new Map(
      this.repository.findAll().map((record) => [record.id, record]),
    );
    const membership: StreamEvent[] = [];
    const statuses: StreamEvent[] = [];
    const nextStatuses = new Map<LinkId, LinkStatus>();

    for (const [id, record] of roster) {
      // The one merge path `link.created`/`link.updated` share with the
      // Snapshot and the REST reads — never a hand-rolled `{ ...record,
      // status }` that could drift from what `withDerivedStatus` actually
      // builds.
      const link = withDerivedStatus(
        record,
        this.telemetry.latestSample(id),
        now,
      );
      nextStatuses.set(id, link.status);

      const previousRecord = this.previousRoster.get(id);
      if (previousRecord === undefined) {
        membership.push({ event: 'link.created', data: link });
      } else if (previousRecord.version !== record.version) {
        membership.push({ event: 'link.updated', data: link });
      }

      const previousStatus = this.previousStatuses.get(id);
      if (
        previousStatus !== undefined &&
        !statusesEqual(previousStatus, link.status)
      ) {
        statuses.push({
          event: 'link.status',
          data: { linkId: id, status: link.status, previous: previousStatus },
        });
      }
    }

    for (const id of this.previousRoster.keys()) {
      if (!roster.has(id)) {
        membership.push({ event: 'link.deleted', data: { linkId: id } });
      }
    }

    this.previousRoster = roster;
    this.previousStatuses = nextStatuses;

    return { membership, statuses };
  }

  /** A Link's Status, derived exactly as the REST surface derives it. */
  private statusOf(record: LinkRecord, now: Date): LinkStatus {
    return withDerivedStatus(
      record,
      this.telemetry.latestSample(record.id),
      now,
    ).status;
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
