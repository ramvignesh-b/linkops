import { Injectable } from '@nestjs/common';

/**
 * How many Clients are subscribed to the stream right now — incremented when
 * a connection subscribes, decremented when its subscription is released.
 * A count that only ever climbs is a Leak, so this is the number that makes
 * release observable; the health instrument publishes it unchanged as
 * `sseSubscribers`.
 */
@Injectable()
export class SseSubscriberCounter {
  private subscribers = 0;

  get count(): number {
    return this.subscribers;
  }

  subscribed(): void {
    this.subscribers++;
  }

  released(): void {
    this.subscribers--;
  }
}
