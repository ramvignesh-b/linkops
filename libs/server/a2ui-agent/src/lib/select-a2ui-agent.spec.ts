import {
  fakeLinkRepository as repository,
  fakeTelemetryPort as telemetry,
} from './agent-test-doubles.fixture';
import { StubTriageAgent } from './stub-triage-agent';
import { selectA2uiAgent } from './select-a2ui-agent';

/**
 * The seam ticket `41` exists for: an `AssistantProvider` value in, an
 * `A2uiAgent` out (or a boot failure) — the one place `ServerA2uiAgentModule`
 * decides which implementation `A2UI_AGENT` resolves to.
 */
describe('selectA2uiAgent', () => {
  it('builds the stub for the "stub" provider', () => {
    const agent = selectA2uiAgent('stub', repository, telemetry);

    expect(agent).toBeInstanceOf(StubTriageAgent);
  });

  it.each(['gemini', 'anthropic'] as const)(
    'refuses the "%s" provider — the seam exists, but no model client ships here',
    (provider) => {
      expect(() => selectA2uiAgent(provider, repository, telemetry)).toThrow(
        /no model client|does not ship/i,
      );
    },
  );
});
