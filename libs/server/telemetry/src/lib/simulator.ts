import type { BeforeApplicationShutdown, OnModuleInit } from '@nestjs/common';
import type { LinkRepository } from '@linkops/server/links-data-access';
import type { LinkId, TelemetrySample } from '@linkops/shared/domain';
import type { Clock } from './clock';
import { type DegradationEpisode, stepEpisode } from './degradation-episode';
import type { Random } from './random';
import { simulateNextSample } from './simulate-next-sample';
import { type TelemetryBus } from './telemetry-bus';
import { type TelemetrySampleStore } from './telemetry-sample-store';

/** 1 Hz — the Tick rate every other constant in this ticket is defined against. */
export const TICK_MS = 1_000;

/**
 * The fleet-wide Simulator: one `setInterval`, never a timer per Link. Each
 * Tick reads the Roster fresh from `LinkRepository` — a deleted Link is
 * simply absent from that read, so "no ghost telemetry" is structural here
 * rather than something this class has to remember to check for.
 */
export class Simulator implements OnModuleInit, BeforeApplicationShutdown {
  private handle: ReturnType<typeof setInterval> | undefined;

  /**
   * One Link's Degradation Episode state, present only while it is
   * mid-episode. Replaced with a fresh Map every Tick, built only from the
   * current Roster, so a Link deleted mid-episode leaves no entry behind —
   * the same "no ghost state" property the Roster read already gives
   * Sample production.
   */
  private episodes = new Map<LinkId, DegradationEpisode>();

  /**
   * Ticks elapsed since boot, and the number the stream puts on the wire as
   * `id:`. It lives here because this class owns the interval — deriving it
   * anywhere downstream would be a second counter to keep in step with this
   * one. Ticket 06's health instrument reports the same number.
   */
  private tickCount = 0;

  constructor(
    private readonly repository: LinkRepository,
    private readonly store: TelemetrySampleStore,
    private readonly bus: TelemetryBus,
    private readonly clock: Clock,
    private readonly random: Random,
  ) {}

  /** Ticks run since boot — see `tickCount`. */
  get ticks(): number {
    return this.tickCount;
  }

  onModuleInit(): void {
    this.handle = setInterval(() => this.tick(), TICK_MS);
  }

  /**
   * `beforeApplicationShutdown`, not `onApplicationShutdown`, and the
   * difference is load-bearing: Nest closes the HTTP server between the two,
   * and closing it waits for every open response to end. An SSE response
   * ends when the Bus completes, so completing the Bus after the close would
   * be waiting on itself. Stopping the Fleet first is what lets a shutdown
   * end each stream cleanly instead of severing it.
   */
  beforeApplicationShutdown(): void {
    if (this.handle !== undefined) {
      clearInterval(this.handle);
      this.handle = undefined;
    }

    this.bus.complete();
  }

  private tick(): void {
    const now = this.clock.now();
    this.tickCount++;
    const nextEpisodes = new Map<LinkId, DegradationEpisode>();

    const samples: TelemetrySample[] = this.repository.findAll().map((link) => {
      const previous = this.store.latestSample(link.id);
      const episode = stepEpisode(
        this.episodes.get(link.id) ?? null,
        this.random,
      );

      if (episode !== null) {
        nextEpisodes.set(link.id, episode);
      }

      const sample = simulateNextSample(
        link,
        previous,
        now,
        this.random,
        episode,
      );
      this.store.push(sample);

      return sample;
    });

    // A Link deleted mid-episode is simply absent from this Tick's Roster
    // read, so it never makes it into `nextEpisodes` — no separate prune.
    this.episodes = nextEpisodes;

    // One publication every Tick, even one carrying no Samples — the Tick is
    // the unit of change, not the presence of a Roster.
    this.bus.next({ tick: this.tickCount, ts: now.toISOString(), samples });
  }
}
