import type { A2uiEnvelope, A2uiRequest } from '@linkops/shared/a2ui-protocol';

/**
 * The Assistant, as everything outside this library sees it: a request in, a
 * Surface out. One method, drawn as an interface from the first commit so
 * that replacing the deterministic stub with a model client is a provider
 * swap rather than a rewrite of the endpoint around it.
 *
 * `respond` is async so that seam holds for a real model client's network
 * round trip, not only for the stub's synchronous read of the Fleet.
 */
export interface A2uiAgent {
  respond(request: A2uiRequest): Promise<A2uiEnvelope>;
}
