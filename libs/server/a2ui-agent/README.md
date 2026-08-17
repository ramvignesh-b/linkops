# server-a2ui-agent

The agent behind the triage panel, and the seam that keeps a model provider on
this side of the network. `A2uiAgent` is the interface; `selectA2uiAgent`
chooses an implementation from configuration at boot.

`StubTriageAgent` is what ships and what runs with no credentials present: it is
deterministic, needs no key, and answers with a real Surface, so a fresh clone
has a working panel rather than a disabled one. `GeminiAgent` is selected when a
provider and key are configured. Either way the Surface is built here, by the
same builders, from `triage-surface` — the model supplies judgement and wording,
never the document. That is what makes an empty or malformed panel
unexpressible rather than merely unlikely.

A provider named in configuration but not shipped fails the boot instead of
falling back quietly: silently downgrading would mean the one thing an operator
explicitly asked for is the one thing that silently did not happen.
`A2uiInvalidActionFilter` turns an action naming something that does not exist
into the standard error envelope.

See the root [README](../../../README.md#4-configuration) for the variables that
select an agent,
[ADR-0012](../../../docs/adr/0012-the-model-recommends-the-server-renders.md)
for the division of labour, and
[ADR-0013](../../../docs/adr/0013-provider-agnostic-configuration-and-adapter-encapsulated-defaults.md)
for how provider defaults stay inside the adapter.

## Running unit tests

Run `nx test server-a2ui-agent` to execute the unit tests via [Vitest](https://vitest.dev/).
