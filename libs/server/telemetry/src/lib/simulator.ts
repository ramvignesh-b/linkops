import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import type { LinkRepository } from '@linkops/server/links-data-access';
import type { TelemetrySample } from '@linkops/shared/domain';
import type { Clock } from './clock';
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
export class Simulator implements OnModuleInit, OnApplicationShutdown {
  private handle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly repository: LinkRepository,
    private readonly store: TelemetrySampleStore,
    private readonly bus: TelemetryBus,
    private readonly clock: Clock,
    private readonly random: Random,
  ) {}

  onModuleInit(): void {
    this.handle = setInterval(() => this.tick(), TICK_MS);
  }

  onApplicationShutdown(): void {
    if (this.handle !== undefined) {
      clearInterval(this.handle);
      this.handle = undefined;
    }

    this.bus.complete();
  }

  private tick(): void {
    const now = this.clock.now();

    const batch: TelemetrySample[] = this.repository.findAll().map((link) => {
      const previous = this.store.latestSample(link.id);
      const sample = simulateNextSample(link, previous, now, this.random);
      this.store.push(sample);

      return sample;
    });

    // One batch every Tick, even an empty one — the Tick is the unit of
    // change, not the presence of a Roster.
    this.bus.next(batch);
  }
}
