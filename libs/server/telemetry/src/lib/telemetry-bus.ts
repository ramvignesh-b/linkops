import { Subject, type Observable } from 'rxjs';
import type { TelemetrySample } from '@linkops/shared/domain';

/**
 * One notification per Tick, each carrying every Sample that Tick produced
 * — the batching ADR-0004 asks for. Unconsumed in this ticket: nothing
 * subscribes yet, but the shape is exactly what the streaming slice needs.
 * `complete()` is the other half of the Simulator's shutdown contract,
 * alongside `clearInterval` — see `Simulator.onApplicationShutdown`.
 */
export class TelemetryBus {
  private readonly subject = new Subject<readonly TelemetrySample[]>();

  next(batch: readonly TelemetrySample[]): void {
    this.subject.next(batch);
  }

  asObservable(): Observable<readonly TelemetrySample[]> {
    return this.subject.asObservable();
  }

  complete(): void {
    this.subject.complete();
  }
}
