/**
 * Thrown when a Link is created (or later, renamed) with a name already in
 * use. Carries no HTTP knowledge — the exception filter is the only place
 * that maps it onto a status code and the error envelope.
 */
export class LinkNameTakenError extends Error {
  constructor(readonly linkName: string) {
    super(`Link name "${linkName}" is already in use`);
    this.name = 'LinkNameTakenError';
  }
}
