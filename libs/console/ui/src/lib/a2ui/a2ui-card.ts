import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { asText } from './a2ui-binding';
import type { A2uiOkNode } from './render-tree';

/**
 * `Card`'s own renderer: an optional title over its children, which
 * `A2uiNode` projects through `<ng-content>` — the same reason
 * `A2uiSurfaceNode` does not import it back.
 */
@Component({
  selector: 'lib-a2ui-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="a2ui-card">
      @if (title(); as title) {
        <h3>{{ title }}</h3>
      }
      <div class="a2ui-card-body">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .a2ui-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-3);
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }

    h3 {
      margin: 0;
      font-family: var(--font-family-heading);
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-strong);
    }

    .a2ui-card-body {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
  `,
})
export class A2uiCard {
  readonly node = input.required<A2uiOkNode>();

  /** `title` is a literal, never a Data Model binding — it names the Surface, not a reading. */
  protected readonly title = computed(() => {
    const value = asText(this.node().definition['title']);

    return value === '' ? null : value;
  });
}
