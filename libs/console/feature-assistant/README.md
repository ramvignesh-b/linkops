# console-feature-assistant

The triage panel, and nothing else. `AssistantPanel` is this library's one
export: it asks the API what to show, renders the returned Surface through
`console/ui`'s whitelist renderer, and sends an operator's chosen action back to
get the next one.

This is the only library in the workspace imported by exactly one application
and no other library. `apps/assistant` builds it and exposes it as
`./Component`; the Console fetches it at runtime. `console/feature-fleet` never
imports it — it names the remote by string instead, which is what keeps a
feature library from importing another one.

The panel provides its own `AssistantSession` rather than receiving it from the
route that displays it, so nothing about its state escapes into the host. That
is what makes it extractable at all.

See the root [README](../../../README.md#the-assistant-remote) for how the host
loads it, and
[ADR-0015](../../../docs/adr/0015-assistant-as-a-module-federation-remote.md)
for why this panel was the one packaged as a remote.

## Running unit tests

Run `nx test console-feature-assistant` to execute the unit tests.
