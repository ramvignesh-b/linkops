import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  AssistantSession,
  type AssistantFailure,
} from '@linkops/console/data-access';
import { A2uiSurface, operatorMessageFor } from '@linkops/console/ui';
import type { A2uiActionRequest } from '@linkops/shared/a2ui-protocol';

/**
 * The triage panel's whole content, and this remote's exposed module —
 * `apps/assistant`'s `federation.config.mjs` exposes this file's export as
 * `./Component`, and `AssistantWrapperComponent` (`console/feature-fleet`)
 * is the only thing in the host that ever names it, via
 * `loadRemoteModule`, never a static import. That is what keeps this a
 * `type:feature` an `AssistantWrapperComponent` inside another
 * `type:feature` is legally allowed to mount: there is no import-graph edge
 * for `@nx/enforce-module-boundaries` to see, because Module Federation
 * composes the two at runtime, not at build time.
 *
 * Self-contained by the same token: this is the one component on the
 * Assistant's route through the world that injects state — `AssistantSession`
 * is scoped to it via `providers`, the same way `FleetPage` used to scope it
 * to the Fleet route before extraction. Opens its own conversation exactly
 * once, on construction; the host decides only whether this component exists
 * at all.
 */
@Component({
  selector: 'lib-assistant-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A2uiSurface],
  providers: [AssistantSession],
  template: `
    @if (assistant.failure(); as failure) {
      <p class="assistant-failure">{{ failureMessage(failure) }}</p>
    }
    @if (assistant.pending()) {
      <p class="assistant-pending">Asking the assistant…</p>
    }
    <!--
      Last, and independent of both: an Action keeps the Surface it was
      raised from onscreen until the reply replaces it, so a failed round
      trip shows the message above this offer rather than instead of it.
    -->
    @if (assistant.surface(); as surface) {
      <lib-a2ui-surface [surface]="surface" (action)="onAction($event)" />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .assistant-failure {
      margin: 0;
      color: var(--status-down);
    }

    .assistant-pending {
      margin: 0;
      color: var(--text-muted);
    }
  `,
})
export class AssistantPanel {
  protected readonly assistant = inject(AssistantSession);

  constructor() {
    this.assistant.open();
  }

  protected onAction(action: A2uiActionRequest): void {
    this.assistant.act(action);
  }

  /** Exhaustive on `kind`, matching `operatorMessageFor`'s own guard on `code`. */
  protected failureMessage(failure: AssistantFailure): string {
    switch (failure.kind) {
      case 'invalid-payload':
        return operatorMessageFor(failure.code);
      case 'transport':
        return 'The assistant did not answer. Try again.';
    }
  }
}
