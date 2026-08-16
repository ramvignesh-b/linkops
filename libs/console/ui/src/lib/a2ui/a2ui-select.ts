import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { A2UI_MAX_COMPONENTS } from '@linkops/shared/a2ui-protocol';
import { asText, bindingPathOf, resolveBinding } from './a2ui-binding';
import type { A2uiOkNode } from './render-tree';

interface A2uiOption {
  value: string;
  label: string;
}

/**
 * `options` is always literal, never bound — a defensive parse, since a
 * hostile payload can set it to anything. Capped at `A2UI_MAX_COMPONENTS`:
 * `options` sits inside one already-whitelisted `Select`, so it is never
 * counted by `render-tree.ts`'s own budget, and a literal array is exactly
 * as capable of forcing an unbounded DOM as a wide `children` list is — the
 * same reason that one is capped, reused here rather than a second number.
 */
function asOptions(raw: unknown): A2uiOption[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (option): option is A2uiOption =>
        typeof option === 'object' &&
        option !== null &&
        typeof (option as Record<string, unknown>)['value'] === 'string' &&
        typeof (option as Record<string, unknown>)['label'] === 'string',
    )
    .slice(0, A2UI_MAX_COMPONENTS);
}

/**
 * `Select`'s own renderer: a literal `label` and `options`, and a `value`
 * bound to the Data Model — read through `resolveBinding` and written back
 * through the guarded `write` output, never by indexing the Data Model
 * directly. `name` is the component's own id, which is how the panel's
 * tests find one Select among several without depending on rendered order.
 */
@Component({
  selector: 'lib-a2ui-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="a2ui-select">
      @if (label(); as label) {
        <span>{{ label }}</span>
      }
      <select [name]="node().id" [value]="value()" (change)="onChange($event)">
        @for (option of options(); track option.value) {
          <option [value]="option.value">{{ option.label }}</option>
        }
      </select>
    </label>
  `,
  styles: `
    .a2ui-select {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      font-size: var(--font-size-small);
      color: var(--text-muted);
    }

    select {
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-family: var(--font-family-body);
      font-size: var(--font-size-body);
      color: var(--text-primary);
    }
  `,
})
export class A2uiSelect {
  readonly node = input.required<A2uiOkNode>();
  readonly dataModel = input.required<Record<string, unknown>>();
  readonly write = output<{ path: string; value: unknown }>();

  protected readonly label = computed(() => {
    const value = asText(this.node().definition['label']);

    return value === '' ? null : value;
  });

  protected readonly options = computed(() =>
    asOptions(this.node().definition['options']),
  );

  protected readonly value = computed(() =>
    asText(resolveBinding(this.node().definition['value'], this.dataModel())),
  );

  protected onChange(event: Event): void {
    const path = bindingPathOf(this.node().definition['value']);
    if (path === null) return;

    this.write.emit({ path, value: (event.target as HTMLSelectElement).value });
  }
}
