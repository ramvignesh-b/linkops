import {
  matchesBandAndQuery,
  type BandAndQueryFilterable,
} from './matches-band-and-query';

function entity(
  overrides: Partial<BandAndQueryFilterable> = {},
): BandAndQueryFilterable {
  return {
    band: '5GHz',
    name: 'Alpha Ridge',
    siteA: 'Ridge North',
    siteB: 'Ridge South',
    ...overrides,
  };
}

describe('matchesBandAndQuery', () => {
  it('matches everything when neither filter is set', () => {
    expect(matchesBandAndQuery(entity(), {})).toBe(true);
  });

  it('filters band exactly', () => {
    expect(
      matchesBandAndQuery(entity({ band: '11GHz' }), { band: '11GHz' }),
    ).toBe(true);
    expect(
      matchesBandAndQuery(entity({ band: '5GHz' }), { band: '11GHz' }),
    ).toBe(false);
  });

  it('matches q as a case-insensitive substring of name', () => {
    expect(
      matchesBandAndQuery(entity({ name: 'Bravo Pass' }), { q: 'bravo' }),
    ).toBe(true);
    expect(
      matchesBandAndQuery(entity({ name: 'Bravo Pass' }), { q: 'charlie' }),
    ).toBe(false);
  });

  it('matches q against siteA and siteB too', () => {
    expect(
      matchesBandAndQuery(entity({ siteA: 'Pass East' }), { q: 'pass east' }),
    ).toBe(true);
    expect(
      matchesBandAndQuery(entity({ siteB: 'Col Lower' }), { q: 'col lower' }),
    ).toBe(true);
  });

  it('requires both filters to match when both are set', () => {
    const alpha = entity({ band: '5GHz', name: 'Alpha Ridge' });

    expect(matchesBandAndQuery(alpha, { band: '5GHz', q: 'alpha' })).toBe(true);
    expect(matchesBandAndQuery(alpha, { band: '11GHz', q: 'alpha' })).toBe(
      false,
    );
    expect(matchesBandAndQuery(alpha, { band: '5GHz', q: 'bravo' })).toBe(
      false,
    );
  });
});
