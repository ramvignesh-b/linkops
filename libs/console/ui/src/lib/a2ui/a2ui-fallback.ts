import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * What a broken or hostile subtree renders as, in its own place, instead of
 * the component that was asked for: a labelled placeholder that never
 * throws. A degraded subtree looks deliberate rather than broken, and the
 * Surface around it renders exactly as if this one component were absent.
 */
@Component({
  selector: 'lib-a2ui-fallback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="a2ui-fallback">{{ label() }}</p>`,
  styles: `
    p {
      margin: 0;
      padding: var(--space-2);
      border: 1px dashed var(--border);
      border-radius: var(--radius);
      color: var(--text-muted);
      font-size: var(--font-size-small);
    }
  `,
})
export class A2uiFallback {
  readonly label = input.required<string>();
}
