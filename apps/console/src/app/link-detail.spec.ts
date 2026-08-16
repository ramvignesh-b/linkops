import type {
  HttpTestingController,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
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
  type FakeEventSource,
} from './testing/console-harness';

const AT = {
  load: '2026-08-16T10:00:00.000Z',
  tick41: '2026-08-16T10:00:41.000Z',
} as const;

const ALPHA = toLinkId('lnk_alpha');
const BRAVO = toLinkId('lnk_bravo');

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

function sample(
  linkId: Link['id'],
  ts: string,
  throughputMbps: number,
  snrDb = 24,
): TelemetrySample {
  return {
    linkId,
    ts,
    rssiDbm: -55,
    snrDb,
    throughputMbps,
  };
}

const alpha = link({ id: ALPHA, name: 'Alpha Ridge', capacityMbps: 100 });
const bravo = link({
  id: BRAVO,
  name: 'Bravo Pass',
  siteA: 'Pass East',
  siteB: 'Pass West',
  band: '11GHz',
  capacityMbps: 400,
  status: { status: 'degraded' },
});

function summary(overrides: Partial<FleetSummary> = {}): FleetSummary {
  return {
    total: 2,
    up: 1,
    degraded: 1,
    down: 0,
    totalThroughputMbps: 60,
    worstLinkId: null,
    ...overrides,
  };
}

function feedSamplesThroughStream(
  stream: FakeEventSource,
  linkId: Link['id'],
  count: number,
  startTick: number,
): void {
  for (let i = startTick; i < startTick + count; i++) {
    const ts = new Date(Date.UTC(2026, 7, 16, 10, 0, i)).toISOString();
    const s = sample(linkId, ts, (i % 80) + 10);
    stream.emit('link.telemetry', { tick: i, ts, samples: [s] }, i);
    stream.emit(
      'fleet.summary',
      summary({ totalThroughputMbps: s.throughputMbps }),
      i,
    );
    TestBed.flushEffects();
  }
}

/** The window the chart's heading promises, asked for rather than assumed. */
function expectHistoryWindow(
  http: HttpTestingController,
  id: Link['id'],
): TestRequest {
  const request = http.expectOne(
    (candidate) => candidate.url === `/api/links/${id}/telemetry`,
  );
  expect(request.request.params.get('window')).toBe('5m');

  return request;
}

function pointCount(path: string | null): number {
  if (!path) return 0;
  return path.match(/[ML]/g)?.length ?? 0;
}

function subpathCount(path: string | null): number {
  if (!path) return 0;
  return path.match(/M/g)?.length ?? 0;
}

