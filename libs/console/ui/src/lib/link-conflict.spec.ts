import { toLinkId, type Link, type LinkCreate } from '@linkops/shared/domain';
import { diffEditableFields } from './link-conflict';

function mine(overrides: Partial<LinkCreate> = {}): LinkCreate {
  return {
    name: 'Alpha Ridge',
    siteA: 'Ridge North',
    siteB: 'Ridge South',
    band: '5GHz',
    mode: 'PtP',
    capacityMbps: 100,
    txPowerDbm: 20,
    channelWidthMhz: 40,
    ...overrides,
  };
}

function theirs(overrides: Partial<Link> = {}): Link {
  return {
    id: toLinkId('lnk_alpha'),
    ...mine(),
    status: { status: 'up' },
    version: 2,
    createdAt: '2026-08-16T10:00:00.000Z',
    updatedAt: '2026-08-16T10:05:00.000Z',
    ...overrides,
  };
}

describe('diffEditableFields', () => {
  it('reports no differences when every editable field matches', () => {
    expect(diffEditableFields(mine(), theirs())).toEqual([]);
  });

  it('reports each differing field with its label, mine and theirs values', () => {
    const differences = diffEditableFields(
      mine({ name: 'Alpha Ridge', capacityMbps: 100 }),
      theirs({ name: 'Alpha Pass', capacityMbps: 200 }),
    );

    expect(differences).toEqual([
      {
        path: 'name',
        label: 'Name',
        mine: 'Alpha Ridge',
        theirs: 'Alpha Pass',
      },
      {
        path: 'capacityMbps',
        label: 'Capacity (Mbps)',
        mine: '100',
        theirs: '200',
      },
    ]);
  });

  it('ignores status, version and timestamps even when they differ', () => {
    const differences = diffEditableFields(
      mine(),
      theirs({
        status: { status: 'down', reason: 'stale' },
        version: 5,
        updatedAt: '2026-08-16T10:10:00.000Z',
      }),
    );

    expect(differences).toEqual([]);
  });
});
