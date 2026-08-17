# console-feature-link-detail

The single-link view and its edit route: configuration, live telemetry, the
throughput sparkline, and the form that changes a link.

`link-detail.routes` and `link-edit.routes` are the two route definitions.
`LinkHistory` holds the chart's samples — the view loads its window once and
appends live samples from the stream rather than refetching each tick, and caps
what it keeps at `HISTORY_CAP`, the same bound the server's ring buffer uses. An
uncapped append would grow with how long a screen stayed open, reopening on the
client the exact leak the server closed.

Editing sends the link's `version`, and a stale write comes back as a conflict
this route hands to `LinkConflict` for the operator to resolve — never a silent
overwrite and never an unexplained failure.

See the root [README](../../../README.md#8-how-it-works) for where telemetry
comes from, and
[ADR-0010](../../../docs/adr/0010-telemetry-retention-is-capacity-bounded.md)
for why retention is bounded by capacity rather than by the window a client asks
for.

## Running unit tests

Run `nx test console-feature-link-detail` to execute the unit tests.
