import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  type Type,
} from '@angular/core';
import { ASSISTANT_REMOTE_LOADER } from '@linkops/console/data-access';

/**
 * Fetches the Assistant remote's component and mounts it — the whole of
 * what `console/feature-fleet` knows about the Assistant. Everything the
 * panel actually renders with, and everything it injects, lives on the
 * other side of `loadRemoteModule`, in `console/feature-assistant`,
 * fetched only once an operator opens the panel.
 *
 * `component` is `null` for exactly as long as that promise is pending —
 * the spinner below is what an operator watches while the remote's code
 * chunk downloads, on whatever connection they have.
 */
@Component({
  selector: 'lib-assistant-wrapper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    @if (component(); as component) {
      <ng-container *ngComponentOutlet="component" />
    } @else {
      <div class="assistant-loading" role="status">
        <span class="assistant-spinner" aria-hidden="true"></span>
        <span>Loading the assistant…</span>
      </div>
    }
  `,
  styles: `
    .assistant-loading {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--text-muted);
    }

    .assistant-spinner {
      width: 1rem;
      height: 1rem;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: assistant-spin 0.8s linear infinite;
    }

    @keyframes assistant-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class AssistantWrapper {
  private readonly loadRemoteComponent = inject(ASSISTANT_REMOTE_LOADER);

  protected readonly component = signal<Type<unknown> | null>(null);

  constructor() {
    this.loadRemoteComponent()
      .then((component) => this.component.set(component))
      .catch((error: unknown) => console.error(error));
  }
}
