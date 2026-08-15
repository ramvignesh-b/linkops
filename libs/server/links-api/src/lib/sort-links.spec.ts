import type { Link } from '@linkops/shared/domain';
import { sortLinks, type SortableLink } from './sort-links';

function entry(overrides: {
  id: string;
  name: string;
  capacityMbps: number;
  status: Link['status']['status'];
  throughputMbps: number;
}): SortableLink {
  const link = {
    id: overrides.id,
    name: overrides.name,
    siteA: 'A',
    siteB: 'B',
    band: '5GHz',
    mode: 'PtP',
    capacityMbps: overrides.capacityMbps,
    txPowerDbm: 20,
    channelWidthMhz: 40,
    status:
      overrides.status === 'down'
        ? { status: 'down', reason: 'stale' }
        : { status: overrides.status },
    version: 1,
    createdAt: '2026-08-15T09:00:00.000Z',
    updatedAt: '2026-08-15T09:00:00.000Z',
  } as Link;

  return { link, throughputMbps: overrides.throughputMbps };
}

describe('sortLinks', () => {
  it('sorts by name ascending', () => {
    const entries = [
      entry({
        id: 'lnk_0002',
        name: 'Yard',
        capacityMbps: 1,
        status: 'up',
        throughputMbps: 1,
      }),
      entry({
        id: 'lnk_0001',
        name: 'Depot',
        capacityMbps: 1,
        status: 'up',
        throughputMbps: 1,
      }),
    ];

    const sorted = sortLinks(entries, 'name', 'asc');

    expect(sorted.map((e) => e.link.name)).toEqual(['Depot', 'Yard']);
  });

  it('sorts by name descending', () => {
    const entries = [
      entry({
        id: 'lnk_0002',
        name: 'Depot',
        capacityMbps: 1,
        status: 'up',
        throughputMbps: 1,
      }),
      entry({
        id: 'lnk_0001',
        name: 'Yard',
        capacityMbps: 1,
        status: 'up',
        throughputMbps: 1,
      }),
    ];

    const sorted = sortLinks(entries, 'name', 'desc');

    expect(sorted.map((e) => e.link.name)).toEqual(['Yard', 'Depot']);
  });

  it('sorts by capacityMbps in both directions', () => {
    const entries = [
      entry({
        id: 'lnk_0001',
        name: 'A',
        capacityMbps: 500,
        status: 'up',
        throughputMbps: 1,
      }),
      entry({
        id: 'lnk_0002',
        name: 'B',
        capacityMbps: 100,
        status: 'up',
        throughputMbps: 1,
      }),
    ];

    expect(
      sortLinks(entries, 'capacityMbps', 'asc').map((e) => e.link.capacityMbps),
    ).toEqual([100, 500]);
    expect(
      sortLinks(entries, 'capacityMbps', 'desc').map(
        (e) => e.link.capacityMbps,
      ),
    ).toEqual([500, 100]);
  });

  it('sorts by status in both directions', () => {
    const entries = [
      entry({
        id: 'lnk_0001',
        name: 'A',
        capacityMbps: 1,
        status: 'up',
        throughputMbps: 1,
      }),
      entry({
        id: 'lnk_0002',
        name: 'B',
        capacityMbps: 1,
        status: 'degraded',
        throughputMbps: 1,
      }),
      entry({
        id: 'lnk_0003',
        name: 'C',
        capacityMbps: 1,
        status: 'down',
        throughputMbps: 1,
      }),
    ];

    expect(
      sortLinks(entries, 'status', 'asc').map((e) => e.link.status.status),
    ).toEqual(['degraded', 'down', 'up']);
    expect(
      sortLinks(entries, 'status', 'desc').map((e) => e.link.status.status),
    ).toEqual(['up', 'down', 'degraded']);
  });

  it('sorts by throughputMbps in both directions', () => {
    const entries = [
      entry({
        id: 'lnk_0001',
        name: 'A',
        capacityMbps: 1,
        status: 'up',
        throughputMbps: 50,
      }),
      entry({
        id: 'lnk_0002',
        name: 'B',
        capacityMbps: 1,
        status: 'up',
        throughputMbps: 10,
      }),
    ];

    expect(
      sortLinks(entries, 'throughputMbps', 'asc').map((e) => e.throughputMbps),
    ).toEqual([10, 50]);
    expect(
      sortLinks(entries, 'throughputMbps', 'desc').map((e) => e.throughputMbps),
    ).toEqual([50, 10]);
  });

  it('breaks a tie on id, ascending, regardless of the requested direction', () => {
    const entries = [
      entry({
        id: 'lnk_0003',
        name: 'Same',
        capacityMbps: 1,
        status: 'up',
        throughputMbps: 1,
      }),
      entry({
        id: 'lnk_0001',
        name: 'Same',
        capacityMbps: 1,
        status: 'up',
        throughputMbps: 1,
      }),
      entry({
        id: 'lnk_0002',
        name: 'Same',
        capacityMbps: 1,
        status: 'up',
        throughputMbps: 1,
      }),
    ];

    const ascending = sortLinks(entries, 'name', 'asc').map((e) => e.link.id);
    const descending = sortLinks(entries, 'name', 'desc').map((e) => e.link.id);

    expect(ascending).toEqual(['lnk_0001', 'lnk_0002', 'lnk_0003']);
    expect(descending).toEqual(['lnk_0001', 'lnk_0002', 'lnk_0003']);
  });

  it('does not mutate the array it is given', () => {
    const entries = [
      entry({
        id: 'lnk_0002',
        name: 'Yard',
        capacityMbps: 1,
        status: 'up',
        throughputMbps: 1,
      }),
      entry({
        id: 'lnk_0001',
        name: 'Depot',
        capacityMbps: 1,
        status: 'up',
        throughputMbps: 1,
      }),
    ];
    const original = [...entries];

    sortLinks(entries, 'name', 'asc');

    expect(entries).toEqual(original);
  });
});
