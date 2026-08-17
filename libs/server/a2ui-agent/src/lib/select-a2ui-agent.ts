import type { AssistantProvider } from '@linkops/server/config';
import type { LinkRepository } from '@linkops/server/links-data-access';
import { systemClock, type TelemetryPort } from '@linkops/server/telemetry';
import type { A2uiAgent } from './a2ui-agent';
import { GeminiAgent } from './gemini-agent';
import { StubTriageAgent } from './stub-triage-agent';

/**
 * Thrown by `selectA2uiAgent` for a provider this repository names but does
 * not ship a client for. Never mentions the key — only the provider name —
 * so a boot failure can be logged safely.
 */
export class A2uiProviderNotShippedError extends Error {
  constructor(provider: AssistantProvider) {
    super(
      `ASSISTANT_PROVIDER="${provider}" selects a model provider, but no model client ships in this repository. The seam exists (A2uiAgent) — falling back to the stub silently was rejected on purpose, because that would make the explicit choice the operator made the one thing that silently did not happen. Unset ASSISTANT_PROVIDER, or set it to "stub", to run the Assistant that ships here.`,
    );
  }
}

/**
 * The seam configuration selects an implementation at: an `AssistantProvider`
 * in, an `A2uiAgent` out — or a boot failure naming the provider, never a
 * silent fallback to the stub. `anthropic` is coherent to select and
 * unshippable to use, and this is where that gap is enforced; `gemini` is
 * the one non-stub provider that actually ships.
 *
 * `apiKey` is `ServerConfigService#assistantProviderKey` passed straight
 * through — `environmentSchema` already refuses to boot a non-stub provider
 * without one, so the check here is this seam holding its own coherence
 * rather than trusting that refusal to have run first.
 */
export function selectA2uiAgent(
  provider: AssistantProvider,
  repository: LinkRepository,
  telemetry: TelemetryPort,
  apiKey?: string,
  model?: string,
): A2uiAgent {
  switch (provider) {
    case 'stub':
      return new StubTriageAgent(repository, telemetry, systemClock);
    case 'gemini':
      if (!apiKey) {
        throw new Error(
          'ASSISTANT_PROVIDER_KEY is required when ASSISTANT_PROVIDER=gemini',
        );
      }
      return new GeminiAgent(repository, telemetry, systemClock, apiKey, model);
    case 'anthropic':
      throw new A2uiProviderNotShippedError(provider);
  }
}
