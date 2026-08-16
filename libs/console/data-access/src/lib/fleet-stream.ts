import { inject, Injectable, InjectionToken } from '@angular/core';
import {
  streamEventSchema,
  type StreamEvent,
  type StreamEventName,
} from '@linkops/shared/domain';
import type { TransportFailure } from './console-failure';
import {
  EVENT_SOURCE,
  EVENT_SOURCE_CLOSED,
  type EventSourceLike,
} from './event-source.token';

/** The one stream the Server publishes; the whole catalogue arrives here. */
export const STREAM_PATH = '/api/stream';

/**
 * How long to wait before opening a new stream after the browser has abandoned
 * one — deliberately the same 3 seconds the Server asks for with `retry`, so
 * there is one reconnect cadence rather than two. A token so the value is
 * visible next to the `EVENT_SOURCE` factory it belongs with.
 */
export const STREAM_REOPEN_DELAY_MS = new InjectionToken<number>(
  'STREAM_REOPEN_DELAY_MS',
  { factory: () => 3_000 },
);

/**
 * The event names to listen for, taken from the catalogue itself rather than
 * written out again — an event added to `streamEventSchema` is one this client
 * subscribes to with no second edit.
 */
const STREAM_EVENT_NAMES: readonly StreamEventName[] =
  streamEventSchema.options.map((member) => member.shape.event.value);

/** What the stream hands its consumer: a validated event, or the connection going. */
export type StreamMessage =
  | { kind: 'event'; event: StreamEvent }
  | { kind: 'failure'; failure: TransportFailure };

export interface StreamSubscription {
  close(): void;
}

/**
 * The Console's half of `GET /api/stream`: one listener per catalogue event
 * name, every frame validated against the shared schema, and the connection
 * going reported as a Transport Failure.
 *
 * One listener per name rather than a single `onmessage`, because
 * `EventSource` dispatches by name and a single handler would have to
 * re-derive the name the browser already knows.
 *
 * There is no backoff here: the Server sends `retry: 3000` and the browser
 * honours it (ADR-0005). What there is, because the browser does not always
 * retry, is one reopen — see `error` below.
 */
@Injectable({ providedIn: 'root' })
export class FleetStream {
  private readonly openStream = inject(EVENT_SOURCE);
  private readonly reopenDelayMs = inject(STREAM_REOPEN_DELAY_MS);

  subscribe(onMessage: (message: StreamMessage) => void): StreamSubscription {
    let current: EventSourceLike | null = null;
    let reopen: ReturnType<typeof setTimeout> | undefined;
    let released = false;

    const connect = (): void => {
      const source = this.openStream(STREAM_PATH);
      current = source;

      for (const name of STREAM_EVENT_NAMES) {
        source.addEventListener(name, (frame) => {
          const event = parseFrame(name, frame.data);

          if (event !== null) {
            onMessage({ kind: 'event', event });
          }
        });
      }

      source.addEventListener('error', () => {
        // The event carries no status, so `readyState` is the only evidence of
        // which failure this is. Still CONNECTING means the connection dropped
        // and the browser is retrying it. CLOSED means the request was answered
        // by something that was not a stream, and the browser has given up:
        // anything other than a `200 text/event-stream` closes an `EventSource`
        // for good. Observed by stopping the API, where the dev server's proxy
        // answers the open stream request `500`; a `502` from whatever sits in
        // front of the API in any other topology ends the same way.
        const abandoned = source.readyState === EVENT_SOURCE_CLOSED;

        onMessage({
          kind: 'failure',
          failure: {
            kind: 'transport',
            cause: abandoned ? 'http-no-envelope' : 'offline',
          },
        });

        // Left abandoned, the Console stays frozen until an operator reloads,
        // and restarting the API reads as a fleet-wide outage rather than as the
        // brief pause it is. So the connection the browser will not retry is
        // reopened here, at the interval the Server publishes — not a backoff
        // and not a second retry policy, since either way the cadence is the
        // same three seconds.
        if (abandoned && !released && reopen === undefined) {
          reopen = setTimeout(() => {
            reopen = undefined;
            connect();
          }, this.reopenDelayMs);
        }
      });
    };

    connect();

    return {
      close: () => {
        // Both halves matter on destroy: a pending reopen would otherwise open
        // a stream for an application that no longer exists, which is the Leak
        // this Console is meant not to have.
        released = true;
        clearTimeout(reopen);
        current?.close();
      },
    };
  }
}

/**
 * One frame as a validated `StreamEvent`, or `null` if it is not one. This is
 * ADR-0006's client half: the same schema the Server publishes from decides
 * what the Console will accept.
 *
 * A frame that fails validation is **dropped and logged** rather than fatal.
 * One malformed frame should not blank an operator's console, and no operator
 * action is owed a message here because no operator took one.
 */
function parseFrame(event: StreamEventName, data: string): StreamEvent | null {
  let payload: unknown;

  try {
    payload = JSON.parse(data);
  } catch {
    console.warn(`Dropped an unparseable ${event} frame from the Fleet stream`);

    return null;
  }

  const result = streamEventSchema.safeParse({ event, data: payload });

  if (!result.success) {
    console.warn(
      `Dropped a ${event} frame the shared schema rejected`,
      result.error.issues,
    );

    return null;
  }

  return result.data;
}
