# 10. Telemetry retention is capacity-bounded, not window-bounded

## Status

Accepted.

## Decision

The Simulator retains at most `SAMPLE_BUFFER_CAPACITY` (300) Samples per Link — 5 minutes at the 1 Hz Tick rate — regardless of what a client asks for. `GET /links/:id/telemetry?window=` accepts any duration up to its schema's own cap, but a window wider than what's retained silently returns fewer Samples than requested, never more than exist and never fabricated to fill the gap. The retention bound and `DEFAULT_TELEMETRY_WINDOW` are deliberately the same 5 minutes, but nothing beyond the two constants agreeing enforces that coupling.

## Why

Bounded, fixed-capacity retention is what makes "no leaks" (see `CONTEXT.md`) a claim this system can actually keep for a fleet that runs for days: a buffer sized to whatever window a client might request would grow with both fleet size and the widest window anyone has ever asked for, defeating the fixed per-Link cost the Ring Buffer exists to guarantee. Truncating rather than erroring or padding follows the same honesty rule [ADR-0005](./0005-snapshot-on-connect-no-telemetry-replay.md) already established for stream reconnects — a client asking for an hour it didn't retain gets exactly what's real, not a blocked read and not invented data.

## Considered Options

- **Reject a `window` wider than retention with 400.** Turns a client asking for more history than exists into a hard failure, for a case that isn't actually wrong — the client still gets useful data, just less than it asked for. Rejected: penalizes exactly the client that would benefit most from seeing what's available.
- **Size the buffer to the widest schema-legal `window`.** `telemetryWindowQuerySchema` accepts up to nine-digit hour counts; sizing retention to match would make the per-Link memory cost effectively unbounded — the leak this component exists to close.
- **Validate `window` against retention at the schema level.** Would require `shared/domain` to know a `server/telemetry` implementation constant, coupling the `type:domain` layer to a `type:data-access` one across the boundary [ADR-0009](./0009-three-tag-axes-platform-domain-type.md) draws.

## Consequences

- A client requesting `window=1h` gets at most 5 minutes back with no error and nothing in the response shape signalling truncation — the same silence `CONTEXT.md`'s `Fleet Summary` entry already accepts for "a Link's absence... means nothing."
- `SAMPLE_BUFFER_CAPACITY` and `DEFAULT_TELEMETRY_WINDOW` must be changed together by hand; nothing in the type system enforces the coupling, so a future change to either is worth grepping for the other.
