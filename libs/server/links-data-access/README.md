# server-links-data-access

Where Links are stored and where a write is made safe. `LinkRepository` is the
interface; `InMemoryLinkRepository` is the implementation that ships, holding
aggregates in a `Map` for as long as the process runs. Swapping in a real
database is meant to touch this library and nothing else.

The interface carries the concurrency check rather than trusting a caller to
perform it: `update(id, patch, expectedVersion)` has no counterpart that skips
the version, so a write that forgets it does not compile. The repository returns
structured results — a stale version, a taken name — which the controller maps
to a status code rather than interpreting an exception.

`seedLinks` is the fixed ten-link fleet the API boots with. It is deliberately
not random, so a screenshot, a test, and a reviewer's first load all describe the
same fleet. `link-repository.contract.ts` holds the behaviour every
implementation must satisfy, written once: a new repository runs against it
rather than growing tests of its own.

See the root [README](../../../README.md#8-how-it-works) for where this sits,
and
[ADR-0008](../../../docs/adr/0008-repository-interface-carries-the-version-check.md)
for why the signature carries the check.

## Running unit tests

Run `nx test server-links-data-access` to execute the unit tests via [Vitest](https://vitest.dev/).
