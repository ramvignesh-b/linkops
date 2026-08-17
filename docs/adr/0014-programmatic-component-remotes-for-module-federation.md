# 14. Programmatic Component Remotes for Module Federation

Date: 2026-08-17

## Status

Accepted

## Context

To allow the AI team to deploy updates independently of the core management UI, we are extracting the Assistant side-panel into a standalone micro-frontend remote using Module Federation. At the same time, we must protect the Console's initial render-blocking bundle size by deferring the load of the Assistant until the operator interacts with it.

The initial plan was to load the extracted remote dynamically using the Angular Router (`loadChildren`) into a named router outlet (`<router-outlet name="assistant">`) placed inside the existing `@defer (on interaction)` block.

However, the Angular Router cannot target a named outlet if that outlet is hidden inside an inactive `@defer` block. Attempting to navigate to the outlet before the `@defer` block resolves causes the router to crash.

## Decision

We will abandon the Angular Router for the Module Federation integration. Instead, we will use programmatic **Component Remotes**.

The host application will isolate the imperative fetching logic into a local `AssistantWrapperComponent`. This wrapper uses `@nx/angular/mf`'s `loadRemoteModule` and renders the resolved component using `NgComponentOutlet`, while explicitly managing the loading spinner during the fetch:

```html
@if (assistantComponent()) {
  <ng-container *ngComponentOutlet="assistantComponent()"></ng-container>
} @else {
  <!-- Explicit spinner required because outer @defer finishes when this wrapper mounts -->
  <loading-spinner />
}
```

The host page remains purely declarative, wrapping the local component in its original `@defer` block:

```html
@defer (on interaction) {
  <!-- The compiler code-splits this wrapper; the wrapper fetches the remote. -->
  <linkops-assistant-wrapper></linkops-assistant-wrapper>
} @placeholder {
  <button>Ask Assistant</button>
}
```

## Consequences

**Positive:**
* **Perfect Performance Profiling:** The Angular compiler legitimately code-splits the `AssistantWrapperComponent`. We retain the ability to wrap it in `@defer (on interaction)`, ensuring zero JavaScript execution and zero network requests for the remote code until the exact millisecond the user requests it.
* **Separation of Concerns:** The host page stays purely declarative. It doesn't manage Promises or Signals. The local wrapper acts as an Anti-Corruption Layer, isolating the micro-frontend integration logic.
* **Clean URLs:** The router is bypassed. We avoid polluting the browser history and URL state with secondary outlets (e.g., `outlets: { assistant: ['chat'] }`), which is inappropriate for a simple overlay panel.
* **Strict Decoupling:** The host `feature-fleet` module still knows nothing about the Assistant's implementation at build-time.

**Negative:**
* **Loss of Router Lifecycle:** We lose access to built-in Angular Router guards, resolvers, and route data for the remote module. Any data fetching or authorization logic must be handled entirely within the Assistant component itself rather than relying on the router pipeline.
* **Imperative Loading:** The application is still forced to manually await the `loadRemoteModule` Promise and manage a `Type<any>` signal (albeit encapsulated in the wrapper), which is more verbose than a declarative `routerLink`.
