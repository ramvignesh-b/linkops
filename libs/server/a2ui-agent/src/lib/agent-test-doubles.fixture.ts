import type {
  FleetSummary,
  LinkId,
  TelemetrySample,
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
