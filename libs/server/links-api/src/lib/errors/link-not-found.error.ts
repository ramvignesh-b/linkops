/**
 * Thrown when a requested Link does not exist. Carries no HTTP knowledge —
 * the exception filter is the only place that maps it onto a status code
 * and the error envelope.
 */
export class LinkNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`Link ${id} not found`);
    this.name = 'LinkNotFoundError';
  }
}
