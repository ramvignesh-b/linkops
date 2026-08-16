import { HttpErrorResponse } from '@angular/common/http';

/**
 * Only a 404 means the thing this request named is gone. Everything else —
 * offline, a timeout, a 500, a proxy's 502 — is the Server not answering,
 * and the two get different words wherever this is used: `LinkDetailPage`'s
 * read, `LinkEditPage`'s read, and `LinkDetailPage`'s delete all draw the
 * same line.
 */
export function isNotFoundError(cause: unknown): boolean {
  return cause instanceof HttpErrorResponse && cause.status === 404;
}
