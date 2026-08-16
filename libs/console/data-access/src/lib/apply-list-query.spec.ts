import type {
  Link,
  LinkListQuery,
  TelemetrySample,
} from '@linkops/shared/domain';
import { toLinkId } from '@linkops/shared/domain';
import { applyListQuery } from './apply-list-query';

const ALPHA = toLinkId('lnk_alpha');
const BRAVO = toLinkId('lnk_bravo');
const CHARLIE = toLinkId('lnk_charlie');

function link(overrides: Partial<Link> & Pick<Link, 'id' | 'name'>): Link {
  return {
    siteA: 'Ridge North',
    siteB: 'Ridge South',
    band: '5GHz',
    mode: 'PtP',
    capacityMbps: 100,
    txPowerDbm: 20,
    channelWidthMhz: 40,
    status: { status: 'up' },
    version: 1,
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-08-16T10:00:00.000Z',
    ...overrides,
  };
}

function query(overrides: Partial<LinkListQuery> = {}): LinkListQuery {
  return { sort: 'name', dir: 'asc', ...overrides };
}

function sample(linkId: Link['id'], throughputMbps: number): TelemetrySample {
  return {
    linkId,
    ts: '2026-08-16T10:00:41.000Z',
    rssiDbm: -55,
    snrDb: 24,
    throughputMbps,
  };
}

const alpha = link({ id: ALPHA, name: 'Alpha Ridge' });
const bravo = link({
  id: BRAVO,
  name: 'Bravo Pass',
  siteA: 'Pass East',
  siteB: 'Pass West',
  band: '11GHz',
  capacityMbps: 400,
  status: { status: 'degraded' },
});
const charlie = link({
  id: CHARLIE,
  name: 'Charlie Col',
  siteA: 'Col Upper',
  siteB: 'Col Lower',
  band: '24GHz',
  capacityMbps: 200,
});

describe('applyListQuery', () => {
  it('returns every Link, sorted by the default, when nothing is filtered', () => {
    const result = applyListQuery([bravo, alpha, charlie], new Map(), query());

    expect(result.map((l) => l.id)).toEqual([ALPHA, BRAVO, CHARLIE]);
  });

  it('filters by status, comparing the kind only — never the reason', () => {
    const result = applyListQuery(
      [alpha, bravo, charlie],
      new Map(),
      query({ status: 'degraded' }),
    );

    expect(result.map((l) => l.id)).toEqual([BRAVO]);
  });

  it('filters by band, exactly', () => {
    const result = applyListQuery(
      [alpha, bravo, charlie],
      new Map(),
      query({ band: '24GHz' }),
    );

    expect(result.map((l) => l.id)).toEqual([CHARLIE]);
  });

  it('filters by free text across name, siteA and siteB, case-insensitively', () => {
    const result = applyListQuery(
      [alpha, bravo, charlie],
      new Map(),
      query({ q: 'pass' }),
    );

    expect(result.map((l) => l.id)).toEqual([BRAVO]);
  });

  it('combines every filter', () => {
    const result = applyListQuery(
      [alpha, bravo, charlie],
      new Map(),
      query({ status: 'up', band: '24GHz', q: 'col' }),
    );

    expect(result.map((l) => l.id)).toEqual([CHARLIE]);
  });

  it('sorts by throughputMbps, reading it off the latest Sample — 0 with no Sample', () => {
    const latestSample = new Map([
      [ALPHA, sample(ALPHA, 50)],
      [BRAVO, sample(BRAVO, 10)],
    ]);

    const result = applyListQuery(
      [alpha, bravo, charlie],
      latestSample,
      query({ sort: 'throughputMbps', dir: 'desc' }),
    );

    expect(result.map((l) => l.id)).toEqual([ALPHA, BRAVO, CHARLIE]);
  });

  it('breaks ties on id ascending, the same way the Server does', () => {
    const same = [
      link({ id: toLinkId('lnk_0003'), name: 'Same' }),
      link({ id: toLinkId('lnk_0001'), name: 'Same' }),
      link({ id: toLinkId('lnk_0002'), name: 'Same' }),
    ];

    const result = applyListQuery(same, new Map(), query({ dir: 'desc' }));

    expect(result.map((l) => l.id)).toEqual([
      'lnk_0001',
      'lnk_0002',
      'lnk_0003',
    ]);
  });
});
