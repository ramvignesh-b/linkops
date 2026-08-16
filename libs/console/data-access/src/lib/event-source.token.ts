import { InjectionToken } from '@angular/core';

/**
 * The subset of `EventSource` the stream client actually uses: named-event
 * listeners, and a way to let the connection go. Narrow on purpose — a fake
 * has to implement only what the client calls, rather than stubbing an
 * interface most of which nothing touches.
 *
 * One signature covers both kinds of listener the client registers: the
 * catalogue's named events, whose frames carry a JSON string, and `error`,
 * whose argument the client ignores.
 */
export interface EventSourceLike {
  /**
   * `CONNECTING` (0), `OPEN` (1) or `CLOSED` (2) — read only after an `error`,
   * where it is the one thing that separates *the browser is reconnecting* from
   * *the browser has given up*.
   */
  readonly readyState: number;
  addEventListener(
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ): void;
  close(): void;
}

/** `EventSource.CLOSED`: the browser will not reconnect this one. */
export const EVENT_SOURCE_CLOSED = 2;

/** Opens a stream at `url`. The real one is `new EventSource(url)`. */
export type EventSourceFactory = (url: string) => EventSourceLike;

/**
 * `EventSource` reaches the Console through this token rather than off the
 * global, and not as a testability affordance bolted on afterwards: **jsdom
 * does not implement `EventSource` at all**, so without the token the
 * Console's tests could not run in the environment every Console library
 * already uses.
 */
export const EVENT_SOURCE = new InjectionToken<EventSourceFactory>(
  'EVENT_SOURCE',
);
