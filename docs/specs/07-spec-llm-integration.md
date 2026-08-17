# 43 - Gemini/Anthropic Model Support for A2UI

**Status:** ready-for-agent

## Problem Statement

The Console ships with a deterministic `StubTriageAgent` to ensure the Assistant feature boots without credentials. However, the system architecture explicitly provides a provider seam (`A2uiAgent`) so that a real LLM can act as the Assistant. Currently, selecting `ASSISTANT_PROVIDER=model` causes a deliberate, fast boot failure because the actual model client is not shipped. The operator cannot configure the Assistant to use real AI (like Gemini or Anthropic) to triage degraded Links and author A2UI Surfaces.

## Solution

Build real model clients that implement the `A2uiAgent` interface. The configuration will be flattened so `ASSISTANT_PROVIDER` accepts `gemini` or `anthropic` (alongside `stub`). The `A2uiAgent` interface will be made asynchronous to support network calls. The backend will assemble a tight context by pre-filtering the Fleet for degraded links and pass it to the model. The model's output will be strictly constrained to the A2UI JSON schema via the providers' native Structured Outputs features (using Zod's native `.toJsonSchema()` method). Action handling remains stateless: the Action and the current Fleet snapshot are given to the model to generate the next Surface.

## User Stories

1. As a system operator, I want to configure the Assistant to use Gemini, so that I get intelligent, real-time triage recommendations for my degraded links.
2. As a system operator, I want to configure the Assistant to use Anthropic, so that I can choose the AI provider that fits my organization's compliance and budget.
3. As a system operator, I want to click an Action button on an AI-generated Surface, so that the LLM generates the next step in the triage flow based on my choice.
4. As an infrastructure engineer, I want the AI to only process degraded links, so that my token usage is minimized and responses are fast.
5. As a developer, I want the AI to output strict A2UI JSON, so that the renderer never crashes from malformed or hallucinated UI components.
6. As a developer, I want the JSON schema sent to the model to be generated dynamically from my Zod schema, so that the prompt and the runtime validation never drift out of sync.

## Implementation Decisions

- **Configuration:** Flatten the `AssistantProvider` type from `stub | model` to `stub | gemini | anthropic`. The `selectA2uiAgent` remains a factory function (not a class) and switches on these values.
- **Async Interface:** The `A2uiAgent.respond` method changes to `respond(request: A2uiRequest): Promise<A2uiEnvelope>`. The `AgentUiController` POST endpoint will be marked `async`. The existing `StubTriageAgent` will wrap its synchronous return in a Promise.
- **Context Assembly:** The system will reuse the `needsAttention(link)` logic (currently in `StubTriageAgent`) as a shared utility. The model clients will use this to pre-filter the Roster and only pass degraded Links and their latest Telemetry into the prompt.
- **Stateless Actions:** `A2uiActionRequest` handling will be completely stateless. The model will receive the Action details (surface ID, component ID, and data model) alongside the current snapshot of degraded links, and will be prompted to generate the subsequent Surface without needing historical session storage.
- **Structured Outputs:** Both Gemini and Anthropic clients will use their respective native Structured Outputs APIs. We will use Zod 4's native `.toJsonSchema()` method to convert `a2uiEnvelopeSchema` into a JSON Schema at runtime, requiring no extra dependencies.

## Testing Decisions

- **Seam:** The primary testing seam is the `A2uiAgent` implementations themselves (`GeminiAgent`, `AnthropicAgent`) and the `AgentUiController`.
- **What makes a good test:** The tests should verify that the agents correctly pre-filter the links, correctly construct the vendor-specific SDK payloads (especially the JSON Schema conversion), and correctly unwrap the vendor's response into an `A2uiEnvelope`. The network boundary (the SDK calls) must be mocked using `vi.mock` or MSW, asserting the payload shape without hitting real APIs.
- **Prior Art:** Existing tests in `apps/console/src/app/assistant.spec.ts` test the rendering side. Tests in `apps/api/src/app/app.module.spec.ts` test the boot failure. We will add unit tests alongside the new agents in `libs/server/a2ui-agent/src/lib/`.

## Out of Scope

- Stateful conversation history (memory) for the LLM.
- Implementing the Anthropic client immediately if the SDK isn't present; the architecture must support it, but the initial PR may only ship Gemini if desired.
- Streaming responses (the A2UI protocol currently operates on whole-Surface JSON envelopes).

## Further Notes
- We rely on Zod's native `.toJsonSchema()` to enforce schema parity. If the built-in generator struggles with advanced Zod unions (like our component list), we may need to slightly simplify the A2UI Zod schema to keep the model prompt clean.
