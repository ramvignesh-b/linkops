# 8. The repository interface carries the version check

## Status

Accepted.

## Decision

`LinkRepository` exposes `update(id, patch, expectedVersion)` returning a discriminated result, not `save(link)`. The compare-and-swap is part of the signature, so a write that skips the version check cannot be expressed.

```
findById(id)                          → Link | null
findAll(filter)                       → Link[]
create(draft)                         → Link
update(id, patch, expectedVersion)    → { ok: true, link } | { ok: false, current }
delete(id)                            → boolean
count()                               → number
```

## Why not `save(link)`

`save` takes a whole Link and writes it. The version check then lives *somewhere else* — a service, a guard, a convention — and the next person to add a write path has to know it exists. Optimistic concurrency is the one invariant a caller cannot be trusted with, because the failure is silent: the second writer wins and the first operator's change disappears with no error anywhere.

Putting it in the signature makes the correct call the only call. A stale write returns `{ ok: false, current }`, which is also exactly what the conflict UI needs to show theirs-versus-mine — so the error path carries data rather than just failing.

## Why this also keeps the interface swappable

The stated test for this interface is that swapping in a real store touches one file. `update(id, patch, expectedVersion)` maps directly onto a conditional update — Mongo's `updateOne({ _id, version }, …)`, or a SQL `UPDATE … WHERE version = ?`. `save(link)` maps onto read-modify-write, which is a race in every real database. The naive-looking interface is the one that does not survive the swap.

## Consequences

- `create` and `update` are separate operations rather than one upsert. That is honest: creating has no version to check, and updating has nothing else to do.
- The repository returns a result type rather than throwing. The domain error (`LinkVersionConflictError` → 409) is raised by the caller that knows it is serving HTTP, keeping the repository free of transport concerns.
- `count()` exists for the fleet summary. It is on the interface rather than derived from `findAll().length` so a real store can answer it without loading every Link.
