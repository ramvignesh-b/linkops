import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { A2uiAction } from '@linkops/shared/a2ui-protocol';
import { asText } from './a2ui-binding';
import type { A2uiOkNode } from './render-tree';

/**
 * `Button`'s own renderer: a label, and the one Action a Surface can raise.
 * `action` is emitted exactly as the Surface wrote it — a Button's own
 * `context` bindings are resolved by whoever sends the Action onward, not by
 * this renderer, which injects nothing and knows nothing about a round trip.
 */
@Component({
  selector: 'lib-a2ui-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="a2ui-button" (click)="onClick()">
      {{ label() }}
    </button>
  `,
  styles: `
    button {
      align-self: flex-start;
      padding: var(--space-2) var(--space-3);
      background: var(--accent);
      color: var(--text-on-accent);
      border: none;
      border-radius: var(--radius);
      font-family: var(--font-family-body);
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
    }
  `,
})
export class A2uiButton {
  readonly node = input.required<A2uiOkNode>();
  readonly action = output<A2uiAction>();

  protected readonly label = computed(() =>
    asText(this.node().definition['label']),
  );

  protected onClick(): void {
    const action = this.node().definition.action;

    if (action !== undefined) {
      this.action.emit(action);
    }
  }
}
