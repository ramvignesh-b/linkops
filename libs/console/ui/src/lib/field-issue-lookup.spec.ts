import { issueFor } from './field-issue-lookup';

describe('issueFor', () => {
  it('returns the message for a matching path', () => {
    const issues = [{ path: 'name', message: 'Too short' }];

    expect(issueFor(issues, 'name')).toBe('Too short');
  });

  it('returns null when no issue matches the path', () => {
    const issues = [{ path: 'name', message: 'Too short' }];

    expect(issueFor(issues, 'capacityMbps')).toBeNull();
  });

  it('returns null for an empty issue list', () => {
    expect(issueFor([], 'name')).toBeNull();
  });

  it('finds a path shared by client and server issues alike', () => {
    // A server VALIDATION_FAILED envelope's `details.issues` is already this
    // same FieldIssue[] shape — this is the one lookup both go through.
    const issues = [{ path: 'siteA.name', message: 'Required' }];

    expect(issueFor(issues, 'siteA.name')).toBe('Required');
  });
});
