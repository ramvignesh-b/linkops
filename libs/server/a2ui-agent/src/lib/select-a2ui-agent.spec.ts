import {
  fakeLinkRepository as repository,
  fakeTelemetryPort as telemetry,
} from './agent-test-doubles.fixture';
import { GeminiAgent } from './gemini-agent';
import { StubTriageAgent } from './stub-triage-agent';
import { selectA2uiAgent } from './select-a2ui-agent';

/**
 * The provider seam: an `AssistantProvider` value in, an `A2uiAgent` out (or
 * a boot failure) — the one place `ServerA2uiAgentModule` decides which
 * implementation `A2UI_AGENT` resolves to.
 */
describe('selectA2uiAgent', () => {
  it('builds the stub for the "stub" provider', () => {
    const agent = selectA2uiAgent('stub', repository, telemetry);

    expect(agent).toBeInstanceOf(StubTriageAgent);
  });

  it('builds the GeminiAgent for the "gemini" provider, given a key', () => {
    const agent = selectA2uiAgent(
      'gemini',
      repository,
      telemetry,
      'sk-dummy',
      'gemini-3.6-flash',
    );

    expect(agent).toBeInstanceOf(GeminiAgent);
  });

  it('refuses the "gemini" provider without a key, rather than building a client with none', () => {
    expect(() => selectA2uiAgent('gemini', repository, telemetry)).toThrow(
      /ASSISTANT_PROVIDER_KEY/,
    );
  });

  it('refuses the "anthropic" provider — the seam exists, but no model client ships here', () => {
    expect(() =>
      selectA2uiAgent('anthropic', repository, telemetry, 'sk-dummy'),
    ).toThrow(/no model client|does not ship/i);
  });
});
