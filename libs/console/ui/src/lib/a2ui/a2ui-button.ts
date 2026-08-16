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
 * An action as it bubbles inside the renderer: the raw `A2uiAction` plus the
 * `componentId` of the Button that raised it. `A2uiSurface` reads the id to
 * build the full request shape the endpoint expects; no component below it
 * needs the id, so it travels up rather than being threaded down.
 */
export interface A2uiInternalAction extends A2uiAction {
  componentId: string;
}

/**
 * `Button`'s own renderer: a label, and the one Action a Surface can raise.
 * `action` is emitted with the component's own id so `A2uiSurface` can
 * assemble the full request shape — the Button itself injects nothing and
 * knows nothing about a round trip.
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
  readonly action = output<A2uiInternalAction>();

  protected readonly label = computed(() =>
    asText(this.node().definition['label']),
  );

  protected onClick(): void {
    const action = this.node().definition.action;

    if (action !== undefined) {
      this.action.emit({ ...action, componentId: this.node().id });
    }
  }
}
