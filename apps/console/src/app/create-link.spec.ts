import { toLinkId, type FleetSummary, type Link } from '@linkops/shared/domain';
import {
  answerFirstPaint,
  bootConsole,
  finish,
  screen,
} from './testing/console-harness';

const AT = { load: '2026-08-16T10:00:00.000Z' } as const;

const NEW_ID = toLinkId('lnk_charlie');

function emptySummary(): FleetSummary {
  return {
    total: 0,
    up: 0,
    degraded: 0,
    down: 0,
    totalThroughputMbps: 0,
    worstLinkId: null,
  };
}

/** A submittable value: every field valid against `linkCreateSchema` bar `name`, left blank on purpose. */
function fillValidFieldsExceptName(view: ReturnType<typeof screen>): void {
  view.setFormField('siteA', 'Ridge North');
  view.setFormField('siteB', 'Ridge South');
}

describe('creating a Link from the Console', () => {
  it('rejects an invalid value before any request, then a Server name conflict lands on the same control with operator copy, then a valid submit navigates to the new Link', async () => {
    const { fixture, http, router } = await bootConsole('/links');
    answerFirstPaint(http, [], emptySummary());
    await fixture.whenStable();

    const view = screen(fixture);
    view.clickNewLink();
    await fixture.whenStable();
    expect(router.url).toBe('/links/new');

    // The `name` field is left at its blank default, which fails
    // `linkCreateSchema`'s `min(3)` — the client-side validator this form
    // runs before any round trip.
    fillValidFieldsExceptName(view);
    view.submitForm();
    await fixture.whenStable();

    expect(view.formFieldError('name')).not.toBe('');
    // No request for an invalid value — the client-side gate did its job.
    http.expectNone('/api/links');

    // Fix the value and submit again: this time a real request goes out.
    view.setFormField('name', 'Charlie Ridge');
    view.submitForm();
    await fixture.whenStable();

    const first = http.expectOne('/api/links');
    expect(first.request.body).toMatchObject({ name: 'Charlie Ridge' });
    first.flush(
      {
        error: {
          code: 'LINK_NAME_TAKEN',
          message: 'Link name "Charlie Ridge" is already in use',
          details: { name: 'Charlie Ridge' },
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    // Operator copy, on the same `name` control the client issue used —
    // never the Server's own diagnostic wording.
    const nameError = view.formFieldError('name');
    expect(nameError).not.toBe('');
    expect(nameError).not.toContain('Charlie Ridge');
    expect(nameError).not.toContain('is already in use');

    // Rename and submit once more: this attempt succeeds.
    view.setFormField('name', 'Charlie Pass');
    view.submitForm();
    await fixture.whenStable();

    const created: Link = {
      id: NEW_ID,
      name: 'Charlie Pass',
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
    http
      .expectOne('/api/links')
      .flush(created, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    expect(router.url).toBe('/links/lnk_charlie');

    // Landing on the new Link's detail route issues its own reads —
    // answered here so `finish()` sees nothing outstanding.
    http
      .expectOne('/api/links/lnk_charlie')
      .flush({ link: created, latestSample: null });
    http
      .expectOne(
        (request) => request.url === '/api/links/lnk_charlie/telemetry',
      )
      .flush([]);
    await fixture.whenStable();

    finish();
  });
});
