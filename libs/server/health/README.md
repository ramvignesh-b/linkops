# server-health

**This library holds no runtime code, and there is no health endpoint.** Despite
the name, `ServerHealthModule` is an empty Nest module, imported by nothing —
`apps/api` wires config, links-api, stream-api and a2ui-agent, and not this.

What the library actually carries is `di-metadata.spec.ts`, a guard on the
toolchain. It asserts that `design:paramtypes` is emitted for a decorated class
and that Nest resolves a constructor dependency by type alone, with no
`@Inject` token to fall back on. Those two assertions are the difference between
a working dependency-injection setup and a confusing one: if an upgrade ever
moves the test transform to something that drops decorator metadata, this one
test fails and names the cause, instead of every injection-backed test in the
workspace failing at once for reasons none of them explain.

Keeping it in a library of its own means the guard runs on every test invocation
without attaching itself to a feature that has nothing to do with it. If a
liveness endpoint is ever needed, this is where it would go — and until then the
name is the only thing here that promises one.

See [ADR-0002](../../../docs/adr/0002-unified-vitest-runner-and-swc-decorator-metadata.md),
which names this spec as the guard for that decision.

## Running unit tests

Run `nx test server-health` to execute the unit tests via [Vitest](https://vitest.dev/).
