import { toLinkId } from '@linkops/shared/domain';
import type { LinkRecord } from '@linkops/server/links-data-access';

/** A seeded-looking LinkRecord for tests that don't care about its exact fields. */
export function link(overrides: Partial<LinkRecord> = {}): LinkRecord {
  return {
    id: toLinkId('lnk_0001'),
    name: 'North Ridge to Depot',
    siteA: 'North Ridge',
    siteB: 'Depot',
    band: '5GHz',
    mode: 'PtP',
    capacityMbps: 300,
    txPowerDbm: 20,
    channelWidthMhz: 40,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
