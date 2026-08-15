import type { LinkId, TelemetrySample } from '@linkops/shared/domain';
import { RingBuffer } from './ring-buffer';

/**
 * 300 Samples at the Simulator's 1 Hz Tick rate is 5 minutes — exactly
 * `DEFAULT_TELEMETRY_WINDOW`. The two are coupled on purpose: the buffer
 * never has to hold more than the longest window `GET /telemetry` defaults
 * to. Fixed at construction and injected, not read from an env var.
 */
export const SAMPLE_BUFFER_CAPACITY = 300;

/**
 * `Map<LinkId, RingBuffer>`, one buffer per Link, allocated lazily on that
 * Link's first Sample — a Link that has never reported costs nothing here.
 * The Simulator writes through `push`; `SimulatorTelemetryPort` reads
 * through everything else. `dropLink` is what makes deletion evict a
 * buffer immediately rather than leaving it for eviction or overwrite.
 */
export class TelemetrySampleStore {
  private readonly buffers = new Map<LinkId, RingBuffer<TelemetrySample>>();

  constructor(private readonly capacity: number) {}

  push(sample: TelemetrySample): void {
    let buffer = this.buffers.get(sample.linkId);

    if (buffer === undefined) {
      buffer = new RingBuffer<TelemetrySample>(this.capacity);
      this.buffers.set(sample.linkId, buffer);
    }

    buffer.push(sample);
  }

  latestSample(id: LinkId): TelemetrySample | null {
    return this.buffers.get(id)?.peekLast() ?? null;
  }

  latestSamples(): ReadonlyMap<LinkId, TelemetrySample> {
    const result = new Map<LinkId, TelemetrySample>();

    for (const id of this.buffers.keys()) {
      const latest = this.latestSample(id);
      if (latest !== null) result.set(id, latest);
    }

    return result;
  }

  history(id: LinkId, windowMs: number, now: Date): readonly TelemetrySample[] {
    const cutoff = now.getTime() - windowMs;

    return (
      this.buffers
        .get(id)
        ?.toArray()
        .filter((entry) => new Date(entry.ts).getTime() >= cutoff) ?? []
    );
  }

  /**
   * Called after the repository delete, never before — see `TelemetryPort`.
   * Deletes the Map entry outright so a buffer never survives its Link, and
   * a later push for the same id lazily allocates a fresh one.
   */
  dropLink(id: LinkId): void {
    this.buffers.delete(id);
  }
}
