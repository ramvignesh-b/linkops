import type { Link } from '@linkops/shared/domain';

/**
 * Thrown when an edit arrives carrying a version someone else has already
 * superseded. Carries the *whole* current Link rather than its version alone:
 * that is what lets the Console show theirs-versus-mine field by field, where
 * a bare "someone changed this, reload" would throw the operator's work away
 * and make them find the difference by eye.
 *
 * Carries no HTTP knowledge — the exception filter is the only place that
 * maps it onto a status code and the error envelope.
 */
export class LinkVersionConflictError extends Error {
  constructor(readonly current: Link) {
    super(
      `Link ${current.id} has moved on to version ${current.version} since it was read`,
    );
    this.name = 'LinkVersionConflictError';
  }
}
