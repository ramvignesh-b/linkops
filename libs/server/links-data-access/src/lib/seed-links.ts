import { InMemoryLinkRepository } from './in-memory-link-repository';
import type { LinkDraft, LinkRepository } from './link-repository';

/**
 * Ten Links, fixed rather than random, spread across Bands, Modes and
 * Capacities so the fleet view has something to sort and filter. A fixed
 * table means a reviewer's screenshot and a test's expectation describe the
 * same fleet.
 */
export const SEED_LINKS: readonly LinkDraft[] = [
  {
    name: 'North Ridge to Depot',
    siteA: 'North Ridge',
    siteB: 'Depot',
    band: '5GHz',
    mode: 'PtP',
    capacityMbps: 300,
    txPowerDbm: 20,
    channelWidthMhz: 40,
  },
  {
    name: 'Depot to Warehouse',
    siteA: 'Depot',
    siteB: 'Warehouse',
    band: '5.8GHz',
    mode: 'PtP',
    capacityMbps: 500,
    txPowerDbm: 18,
    channelWidthMhz: 40,
  },
  {
    name: 'Warehouse to Yard',
    siteA: 'Warehouse',
    siteB: 'Yard',
    band: '11GHz',
    mode: 'PtP',
    capacityMbps: 1000,
    txPowerDbm: 22,
    channelWidthMhz: 80,
  },
  {
    name: 'Yard to South Ridge',
    siteA: 'Yard',
    siteB: 'South Ridge',
    band: '24GHz',
    mode: 'PtP',
    capacityMbps: 200,
    txPowerDbm: 15,
    channelWidthMhz: 20,
  },
  {
    name: 'South Ridge Multipoint',
    siteA: 'South Ridge',
    siteB: 'Substation',
    band: '5GHz',
    mode: 'PtMP',
    capacityMbps: 150,
    txPowerDbm: 20,
    channelWidthMhz: 20,
  },
  {
    name: 'Substation to Control Room',
    siteA: 'Substation',
    siteB: 'Control Room',
    band: '5.8GHz',
    mode: 'S2S',
    capacityMbps: 400,
    txPowerDbm: 19,
    channelWidthMhz: 40,
  },
  {
    name: 'Control Room to Tower',
    siteA: 'Control Room',
    siteB: 'Tower',
    band: '11GHz',
    mode: 'PtP',
    capacityMbps: 700,
    txPowerDbm: 21,
    channelWidthMhz: 80,
  },
  {
    name: 'Tower to East Depot',
    siteA: 'Tower',
    siteB: 'East Depot',
    band: '24GHz',
    mode: 'PtP',
    capacityMbps: 100,
    txPowerDbm: 14,
    channelWidthMhz: 20,
  },
  {
    name: 'East Depot to Yard Two',
    siteA: 'East Depot',
    siteB: 'Yard Two',
    band: '5GHz',
    mode: 'PtP',
    capacityMbps: 250,
    txPowerDbm: 20,
    channelWidthMhz: 40,
  },
  {
    name: 'Yard Two Multipoint',
    siteA: 'Yard Two',
    siteB: 'Relay',
    band: '5.8GHz',
    mode: 'PtMP',
    capacityMbps: 350,
    txPowerDbm: 17,
    channelWidthMhz: 40,
  },
];

/**
 * Helper to generate synthetic links for bottleneck profiling.
 * See the README's performance analysis for the 10,000 links analysis.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function seedSyntheticLinks(repository: LinkRepository, count: number): void {
  for (let i = 1; i <= count; i++) {
    repository.create({
      name: `Synthetic Link ${i}`,
      siteA: 'Site A',
      siteB: 'Site B',
      band: '5GHz',
      mode: 'PtP',
      capacityMbps: 500,
      txPowerDbm: 20,
      channelWidthMhz: 40,
    });
  }
}

/** Fresh repository, pre-populated with the fixed ten-Link seed. */
export function createSeededLinkRepository(): LinkRepository {
  const repository = new InMemoryLinkRepository();

  for (const draft of SEED_LINKS) {
    const result = repository.create(draft);

    if (!result.ok) {
      throw new Error(`Seed data contains a duplicate name: ${draft.name}`);
    }
  }

  // To test the 10,000-link bottleneck described in the README, uncomment the line below.
  // seedSyntheticLinks(repository, 10000);

  return repository;
}
