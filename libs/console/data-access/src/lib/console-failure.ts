/**
 * A failure where the Server did not answer, as distinct from an Error
 * Envelope where it answered "no". It is a type of its own so that the two
 * are never confused: synthesising an envelope for a connection that dropped
 * would lie about where the failure came from, and would let "the Server
 * said no" and "the Server did not answer" render the same words.
 *
 * The stream's `error` event is its first appearance — the one that drives
 * the frozen banner. `ConsoleFailure`, the union that adds the envelope half,
 * arrives with the first surface that submits something for the Server to
 * refuse.
 */
export interface TransportFailure {
  kind: 'transport';
  cause: 'offline' | 'timeout' | 'http-no-envelope';
  status?: number;
}

/**
 * The third kind of failure: the Server answered, but not with something
 * usable. Neither a `TransportFailure` (the Server did answer) nor an Error
 * Envelope (the reply was not one) — synthesising either would lie about
 * where the failure came from, the same reasoning `TransportFailure`'s own
 * comment gives in reverse. `code` stays `A2UI_INVALID_PAYLOAD` rather than a
 * bare literal so `operatorMessageFor` reads it directly.
 */
export interface AssistantInvalidPayloadFailure {
  kind: 'invalid-payload';
  code: 'A2UI_INVALID_PAYLOAD';
}

/** Every failure the panel can show, as distinct from `ApiErrorBody`'s other codes. */
export type AssistantFailure =
  | TransportFailure
  | AssistantInvalidPayloadFailure;
