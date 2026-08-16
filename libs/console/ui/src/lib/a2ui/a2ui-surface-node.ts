import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { A2uiOkNode } from './render-tree';

/**
 * The `Surface` type's own renderer — the root wraps every Surface's
 * components, so this is what actually draws that wrapper. A plain
 * container: no title of its own, its children projected through
 * `<ng-content>` by `A2uiNode`, which is what keeps this file from having to
 * import the very component that renders it.
 */
@Component({
  selector: 'lib-a2ui-surface-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="a2ui-panel">
      <ng-content />
    </div>
  `,
  styles: `
    .a2ui-panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
  `,
})
export class A2uiSurfaceNode {
  readonly node = input.required<A2uiOkNode>();
}
