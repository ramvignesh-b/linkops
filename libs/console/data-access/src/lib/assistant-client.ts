import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import {
  a2uiEnvelopeSchema,
  type A2uiActionRequest,
  type A2uiCreateSurface,
  type A2uiRequest,
} from '@linkops/shared/a2ui-protocol';

/** The Assistant's one endpoint. */
export const ASSISTANT_PATH = '/api/agent/ui';

/**
 * Thrown when a reply cannot be used — it either fails
 * `a2uiEnvelopeSchema`, or it validates but carries no Surface, which an
 * `{ kind: 'open' }` request has nothing to render from either way. A marker
 * type rather than a return value: `AssistantSession` tells it apart from a
 * `TransportFailure` with `instanceof`, the same way it tells a dropped
 * connection apart from a rejected one.
 */
export class AssistantInvalidPayloadError extends Error {}

/**
 * The Console's half of `POST /api/agent/ui`: one request, its reply parsed
 * with the same schema the Server validated its own answer against before
 * sending it. A response the schema rejects is not a Surface, and nothing
 * downstream ever sees the body that failed it — `parseSurface` is the one
 * place that body is read at all.
 */
@Injectable({ providedIn: 'root' })
export class AssistantClient {
  private readonly http = inject(HttpClient);

  /** Opens a conversation: the only request this slice sends. */
  open(): Observable<A2uiCreateSurface> {
    const request: A2uiRequest = { kind: 'open' };

    return this.http
      .post<unknown>(ASSISTANT_PATH, request)
      .pipe(map(parseSurface));
  }

  /** Sends an Action to the Assistant. */
  act(request: A2uiActionRequest): Observable<A2uiCreateSurface> {
    return this.http
      .post<unknown>(ASSISTANT_PATH, request)
      .pipe(map(parseSurface));
  }
}

/**
 * A reply as a Surface, or a thrown `AssistantInvalidPayloadError` — inside
 * `map`, which turns a synchronous throw into the Observable's error
 * channel, the same way a client-side validation failure already does
 * elsewhere in this Console.
 */
function parseSurface(body: unknown): A2uiCreateSurface {
  const parsed = a2uiEnvelopeSchema.safeParse(body);

  if (!parsed.success || parsed.data.createSurface === undefined) {
    throw new AssistantInvalidPayloadError();
  }

  return parsed.data.createSurface;
}
