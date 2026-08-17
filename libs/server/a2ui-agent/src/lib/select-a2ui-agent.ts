import type { AssistantProvider } from '@linkops/server/config';
import type { LinkRepository } from '@linkops/server/links-data-access';
import { systemClock, type TelemetryPort } from '@linkops/server/telemetry';
import type { A2uiAgent } from './a2ui-agent';
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
 * silent fallback to the stub. Today there is one real implementation, and
 * it is the one that runs for someone who cloned this repository and holds
 * no credentials; the other value is coherent to select and unshippable to
 * use, and this is where that gap is enforced.
 */
export function selectA2uiAgent(
  provider: AssistantProvider,
  repository: LinkRepository,
  telemetry: TelemetryPort,
): A2uiAgent {
  switch (provider) {
    case 'stub':
      return new StubTriageAgent(repository, telemetry, systemClock);
    case 'gemini':
    case 'anthropic':
      throw new A2uiProviderNotShippedError(provider);
  }
}
