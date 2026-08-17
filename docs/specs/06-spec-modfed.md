# Spec: Module Federation (Bonus B4)

**Status:** ready-for-agent

## Problem Statement
The assignment includes a stretch goal (B4) to demonstrate micro-frontend architecture by packaging one feature area as a remote via Module Federation. Currently, the Assistant panel is implemented as a set of inline UI components (`a2ui-surface` etc.) imported directly into `FleetPage`. This tightly couples the Assistant to the main Console bundle and prevents independent deployment or scaling of the Assistant feature.

## Solution
We will extract the Assistant into its own standalone Nx remote application. Instead of using the Angular Router, we will integrate it as a **Component Remote**. A tiny local wrapper component in the host will dynamically fetch the remote module via `loadRemoteModule` when requested. By keeping this wrapper inside the existing `@defer (on interaction)` block, we guarantee the chunk is only downloaded exactly when needed, preserving our bundle budget. This fulfills the B4 requirement and demonstrates a clean micro-frontend seam.

## User Stories
1. As an operator, I want the Assistant panel to load dynamically only when I interact with it, so that the initial load time of the core Fleet monitoring tools remains extremely fast.
2. As a platform engineer, I want the Assistant feature packaged as a separate micro-frontend application, so that the AI team can deploy updates to the Assistant without rebuilding or redeploying the core Console.

## Implementation Decisions

### 1. Application Scaffolding
- Generate a new Angular remote application named `assistant` using `@nx/angular:remote`.
- Configure `apps/console` to act as the Module Federation **host**, pointing to the `assistant` remote.
- The remote will serve on a distinct port (e.g., `4201`), while the host stays on `4200`.

### 2. Feature Extraction
- Create a new library: `libs/console/feature-assistant`.
- Move the top-level composition of the Assistant (which currently happens inline inside `FleetPage`'s `@defer` block) into a new exported component inside `console/feature-assistant`.
- This new component will inject `AssistantSession` and render the `a2ui-surface`.
- Expose this component from the `assistant` remote app's `module-federation.config.ts`.

### 3. Component Loading & Host Integration (The Seam)
- Create a local `AssistantWrapperComponent` in `console/feature-fleet`.
- The wrapper will inject a `signal<Type<any> | null>(null)` and call `loadRemoteModule('assistant', './Panel')` on initialization, binding the resolved component to an `*ngComponentOutlet`.
- The wrapper must explicitly render a loading spinner while the `loadRemoteModule` promise is pending, because the outer `@defer` block's native `@loading` state only covers the download of the local wrapper itself.
- In `FleetPage` (`console/feature-fleet`), remove the direct import of `a2ui-surface` and `AssistantSession`.
- Place `<linkops-assistant-wrapper>` inside the existing `@defer (on interaction)` block.

### 4. Boundary Rules
- The tag axes (`platform:console`, `type:feature`) remain perfectly intact.
- `console/feature-fleet` no longer knows about the Assistant components at compile time, eliminating the feature-to-feature risk entirely.

## Testing Decisions
- **E2E/Integration:** The primary seam is programmatic fetching. We will verify that clicking the "Ask Assistant" button triggers the network request for the remote chunk without navigating away from the Fleet List or breaking the telemetry stream.
- **Boot sequence:** Validate that `pnpm start` boots both the host and the remote concurrently.

## Out of Scope
- Rewriting the A2UI protocol or the `AssistantSession` data access. They work perfectly; we are only changing *where* they are instantiated and rendered.
- State sharing between the remote and the host. The Assistant remains purely additive and isolated (it talks directly to `/api/agent/ui` and does not mutate the `FleetStore`).
