# console-feature-fleet

The fleet page: the live link list, the filter and sort bar, the KPI header, and
the route that creates a link. It composes `console/ui` components with
`console/data-access` state and owns no presentation of its own beyond that
arrangement.

`fleet.routes` is the route definition; `LinkCreatePage` is the create form's
host. `AssistantWrapper` is the seam to the triage panel: it calls
`loadRemoteModule('assistant', './Component')` inside this route's existing
`@defer` block once an operator asks for the panel, shows a spinner while that
promise is pending, and mounts the result with `NgComponentOutlet`. The loader
itself is injected through `ASSISTANT_REMOTE_LOADER`, which lives here rather
than in `console/data-access` — a shared library is built as its own bundle,
which would inline a second copy of the federation runtime with its own
unresolved promise, and the panel would spin forever.

Naming the remote by string is also what keeps this legal: there is no static
import of `console/feature-assistant`, so no feature-to-feature edge exists for
the boundary rule to reject.

See the root [README](../../../README.md#the-assistant-remote) for how the
remote is loaded, and
[ADR-0015](../../../docs/adr/0015-assistant-as-a-module-federation-remote.md)
for the reasoning.

## Running unit tests

Run `nx test console-feature-fleet` to execute the unit tests.
