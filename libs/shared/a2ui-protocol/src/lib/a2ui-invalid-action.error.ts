/**
 * Thrown when an Action cannot be answered — it names a Surface, or Data
 * Model values, the Assistant does not recognise. Carries no HTTP knowledge:
 * mapping it onto the closed `A2UI_INVALID_PAYLOAD` code is the endpoint's
 * job, the same code the Console produces in the other direction, because
 * both name one thing — an A2UI document that could not be used.
 */
export class A2uiInvalidActionError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'A2uiInvalidActionError';
  }
}
