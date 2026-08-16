import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { asText, resolveBinding } from './a2ui-binding';
import type { A2uiOkNode } from './render-tree';

/**
 * `Metric`'s own renderer: a labelled reading, the readings a recommendation
 * rests on. `value` may be literal or bound the same way `Text`'s is.
 */
@Component({
  selector: 'lib-a2ui-metric',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="a2ui-metric">
      <span class="a2ui-metric-label">{{ label() }}</span>
      <span class="a2ui-metric-value">{{ value() }}</span>
    </div>
  `,
  styles: `
    .a2ui-metric {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .a2ui-metric-label {
      font-size: var(--font-size-small);
      color: var(--text-muted);
    }

    .a2ui-metric-value {
      font-family: var(--font-family-mono);
      font-size: var(--font-size-body);
      font-weight: var(--font-weight-strong);
    }
  `,
})
export class A2uiMetric {
  readonly node = input.required<A2uiOkNode>();
  readonly dataModel = input.required<Record<string, unknown>>();

  protected readonly label = computed(() =>
    asText(this.node().definition['label']),
  );

  protected readonly value = computed(() => {
    const resolved = resolveBinding(
      this.node().definition['value'],
      this.dataModel(),
    );

    return typeof resolved === 'number' ? String(resolved) : asText(resolved);
  });
}
