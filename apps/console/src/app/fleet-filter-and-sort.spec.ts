import {
  toLinkId,
  type FleetSummary,
  type Link,
  type TelemetrySample,
} from '@linkops/shared/domain';
import {
  answerFirstPaint,
  bootConsole,
  finish,
  screen,
} from './testing/console-harness';

const AT = {
  load: '2026-08-16T10:00:00.000Z',
  tick41: '2026-08-16T10:00:41.000Z',
} as const;

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
    createdAt: AT.load,
    updatedAt: AT.load,
    ...overrides,
  };
}

function sample(linkId: Link['id'], throughputMbps: number): TelemetrySample {
  return {
    linkId,
    ts: AT.tick41,
    rssiDbm: -55,
    snrDb: 24,
    throughputMbps,
  };
}

// Bravo sorts last by name but has the most Capacity — the pairing that
// tells "sorted by name" and "sorted by capacityMbps" apart.
const alpha = link({ id: ALPHA, name: 'Alpha Ridge', capacityMbps: 100 });
const bravo = link({
  id: BRAVO,
  name: 'Bravo Pass',
  siteA: 'Pass East',
  siteB: 'Pass West',
  band: '11GHz',
  capacityMbps: 400,
  status: { status: 'up' },
});
const charlie = link({
  id: CHARLIE,
  name: 'Charlie Col',
  siteA: 'Col Upper',
  siteB: 'Col Lower',
  band: '24GHz',
  capacityMbps: 200,
  status: { status: 'up' },
});

function summary(overrides: Partial<FleetSummary> = {}): FleetSummary {
  return {
    total: 3,
    up: 3,
    degraded: 0,
    down: 0,
    totalThroughputMbps: 0,
    worstLinkId: null,
    ...overrides,
  };
}

describe('filtering and sorting the Fleet, with the URL as the state', () => {
  it('renders, writes and lives by the URL; and falls back rather than erroring on a bad one', async () => {
    // A mistyped `status` is not an operator's mistake to be shown an error
    // for: it falls back to the defaults, rewriting the URL to match, and
    // the whole Fleet renders as the defaults would show it.
    const bad = await bootConsole('/links?status=bogus&sort=name');
    answerFirstPaint(bad.http, [alpha, bravo, charlie], summary());
    await bad.fixture.whenStable();
    expect(screen(bad.fixture).rowIds()).toEqual([ALPHA, BRAVO, CHARLIE]);
    expect(bad.router.url).not.toContain('bogus');
    finish();

    // The URL is already narrowed and reordered before anything renders:
    // `band=5GHz` excludes Bravo and Charlie, `sort=capacityMbps&dir=desc`
    // orders what remains — one Link, so the ordering itself is proven by
    // the later, unfiltered assertions.
    const { fixture, http, router, stream } = await bootConsole(
      '/links?band=5GHz&sort=capacityMbps&dir=desc',
    );

    answerFirstPaint(http, [alpha, bravo, charlie], summary());
    await fixture.whenStable();

    const view = screen(fixture);
    // Only the Link matching the URL's filter is on screen.
    expect(view.rowIds()).toEqual([ALPHA]);
    // The KPI header still describes the whole Fleet — a filter can never
    // hide a Link from the counts above the list.
    expect(view.kpi('Links')).toBe('3');

    // Clearing the Band filter reveals the rest of the Fleet, ordered by
    // Capacity descending as the URL's `sort`/`dir` still say.
    view.setBand('');
    await fixture.whenStable();
    expect(view.rowIds()).toEqual([BRAVO, CHARLIE, ALPHA]);
    // Changing a control writes the URL.
    expect(router.url).not.toContain('band=5GHz');

    // Sorting by name, ascending, is the other ordering the fixtures prove:
    // Bravo sorts last by Capacity but first-after-Alpha by name. Both
    // controls change back to back, with no await between them — two
    // navigations racing, neither dropped by the other.
    view.setSort('name');
    view.setDir('asc');
    await fixture.whenStable();
    expect(view.rowIds()).toEqual([ALPHA, BRAVO, CHARLIE]);
    expect(router.url).toContain('sort=name');
    expect(router.url).toContain('dir=asc');

    // A free-text search narrows across name and Sites, case-insensitively.
    view.setQuery('col');
    await fixture.whenStable();
    expect(view.rowIds()).toEqual([CHARLIE]);
    expect(router.url).toContain('q=col');

    // Clearing the search and filtering by Status instead.
    view.setQuery('');
    await fixture.whenStable();
    view.setStatus('degraded');
    await fixture.whenStable();
    expect(view.rowIds()).toEqual([]);

    // The part that matters more than the controls: the filtered view stays
    // live. A Link that transitions to `degraded` on a later Tick enters a
    // `degraded`-only view immediately, with no refetch.
    stream().emit(
      'link.status',
      {
        linkId: BRAVO,
        status: { status: 'degraded' },
        previous: { status: 'up' },
      },
      42,
    );
    stream().emit(
      'link.telemetry',
      { tick: 42, ts: AT.tick41, samples: [sample(BRAVO, 300)] },
      42,
    );
    stream().emit(
      'fleet.summary',
      summary({ up: 2, degraded: 1, totalThroughputMbps: 300 }),
      42,
    );
    await fixture.whenStable();

    expect(view.rowIds()).toEqual([BRAVO]);
    expect(view.status(BRAVO)).toBe('degraded');
    // No refetch: first paint's two requests are the only ones this test
    // answers, which `finish()`'s `HttpTestingController.verify()` enforces.

    finish();
  });
});
