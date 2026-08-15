/**
 * One validation failure, keyed by its dotted field path. The wire shape a
 * server `VALIDATION_FAILED` and a client-side `safeParse` both reduce to,
 * so one adapter puts either onto the same form controls.
 */
export interface FieldIssue {
  path: string;
  message: string;
}
