import { HttpClient, HttpParams } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { FleetStore } from '@linkops/console/data-access';
import {
  DEFAULT_TELEMETRY_WINDOW,
  telemetryWindowQuerySchema,
  type LinkId,
  type TelemetrySample,
} from '@linkops/shared/domain';

/**
 * The window in milliseconds, resolved through the Server's own query schema
 * rather than restated as a number here — the same reuse that keeps the words
 * in a Console URL and the words in the equivalent `curl` the same words.
 */
export const HISTORY_WINDOW_MS = telemetryWindowQuerySchema.parse({
  window: DEFAULT_TELEMETRY_WINDOW,
}).windowMs;

/**
 * The Console holds no more history than the Server retains: 300 Samples, five
 * minutes at the 1 Hz Tick rate. Holding more would be holding Samples the
 * Server will never send again, and a buffer that grew with how long a screen
 * stayed open is the Leak this route's scoping exists to prevent.
 *
 * This is the third site of that number — the other two are
 * `SAMPLE_BUFFER_CAPACITY` and `DEFAULT_TELEMETRY_WINDOW`. ADR-0010 keeps them
 * hand-coupled deliberately rather than lifting the retention bound into
 * `shared/domain`, and records that changing one means grepping for the others.
 */
export const HISTORY_CAP = 300;

function sortAndCapSamples(
  samples: Iterable<TelemetrySample>,
): TelemetrySample[] {
  return Array.from(samples)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .slice(-HISTORY_CAP);
}

/**
 * Manages the recent telemetry history for the single Link currently in view.
 *
 * Provided at the route level, its lifetime is bound to the route: navigating
 * away drops it structurally to prevent unbounded memory growth (a Leak).
 *
 * History is fetched once on entry via REST, and live Samples append to it
 * thereafter, merged and deduplicated on timestamp.
 */
@Injectable()
export class LinkHistory {
  private readonly http = inject(HttpClient);
  private readonly store = inject(FleetStore);

  private readonly sampleMap = signal<ReadonlyMap<string, TelemetrySample>>(
    new Map(),
  );

  /**
   * A signal rather than a field: the append effect reads it, so a Sample that
   * was already in the store when the route opened has to re-run the effect
   * rather than wait for the next Tick to arrive.
   */
  private readonly currentLinkId = signal<LinkId | null>(null);

  /** The deduplicated, chronologically sorted Samples, capped at `HISTORY_CAP`. */
  readonly samples = computed(() =>
    sortAndCapSamples(this.sampleMap().values()),
  );

  /**
   * The window fetch did not answer. The chart has no second way to reach this
   * data — unlike first paint, where the stream is the other path — so an
   * empty chart here would read as *this Link reported nothing*, which is a
   * different fact from *we could not ask*.
   */
  private readonly loadFailed = signal(false);
  readonly historyUnavailable = this.loadFailed.asReadonly();

  constructor() {
    effect(() => {
      const linkId = this.currentLinkId();
      const latestMap = this.store.latestSample();

      if (linkId === null) {
        return;
      }

      const sample = latestMap.get(linkId);
      if (sample !== undefined) {
        this.addSamples([sample]);
      }
    });
  }

  /**
   * Loads the initial history window for a Link over REST. The window is named
   * explicitly rather than left to the Server's default, so the five minutes
   * the chart's heading promises is a request the Console actually made.
   */
  load(linkId: LinkId): void {
    this.currentLinkId.set(linkId);
    this.sampleMap.set(new Map());
    this.loadFailed.set(false);

    this.http
      .get<TelemetrySample[]>(`/api/links/${linkId}/telemetry`, {
        params: new HttpParams().set('window', DEFAULT_TELEMETRY_WINDOW),
      })
      .subscribe({
        next: (samples) => {
          this.addSamples(samples);
        },
        error: () => {
          this.loadFailed.set(true);
        },
      });
  }

  /**
   * Merges on `ts` — unique by construction at one Sample per Link per second,
   * so an overlap between the REST window and the live frames replaces rather
   * than duplicates — and caps on write. Capping on read instead would leave
   * the map holding everything it had ever seen while the chart looked bounded.
   */
  private addSamples(samples: readonly TelemetrySample[]): void {
    this.sampleMap.update((existing) => {
      const merged = new Map(existing);
      for (const sample of samples) {
        merged.set(sample.ts, sample);
      }

      if (merged.size <= HISTORY_CAP) {
        return merged;
      }

      return new Map(sortAndCapSamples(merged.values()).map((s) => [s.ts, s]));
    });
  }
}
