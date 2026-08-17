# 13. Provider-agnostic configuration and adapter-encapsulated model defaults

## Status

Accepted.

## Decision

The generic configuration module (`@linkops/server/config`) does not define or export provider-specific defaults. `ASSISTANT_MODEL` is parsed as an open, optional string (`z.string().min(1).optional()`), and `ServerConfigService#assistantModel` returns `this.environment.ASSISTANT_MODEL` directly (`string | undefined`).

Default model identifiers, SDK configurations, and provider-specific fallbacks are encapsulated exclusively within their respective adapter implementations under `@linkops/server/a2ui-agent` (such as `DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'` in `GeminiAgent`).

## Why

The obvious initial impulse is to define default model fallbacks centrally in the configuration service (e.g. `config.assistantModel` returning `'gemini-3.5-flash-lite'` whenever `ASSISTANT_PROVIDER === 'gemini'`).

That design creates an inversion of control and a Divergent Change smell:

1. **Boundary Leaking**: `libs/server/config` is general application configuration. Forcing it to know vendor-specific model strings (`gemini-3.5-flash-lite`, `claude-3-5-sonnet`) leaks provider adapter implementation details across module boundaries.
2. **Extensibility Bottleneck**: When adding new model adapters (e.g. Anthropic, OpenAI, local LLMs) behind the `A2uiAgent` seam, a centralized configuration service would need to be modified repeatedly to house each vendor's default model catalog.
3. **Encapsulation**: Under the Strategy and Factory patterns governing `selectA2uiAgent`, the `A2uiAgent` interface defines the contract. Each concrete agent class (`GeminiAgent`) owns its dependencies, SDK clients, and default parameters. If the operator supplies no explicit `ASSISTANT_MODEL`, the selected agent's constructor default takes effect naturally.

## Consequences

- **Clean Seams**: `ServerConfigService` remains 100% provider-agnostic, passing raw environment values through to factories.
- **Independent Evolution**: Adding or updating provider defaults is localized entirely within that provider's adapter file in `libs/server/a2ui-agent`, requiring no changes in `libs/server/config`.
- **Openness**: Operators can override `ASSISTANT_MODEL` to any valid string without triggering schema validation failures or awaiting software releases.
