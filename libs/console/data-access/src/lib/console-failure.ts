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
