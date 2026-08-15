import type { z } from 'zod';
import type { FieldIssue } from './field-issue';

/**
 * The only place zod's world meets Angular's. A dotted-path `FieldIssue[]`
 * is the wire shape both a server `VALIDATION_FAILED` and a client-side
 * `safeParse` reduce to, so zod's issue format never becomes part of the
 * public contract.
 */
export function zodIssuesToFieldIssues(
  issues: readonly z.core.$ZodIssueBase[],
): FieldIssue[] {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}
