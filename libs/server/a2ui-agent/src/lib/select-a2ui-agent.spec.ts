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
import { StubTriageAgent } from './stub-triage-agent';
import { selectA2uiAgent } from './select-a2ui-agent';

const repository: LinkRepository = {
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

const telemetry: TelemetryPort = {
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

/**
 * The seam ticket 41 exists for: an `AssistantProvider` value in, an
 * `A2uiAgent` out (or a boot failure) — the one place `ServerA2uiAgentModule`
 * decides which implementation `A2UI_AGENT` resolves to.
 */
describe('selectA2uiAgent', () => {
  it('builds the stub for the "stub" provider', () => {
    const agent = selectA2uiAgent('stub', repository, telemetry);

    expect(agent).toBeInstanceOf(StubTriageAgent);
  });

  it('refuses the "model" provider — the seam exists, but no model client ships here', () => {
    expect(() => selectA2uiAgent('model', repository, telemetry)).toThrow(
      /no model client|does not ship/i,
    );
  });
});
