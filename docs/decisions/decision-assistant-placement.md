# Architecture Decision: Assistant Panel Placement

This document captures the history and reasoning behind the placement of the Assistant panel within the Nx workspace, specifically why it does not exist as its own `feature` library, and why this is the correct long-term practice.

## Initial State: Eager Scaffolding
Early in the project setup, a `console/feature-assistant` library was eagerly scaffolded. This is a common pattern in Nx workspaces where predicted features are generated upfront based on early requirements or wireframes, before the exact composition details are finalized. At that time, it might have been loosely envisioned as a standalone route or isolated feature.

## The Architectural Conflict
When implementation began (captured in Ticket 39), the true requirement crystallized: the Assistant panel needed to be embedded directly within the Fleet list view. This introduced two strict architectural conflicts with keeping it as a standalone feature library:

1. **Nx Module Boundaries:** 
   The `@nx/enforce-module-boundaries` lint rule strictly bans a `type:feature` library from importing another `type:feature` library to prevent circular dependencies. Because the Fleet view (`console/feature-fleet`) needed to compose the Assistant panel, it could not legally import `console/feature-assistant`.
2. **State Injection Conventions:**
   The project enforces a strict rule for Angular components: *"One component per route injects state. A feature library's routed component is the only one that reads a store; everything beneath it takes inputs and emits outputs."* If the Assistant remained a feature library, it would likely manage its own state while sitting inside the Fleet view, violating this convention.

## The Resolution: Deletion and Reallocation
Rather than fighting the linter, disabling the rule, or accepting a flawed design, the eagerly scaffolded `console/feature-assistant` library was deleted. Its responsibilities were cleanly split into appropriate libraries that `console/feature-fleet` is allowed to import:

- **Renderer (`console/ui`):** The purely presentational components (which accept a Surface and emit an Action) were moved into the UI library. They inject nothing, strictly adhering to the state injection rules.
- **State & Client (`console/data-access`):** The session state and HTTP client logic were placed in the data-access library. The Fleet route's main component can cleanly inject this state and pass it down to the UI components.

## Bundle Size Impact
Splitting the code into `ui` and `data-access` does **not** increase the initial render-blocking bundle size. The physical folder structure does not dictate chunking. Because the Fleet view wraps the Assistant panel in an Angular `@defer` block, the bundler automatically splits the imported `ui` and `data-access` code into a lazy-loaded chunk. This chunk is only downloaded when the operator explicitly opens the panel, preserving the strict 650 kB bundle budget.

## Testing Strategy
The integration tests for the Assistant (`assistant.spec.ts`) reside in `apps/console/src/app/` rather than in a library. This is because they rely on `bootConsole` to test the entire application composition end-to-end, rather than testing isolated library logic. 

**Conclusion:** Moving the Assistant code back to a dedicated feature library would not be a "better practice"; it would violate the repository's established module boundaries and state discipline. The current split correctly models the dependencies and responsibilities.

## Update: the Assistant panel is now a feature library, via Module Federation

Ticket 48 revisited this — not by overturning the reasoning above, but by
changing *how* the panel reaches `FleetPage`. `console/feature-assistant`
exists again, as a real `type:feature` library, because the thing that
made it illegal before — `FleetPage`, itself a `type:feature`, needing a
static import of it — no longer happens: the panel is loaded at runtime
via Module Federation (`loadRemoteModule`) rather than composed at build
time, so there is no edge in the static import graph for
`@nx/enforce-module-boundaries` to flag. The state-injection convention
this document also protects still holds, just relocated: `AssistantSession`
is now provided by the panel's own composition root, `AssistantPanel`,
which is legally allowed to inject it for the same reason `FleetPage` was
before — it is the one component on its own side of the federation
boundary. See [ADR-0014](../adr/0014-assistant-as-a-module-federation-remote.md)
for the full decision.
