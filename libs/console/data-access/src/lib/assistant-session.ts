import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Observable, Subscription } from 'rxjs';
import type {
  A2uiActionRequest,
  A2uiCreateSurface,
} from '@linkops/shared/a2ui-protocol';
import {
  AssistantClient,
  AssistantInvalidPayloadError,
} from './assistant-client';
import type { AssistantFailure } from './console-failure';

/**
 * The triage panel's state: what it asked for, what came back, and whether
 * that worked. The panel's own composition root injects this and reads its
 * signals down — the panel's composition is that component's job, but
 * tracking its own state is not, which is what keeps it inside its
 * complexity budget as the panel grows.
 *
 * Not `providedIn: 'root'`: a session belongs to the one component that
 * composes a panel from it, provided in that component's `providers`, the
 * same way `LinkHistory` is scoped to the detail route rather than the app.
 */
@Injectable()
export class AssistantSession {
  private readonly client = inject(AssistantClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly surface = signal<A2uiCreateSurface | null>(null);
  readonly pending = signal(false);
  readonly failure = signal<AssistantFailure | null>(null);

  /**
   * The request in flight, if any — unsubscribed the moment a new one
   * starts, or the panel closes, whichever comes first. Without the former,
   * a reply arrives whenever it arrives: a close and a quick reopen puts two
   * requests in flight, and if the first (now stale) one resolves after the
   * second, it would silently overwrite the answer to the question the
   * operator actually asked. Without the latter, closing the panel — which
   * destroys this session along with it — would leave the request itself
   * still running, its answer arriving nowhere.
   */
  private inFlight: Subscription | undefined;

  /**
   * Opens a conversation. Cancels any reply still in flight from a previous
   * one, and drops whatever the last conversation left onscreen: a reopen
   * starts from nothing, so there is no earlier Surface to keep.
   */
  open(): void {
    this.surface.set(null);
    this.run(this.client.open());
  }

  /**
   * Sends an Action to the Assistant. Cancels any reply still in flight — the
   * last press wins — and leaves the current Surface up until one arrives to
   * replace it. Clearing here would cost the operator the offer they acted on
   * the moment the round trip failed, leaving "Try again" nothing to try.
   */
  act(request: A2uiActionRequest): void {
    this.run(this.client.act(request));
  }

  /** The request lifecycle both entry points share, minus what they render from. */
  private run(reply: Observable<A2uiCreateSurface>): void {
    this.inFlight?.unsubscribe();

    this.pending.set(true);
    this.failure.set(null);

    this.inFlight = reply.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
