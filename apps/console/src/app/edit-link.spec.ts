import { toLinkId, type FleetSummary, type Link } from '@linkops/shared/domain';
import {
  answerFirstPaint,
  bootConsole,
  finish,
  screen,
} from './testing/console-harness';

const AT = { load: '2026-08-16T10:00:00.000Z' } as const;

const ALPHA = toLinkId('lnk_alpha');

function summary(): FleetSummary {
  return {
    total: 1,
    up: 1,
    degraded: 0,
    down: 0,
    totalThroughputMbps: 60,
    worstLinkId: null,
  };
}

const BRAVO = toLinkId('lnk_bravo');

const alpha: Link = {
  id: ALPHA,
  name: 'Alpha Ridge',
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
};

const bravo: Link = {
  ...alpha,
  id: BRAVO,
  name: 'Bravo Pass',
  siteA: 'Pass East',
  siteB: 'Pass West',
};

describe('editing a Link, and resolving a version conflict', () => {
  it('renders the field-level diff on a version conflict, and "keep mine" resolves it', async () => {
    const { fixture, http, router } = await bootConsole('/links/lnk_alpha');
    answerFirstPaint(http, [alpha], summary());
    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: null });
    http
      .expectOne((request) => request.url === '/api/links/lnk_alpha/telemetry')
      .flush([]);
    await fixture.whenStable();

    const view = screen(fixture);
    view.clickEditLink();
    await fixture.whenStable();
    expect(router.url).toBe('/links/lnk_alpha/edit');

    // The edit page reads the Link fresh rather than trusting the store.
    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: null });
    await fixture.whenStable();

    // Pre-filled from the current Link.
    expect(view.formFieldValue('name')).toBe('Alpha Ridge');
    expect(view.formFieldValue('capacityMbps')).toBe('100');

    // The operator changes the capacity and submits.
    view.setFormField('capacityMbps', '150');
    view.submitForm();
    await fixture.whenStable();

    const first = http.expectOne('/api/links/lnk_alpha');
    expect(first.request.method).toBe('PATCH');
    expect(first.request.body).toMatchObject({ capacityMbps: 150, version: 1 });

    // Someone else changed the name and capacity in the meantime.
    const theirs: Link = {
      ...alpha,
      name: 'Alpha Pass',
      capacityMbps: 200,
      version: 2,
      updatedAt: '2026-08-16T10:00:30.000Z',
    };
    first.flush(
      {
        error: {
          code: 'LINK_VERSION_CONFLICT',
          message: 'Link lnk_alpha has moved to version 2',
          details: { currentVersion: 2, current: theirs },
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    // Only the fields that actually differ, and only editable ones.
    expect(view.conflictFields()).toEqual(['name', 'capacityMbps']);
    expect(view.conflictValues('name')).toEqual({
      mine: 'Alpha Ridge',
      theirs: 'Alpha Pass',
    });
    expect(view.conflictValues('capacityMbps')).toEqual({
      mine: '150',
      theirs: '200',
    });

    view.clickKeepMine();
    await fixture.whenStable();

    // The same patch, resubmitted carrying the current version.
    const second = http.expectOne('/api/links/lnk_alpha');
    expect(second.request.method).toBe('PATCH');
    expect(second.request.body).toMatchObject({
      capacityMbps: 150,
      version: 2,
    });

    const resolved: Link = { ...theirs, capacityMbps: 150, version: 3 };
    second.flush(resolved);
    await fixture.whenStable();

    expect(router.url).toBe('/links/lnk_alpha');

    // Landing back on the detail route issues its own reads.
    http.expectOne('/api/links/lnk_alpha').flush({
      link: resolved,
      latestSample: null,
    });
    http
      .expectOne((request) => request.url === '/api/links/lnk_alpha/telemetry')
      .flush([]);
    await fixture.whenStable();

    finish();
  });

  it('drops a stale conflict when the route re-enters for a different Link', async () => {
    const { fixture, http, router } = await bootConsole(
      '/links/lnk_alpha/edit',
    );
    answerFirstPaint(http, [alpha, bravo], summary());
    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: null });
    await fixture.whenStable();

    const view = screen(fixture);
    view.setFormField('capacityMbps', '150');
    view.submitForm();
    await fixture.whenStable();

    http.expectOne('/api/links/lnk_alpha').flush(
      {
        error: {
          code: 'LINK_VERSION_CONFLICT',
          message: 'Link lnk_alpha has moved to version 2',
          details: {
            currentVersion: 2,
            current: { ...alpha, name: 'Alpha Pass', version: 2 },
          },
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    // Alpha's conflict is showing before the operator navigates away from it
    // — capacity differs too, since the Server's `current` never saw the
    // operator's own edit.
    expect(view.conflictFields()).toEqual(['name', 'capacityMbps']);

    // Same route config, a different `:id` — the component instance is
    // reused, the way `LinkDetailPage`'s own route re-entry is.
    await router.navigateByUrl('/links/lnk_bravo/edit');
    await fixture.whenStable();

    http.expectOne('/api/links/lnk_bravo').flush({
      link: bravo,
      latestSample: null,
    });
    await fixture.whenStable();

    // Bravo's form, not Alpha's leftover conflict.
    expect(view.conflictFields()).toEqual([]);
    expect(view.formFieldValue('name')).toBe('Bravo Pass');

    finish();
  });

  it('keeps the operator\'s edited value on screen when "keep mine" itself fails for a reason other than a conflict', async () => {
    const { fixture, http } = await bootConsole('/links/lnk_alpha/edit');
    answerFirstPaint(http, [alpha, bravo], summary());
    http
      .expectOne('/api/links/lnk_alpha')
      .flush({ link: alpha, latestSample: null });
    await fixture.whenStable();

    const view = screen(fixture);
    view.setFormField('capacityMbps', '150');
    view.submitForm();
    await fixture.whenStable();

    const theirs: Link = { ...alpha, name: 'Alpha Pass', version: 2 };
    http.expectOne('/api/links/lnk_alpha').flush(
      {
        error: {
          code: 'LINK_VERSION_CONFLICT',
          message: 'Link lnk_alpha has moved to version 2',
          details: { currentVersion: 2, current: theirs },
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    view.clickKeepMine();
    await fixture.whenStable();

    // The resubmission itself fails, for a reason that isn't another
    // conflict — the `LinkForm` this swaps back to is a freshly created
    // instance (Angular destroys it when the conflict view is shown).
    http.expectOne('/api/links/lnk_alpha').flush(
      {
        error: {
          code: 'LINK_NAME_TAKEN',
          message: 'Link name "Alpha Ridge" is already in use',
          details: { name: 'Alpha Ridge' },
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    // The operator's edit is still on screen — not reverted to the value the
    // route first loaded.
    expect(view.formFieldValue('capacityMbps')).toBe('150');

    finish();
  });
});
