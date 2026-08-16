import type { ApiErrorCode } from '@linkops/shared/domain';

/**
 * Operator-facing words for a Server error `code` — never the Server's own
 * diagnostic `message`, which is for logs and API consumers per
 * `CONTEXT.md`'s Error Envelope entry. Exhaustive on purpose, the same way
 * `LinksController.create`'s own switch is: `noImplicitReturns` makes a code
 * this switch doesn't cover a compile error, not a control silently left
 * blank.
 */
export function operatorMessageFor(code: ApiErrorCode): string {
  switch (code) {
    case 'LINK_NOT_FOUND':
      return 'This Link no longer exists.';
    case 'LINK_VERSION_CONFLICT':
      return 'Someone else changed this Link since you opened it.';
    case 'LINK_NAME_TAKEN':
      return 'That name is already taken by another Link.';
    case 'VALIDATION_FAILED':
      return 'Check the highlighted fields.';
    case 'A2UI_INVALID_PAYLOAD':
      return 'The assistant sent something the Console could not use.';
  }
}
