import { Subject, type Observable } from 'rxjs';
import type { TelemetrySample } from '@linkops/shared/domain';

/**
 * One Tick's worth of telemetry: its number, the instant it ran, and every
 * Sample it produced. The Simulator owns both the interval and the counter,
 * so the number travels with the Samples rather than being recovered by a
 * second counter downstream — which is what the stream puts on the wire as
 * `id:`.
 */
export interface TelemetryTick {
  readonly tick: number;
  readonly ts: string;
  readonly samples: readonly TelemetrySample[];
}

/**
 * One notification per Tick, each carrying every Sample that Tick produced
 * — the batching ADR-0004 asks for. `complete()` is the other half of the
 * Simulator's shutdown contract, alongside `clearInterval` — see
 * `Simulator.beforeApplicationShutdown`.
 */
export class TelemetryBus {
  private readonly subject = new Subject<TelemetryTick>();

  next(published: TelemetryTick): void {
    this.subject.next(published);
  }

  asObservable(): Observable<TelemetryTick> {
    return this.subject.asObservable();
  }

  complete(): void {
    this.subject.complete();
  }
}
