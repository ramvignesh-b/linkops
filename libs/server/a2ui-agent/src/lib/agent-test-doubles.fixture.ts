import {
  toLinkId,
  type FleetSummary,
  type LinkId,
  type TelemetrySample,
} from '@linkops/shared/domain';
import type {
  LinkRecord,
  LinkRepository,
} from '@linkops/server/links-data-access';
import type { TelemetryPort } from '@linkops/server/telemetry';

/**
 * An empty Roster, for tests that only care about the seam they're
 * exercising and refuse to touch the write side. Shared rather than
 * redefined per spec file, so a method added to `LinkRepository` only has
 * one fake here to update.
 */
export const fakeLinkRepository: LinkRepository = {
  findAll: (): LinkRecord[] => [],
  findById: () => undefined,
  create: () => {
    throw new Error('not used by this test');
  },
  update: () => {
    throw new Error('not used by this test');
  },
  delete: () => false,
  count: () => 0,
};

/** No Sample for any Link, and a Summary that refuses to be read. */
export const fakeTelemetryPort: TelemetryPort = {
  latestSample: (): TelemetrySample | null => null,
  latestSamples: (): ReadonlyMap<LinkId, TelemetrySample> => new Map(),
  history: () => [],
  summary: (): FleetSummary => {
    throw new Error('not used by this test');
  },
  dropLink: () => {
    // no-op
  },
};

/** A stored record, complete enough for any Assistant test's Roster read. */
export function recordWith(id: string, name: string): LinkRecord {
  return {
    id: toLinkId(id),
    name,
    siteA: 'A',
    siteB: 'B',
    band: '5GHz',
    mode: 'PtP',
    capacityMbps: 100,
    txPowerDbm: 10,
    channelWidthMhz: 20,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const SAMPLE_TS = '2026-01-01T00:00:04.000Z';

/**
 * A Telemetry Sample at one of the three states Assistant tests reason
 * about — `up`, `degraded` and `down` for poor metrics — under `deriveStatus`'s
 * own thresholds. One table, so a test asking for "a degraded Link's Sample"
 * always means the same numbers everywhere it asks.
 */
export function sampleFor(
  linkId: LinkId,
  kind: 'healthy' | 'degraded' | 'bad',
): TelemetrySample {
  const byKind = {
    healthy: { rssiDbm: -50, snrDb: 25, throughputMbps: 90 },
    degraded: { rssiDbm: -70, snrDb: 12, throughputMbps: 30 },
    bad: { rssiDbm: -85, snrDb: 5, throughputMbps: 5 },
  } as const;

  return { linkId, ts: SAMPLE_TS, ...byKind[kind] };
}