describe('one Link in detail, its latest Sample, and telemetry history', () => {
  it('renders the full configuration and the latest Sample from the Server', async () => {
    const { fixture, http } = await bootConsole('/links/lnk_alpha');
    answerFirstPaint(http, [alpha, bravo], summary());

    const latest = sample(ALPHA, AT.tick41, 42);
    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: latest });
    expectHistoryWindow(http, ALPHA).flush([latest]);
    await fixture.whenStable();

    const view = screen(fixture);
    expect(view.detailTitle()).toBe('Alpha Ridge');
    expect(view.detailValue('Sites')).toBe('Ridge North → Ridge South');
    expect(view.detailValue('Band')).toBe('5GHz');
    expect(view.detailValue('Mode')).toBe('PtP');
    expect(view.detailValue('Capacity')).toBe('100 Mbps');
    expect(view.detailValue('Tx Power')).toBe('20 dBm');
    expect(view.detailValue('Channel Width')).toBe('40 MHz');
    expect(view.detailValue('RSSI')).toBe('-55 dBm');
    expect(view.detailValue('SNR')).toBe('24 dB');
    expect(view.sparklinePath()).not.toBeNull();

    finish();
  });

  it('renders not-found when entering an unknown link id', async () => {
    const { fixture, http } = await bootConsole('/links/lnk_unknown');
    answerFirstPaint(http, [alpha, bravo], summary());

    http.expectOne('/api/links/lnk_unknown').flush(
      {
        error: {
          code: 'LINK_NOT_FOUND',
          message: 'Link lnk_unknown was not found',
          details: { linkId: 'lnk_unknown' },
        },
      },
      { status: 404, statusText: 'Not Found' },
    );
    expectHistoryWindow(http, toLinkId('lnk_unknown')).flush([]);
    await fixture.whenStable();

    const view = screen(fixture);
    expect(view.notFoundText()).toContain('This Link does not exist');

    finish();
  });

  it('says the Server did not answer rather than claiming the Link is gone', async () => {
    // A Link the store already holds, entered by deep link: without the
    // Server's answer the store could paint it, which is the fabricated
    // certainty this route exists to avoid.
    const { fixture, http } = await bootConsole('/links/lnk_alpha');
    answerFirstPaint(http, [alpha, bravo], summary());

    http
      .expectOne('/api/links/lnk_alpha')
      .flush(null, { status: 503, statusText: 'Service Unavailable' });
    expectHistoryWindow(http, ALPHA).flush(null, {
      status: 503,
      statusText: 'Service Unavailable',
    });
    await fixture.whenStable();

    const view = screen(fixture);
    expect(view.notFoundText()).toBe('');
    expect(view.unreachableText()).toContain('The Server did not answer');

    finish();
  });

  it('charts a Sample the store already held when the route opened', async () => {
    const { fixture, http, stream } = await bootConsole('/links');
    answerFirstPaint(http, [alpha, bravo], summary());

    // The Sample lands before the operator drills in, so it is in the store
    // by the time LinkHistory starts watching.
    const held = sample(ALPHA, AT.tick41, 64);
    stream().emit(
      'link.telemetry',
      { tick: 41, ts: held.ts, samples: [held] },
      41,
    );
    stream().emit('fleet.summary', summary({ totalThroughputMbps: 64 }), 41);
    await fixture.whenStable();

    const view = screen(fixture);
    view.clickLinkRow(ALPHA);
    await fixture.whenStable();

    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: held });
    expectHistoryWindow(http, ALPHA).flush([]);
    await fixture.whenStable();

    // One point, from the store — not an empty chart waiting on the next Tick.
    expect(pointCount(view.sparklinePath())).toBe(1);

    finish();
  });

  it('navigates from the fleet list to link detail on row click', async () => {
    const { fixture, http, router } = await bootConsole('/links');
    answerFirstPaint(http, [alpha, bravo], summary());
    await fixture.whenStable();

    const view = screen(fixture);
    expect(view.rowNames()).toEqual(['Alpha Ridge', 'Bravo Pass']);

    view.clickLinkRow(ALPHA);
    await fixture.whenStable();
    expect(router.url).toBe('/links/lnk_alpha');

    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: null });
    expectHistoryWindow(http, ALPHA).flush([]);
    await fixture.whenStable();

    expect(view.detailTitle()).toBe('Alpha Ridge');

    finish();
  });

  it('deduplicates live telemetry samples overlapping with the initial history window', async () => {
    const { fixture, http, stream } = await bootConsole('/links/lnk_alpha');
    answerFirstPaint(http, [alpha, bravo], summary());

    const s0 = sample(ALPHA, '2026-08-16T10:00:00.000Z', 10);
    const s1 = sample(ALPHA, '2026-08-16T10:00:01.000Z', 20);
    const s2 = sample(ALPHA, '2026-08-16T10:00:02.000Z', 30);
    const s3 = sample(ALPHA, '2026-08-16T10:00:03.000Z', 40);

    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: s3 });
    expectHistoryWindow(http, ALPHA).flush([s0, s1, s2, s3]);
    await fixture.whenStable();

    const view = screen(fixture);
    expect(view.detailTitle()).toBe('Alpha Ridge');
    // 4 samples -> 4 path points (1 M + 3 L)
    expect(pointCount(view.sparklinePath())).toBe(4);
    expect(subpathCount(view.sparklinePath())).toBe(1);

    // Overlap deduplication: stream delivers s3 (same timestamp as in REST) + s4
    const s4 = sample(ALPHA, '2026-08-16T10:00:04.000Z', 50);
    stream().emit(
      'link.telemetry',
      { tick: 4, ts: s4.ts, samples: [s3, s4] },
      4,
    );
    stream().emit('fleet.summary', summary({ totalThroughputMbps: 50 }), 4);
    await fixture.whenStable();

    // s3 was deduplicated by timestamp: exactly 5 unique points (s0..s4)
    expect(pointCount(view.sparklinePath())).toBe(5);

    finish();
  });

  it('draws a break in the sparkline path when consecutive samples cross the gap threshold', async () => {
    const { fixture, http, stream } = await bootConsole('/links/lnk_alpha');
    answerFirstPaint(http, [alpha, bravo], summary());

    const s0 = sample(ALPHA, '2026-08-16T10:00:00.000Z', 10);
    const s1 = sample(ALPHA, '2026-08-16T10:00:01.000Z', 20);

    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: s1 });
    expectHistoryWindow(http, ALPHA).flush([s0, s1]);
    await fixture.whenStable();

    const view = screen(fixture);
    expect(subpathCount(view.sparklinePath())).toBe(1);

    // Gap handling: a 10-second gap (> 2000 ms) starts a new subpath with 'M'
    const s14 = sample(ALPHA, '2026-08-16T10:00:14.000Z', 70);
    stream().emit(
      'link.telemetry',
      { tick: 14, ts: s14.ts, samples: [s14] },
      14,
    );
    stream().emit('fleet.summary', summary({ totalThroughputMbps: 70 }), 14);
    await fixture.whenStable();

    // 3 points total, with more than one 'M' command indicating a visible break across the gap
    expect(pointCount(view.sparklinePath())).toBe(3);
    expect(subpathCount(view.sparklinePath())).toBeGreaterThan(1);

    finish();
  });

  it('caps the sparkline history buffer at 300 samples', async () => {
    const { fixture, http, stream } = await bootConsole('/links/lnk_alpha');
    answerFirstPaint(http, [alpha, bravo], summary());

    const s0 = sample(ALPHA, '2026-08-16T10:00:00.000Z', 10);
    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: s0 });
    expectHistoryWindow(http, ALPHA).flush([s0]);
    await fixture.whenStable();

    const view = screen(fixture);

    // Capping at 300: feed 350 samples through the stream
    feedSamplesThroughStream(stream(), ALPHA, 350, 1);
    await fixture.whenStable();

    // Exactly 300 points retained in the sparkline path
    expect(pointCount(view.sparklinePath())).toBe(300);

    finish();
  });

  it('refetches link and history on route re-entry rather than reusing stale state', async () => {
    const { fixture, http, router, stream } =
      await bootConsole('/links/lnk_alpha');
    answerFirstPaint(http, [alpha, bravo], summary());

    const s0 = sample(ALPHA, '2026-08-16T10:00:00.000Z', 10);
    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: s0 });
    expectHistoryWindow(http, ALPHA).flush([s0]);
    await fixture.whenStable();

    // Feed samples so the route-scoped history accumulates points
    feedSamplesThroughStream(stream(), ALPHA, 50, 1);
    await fixture.whenStable();

    const view = screen(fixture);
    expect(pointCount(view.sparklinePath())).toBe(51);

    // Re-entering the view refetches rather than reusing stale history
    await router.navigateByUrl('/links');
    await fixture.whenStable();
    expect(router.url).toBe('/links');

    await router.navigateByUrl('/links/lnk_alpha');
    await fixture.whenStable();

    const freshSample = sample(ALPHA, '2026-08-16T10:01:30.000Z', 85);
    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: freshSample });
    expectHistoryWindow(http, ALPHA).flush([freshSample]);
    await fixture.whenStable();

    // Two points, not 52: the refetched window plus the Sample the store
    // still holds from the last Tick. The points accumulated before navigating
    // away went with the route-scoped `LinkHistory`.
    expect(pointCount(view.sparklinePath())).toBe(2);

    finish();
  });
});
