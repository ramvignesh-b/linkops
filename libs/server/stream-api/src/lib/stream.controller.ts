import { Controller, Sse, type MessageEvent } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { defer, finalize, Observable } from 'rxjs';
import { FleetEventStream } from './fleet-event-stream';
import { SseSubscriberCounter } from './sse-subscriber-counter';

/**
 * `GET /api/stream` — the one stream, carrying the whole event catalogue.
 *
 * Nest's own `SseStream` writes the framing and the headers, including
 * `X-Accel-Buffering: no`, and unsubscribes on the response's `close` event.
 * That last part is what makes `finalize` here the release of a disconnected
 * Client's subscription rather than a hopeful addition.
 */
@Controller('stream')
export class StreamController {
  constructor(
    private readonly fleet: FleetEventStream,
    private readonly subscribers: SseSubscriberCounter,
  ) {}

  @Sse()
  @ApiOperation({
    summary: 'The live Fleet stream',
    description:
      'Server-Sent Events. Every connection opens with `fleet.snapshot`, then carries one `link.telemetry` and one `fleet.summary` per Tick. `Last-Event-ID` is ignored — the server never replays. The event catalogue and its payloads are documented in the README.',
  })
  @ApiResponse({
    status: 200,
    description: 'The stream, open until the Client disconnects',
    content: { 'text/event-stream': {} },
  })
  stream(): Observable<MessageEvent> {
    // `defer` so the count moves when a Client actually subscribes, not when
    // the controller returns; `finalize` so it moves back however the
    // subscription ends — disconnect, shutdown or error.
    return defer(() => {
      this.subscribers.subscribed();

      return this.fleet.connection();
    }).pipe(finalize(() => this.subscribers.released()));
  }
}
