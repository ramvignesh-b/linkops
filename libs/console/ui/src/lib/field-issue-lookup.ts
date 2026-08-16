import type { FieldIssue } from '@linkops/shared/domain';

/**
 * One control's message, found by its dotted path in a `FieldIssue[]` — the
 * one place both a client-side `safeParse` (via `zodIssuesToFieldIssues`) and
 * a Server `VALIDATION_FAILED` or `LINK_NAME_TAKEN` envelope land before a
 * control ever renders them. `null` when the path carries no issue, so a
 * template can `@if` on it directly.
 */
export function issueFor(
  issues: readonly FieldIssue[],
  path: string,
): string | null {
  return issues.find((issue) => issue.path === path)?.message ?? null;
}
