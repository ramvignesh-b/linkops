import { zodIssuesToFieldIssues } from './zod-issues-to-field-issues';

describe('zodIssuesToFieldIssues', () => {
  it('maps a top-level path to a dotted string', () => {
    const issues = [
      { path: ['name'], message: 'Too short', code: 'too_small' },
    ];

    expect(zodIssuesToFieldIssues(issues)).toEqual([
      { path: 'name', message: 'Too short' },
    ]);
  });

  it('joins a nested path with dots', () => {
    const issues = [
      {
        path: ['siteA', 'coordinates', 'lat'],
        message: 'Expected number',
        code: 'invalid_type',
      },
    ];

    expect(zodIssuesToFieldIssues(issues)).toEqual([
      { path: 'siteA.coordinates.lat', message: 'Expected number' },
    ]);
  });

  it('joins an array index into the dotted path', () => {
    const issues = [
      {
        path: ['sites', 1, 'name'],
        message: 'Required',
        code: 'invalid_type',
      },
    ];

    expect(zodIssuesToFieldIssues(issues)).toEqual([
      { path: 'sites.1.name', message: 'Required' },
    ]);
  });

  it('maps every issue in a multi-issue list, preserving order', () => {
    const issues = [
      { path: ['name'], message: 'Too short', code: 'too_small' },
      { path: ['capacityMbps'], message: 'Too small', code: 'too_small' },
    ];

    expect(zodIssuesToFieldIssues(issues)).toEqual([
      { path: 'name', message: 'Too short' },
      { path: 'capacityMbps', message: 'Too small' },
    ]);
  });
});
