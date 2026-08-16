import { toLinkId, type FleetSummary, type Link } from '@linkops/shared/domain';
import {
  answerFirstPaint,
  bootConsole,
  finish,
  screen,
} from './testing/console-harness';

const AT = { load: '2026-08-16T10:00:00.000Z' } as const;

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

const alpha = link({ id: ALPHA, name: 'Alpha Ridge' });
const bravo = link({ id: BRAVO, name: 'Bravo Pass' });

function summary(overrides: Partial<FleetSummary> = {}): FleetSummary {
  return {
    total: 2,
    up: 2,
    degraded: 0,
    down: 0,
    totalThroughputMbps: 0,
    worstLinkId: null,
    ...overrides,
  };
}

describe('deleting a Link', () => {
  it('leaves the Fleet view without the row, and a later deletion event for the same Link changes nothing', async () => {
    const { fixture, http, router, stream } = await bootConsole('/links');
    answerFirstPaint(http, [alpha, bravo], summary());
    await fixture.whenStable();

    const view = screen(fixture);
    view.clickLinkRow(ALPHA);
    await fixture.whenStable();

    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: null });
    http
      .expectOne((request) => request.url === '/api/links/lnk_alpha/telemetry')
      .flush([]);
    await fixture.whenStable();

    view.clickDelete();
    await fixture.whenStable();

    // Names the Link, per the ticket's "confirmed by name".
    expect(view.deleteConfirmText()).toContain('Alpha Ridge');

    view.clickConfirmDelete();
    await fixture.whenStable();

    const request = http.expectOne('/api/links/lnk_alpha');
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(router.url).toBe('/links');
    expect(view.rowIds()).toEqual([BRAVO]);

    // The membership event that follows, up to a Tick later — applying it
    // twice has to be harmless.
    stream().emit('link.deleted', { linkId: ALPHA }, 1);
    stream().emit('fleet.summary', summary({ total: 1, up: 1 }), 1);
    await fixture.whenStable();

    expect(view.rowIds()).toEqual([BRAVO]);

    finish();
  });

  it('cancelling mid-request stays put rather than navigating away once the abandoned request settles', async () => {
    const { fixture, http, router } = await bootConsole('/links');
    answerFirstPaint(http, [alpha, bravo], summary());
    await fixture.whenStable();

    const view = screen(fixture);
    view.clickLinkRow(ALPHA);
    await fixture.whenStable();

    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: null });
    http
      .expectOne((request) => request.url === '/api/links/lnk_alpha/telemetry')
      .flush([]);
    await fixture.whenStable();

    view.clickDelete();
    await fixture.whenStable();
    view.clickConfirmDelete();
    await fixture.whenStable();

    const request = http.expectOne('/api/links/lnk_alpha');

    // Cancelled while the DELETE is still in flight.
    view.clickCancelDelete();
    await fixture.whenStable();

    expect(view.deleteConfirmText()).toBe('');
    expect(router.url).toBe('/links/lnk_alpha');

    // A real cancel: the request is aborted, not merely ignored, so there is
    // no response left that could navigate the operator away later.
    expect(request.cancelled).toBe(true);

    finish();
  });
});
