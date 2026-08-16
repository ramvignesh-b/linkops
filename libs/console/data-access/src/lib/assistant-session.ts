import { inject, Injectable, signal } from '@angular/core';
import type { Subscription } from 'rxjs';
import type { A2uiCreateSurface } from '@linkops/shared/a2ui-protocol';
import {
  AssistantClient,
  AssistantInvalidPayloadError,
} from './assistant-client';
import type { AssistantFailure } from './console-failure';

/**
 * The triage panel's state: what it asked for, what came back, and whether
 * that worked. `FleetPage` injects this and passes its signals down — the
 * panel's composition is the routed page's job, but tracking its own state is
 * not, which is what keeps the page inside its complexity budget as the
 * panel grows.
 *
 * Not `providedIn: 'root'`: a session belongs to the one route that composes
 * a panel from it, provided in that route's component `providers`, the same
 * way `LinkHistory` is scoped to the detail route rather than the app.
 */
@Injectable()
export class AssistantSession {
  private readonly client = inject(AssistantClient);

  readonly surface = signal<A2uiCreateSurface | null>(null);
  readonly pending = signal(false);
  readonly failure = signal<AssistantFailure | null>(null);

  /**
   * The request in flight, if any — unsubscribed the moment a new one
   * starts. Without this, a reply arrives whenever it arrives: a close and a
   * quick reopen puts two requests in flight, and if the first (now stale)
   * one resolves after the second, it would silently overwrite the answer to
   * the question the operator actually asked.
   */
  private inFlight: Subscription | undefined;

  /** Opens a conversation. Cancels any reply still in flight from a previous one. */
  open(): void {
    this.inFlight?.unsubscribe();

    this.pending.set(true);
    this.failure.set(null);
    this.surface.set(null);

    this.inFlight = this.client.open().subscribe({
      next: (surface) => {
        this.pending.set(false);
        this.surface.set(surface);
      },
      error: (cause: unknown) => {
        this.pending.set(false);
        this.failure.set(failureFrom(cause));
      },
    });
  }
}

function failureFrom(cause: unknown): AssistantFailure {
  if (cause instanceof AssistantInvalidPayloadError) {
    return { kind: 'invalid-payload', code: 'A2UI_INVALID_PAYLOAD' };
  }

  // Every other rejection reaching here is the Server not answering at all —
  // a dropped connection or a proxy's own reply — the same transport failure
  // the stream reports through `TransportFailure`, distinct from a Server
  // reply this Console could not use.
  return { kind: 'transport', cause: 'offline' };
}
