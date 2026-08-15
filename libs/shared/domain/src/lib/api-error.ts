import type { Link } from './link';
import type { FieldIssue } from './field-issue';

/**
 * Every failure this API — and the two slices after it — can produce. Closed
 * deliberately: there is no internal-error member, because synthesising an
 * envelope for an unrecognised failure would lie about where it came from.
 */
export type ApiErrorCode =
  | 'LINK_NOT_FOUND'
  | 'LINK_VERSION_CONFLICT'
  | 'LINK_NAME_TAKEN'
  | 'VALIDATION_FAILED'
  | 'A2UI_INVALID_PAYLOAD';

/**
 * The one envelope shape for every failure: `{ error: ApiErrorBody }`. The
 * HTTP status carries the class, `code` carries the meaning, and `details`
 * is typed per `code` so a consumer reads `details.current` without a cast.
 *
 * `message` is diagnostic — for logs and API consumers, never for an
 * operator. The Console owns operator-facing copy, keyed off `code`,
 * because the Server does not know where an error lands.
 */
export type ApiErrorBody =
  | { code: 'LINK_NOT_FOUND'; message: string; details: { id: string } }
  | {
      code: 'LINK_VERSION_CONFLICT';
      message: string;
      details: { currentVersion: number; current: Link };
    }
  | { code: 'LINK_NAME_TAKEN'; message: string; details: { name: string } }
  | {
      code: 'VALIDATION_FAILED';
      message: string;
      details: { issues: FieldIssue[] };
    }
  | {
      code: 'A2UI_INVALID_PAYLOAD';
      message: string;
      details: { reason: string };
    };
