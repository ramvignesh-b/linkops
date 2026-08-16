import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { asText, resolveBinding } from './a2ui-binding';
import type { A2uiOkNode } from './render-tree';

/**
 * `Text`'s own renderer. `text` is either a literal string or a Data Model
 * binding, resolved by `resolveBinding` either way. It reaches the DOM by
 * interpolation only — no `[innerHTML]`, no `bypassSecurityTrust*`, no
 * `DomSanitizer` import anywhere in this library. That absence is the
 * safety property, not a review habit: markdown and any other rich text
 * `Text` might one day carry is deliberately unimplemented for the same
 * reason, per the README's conformance table.
 */
@Component({
  selector: 'lib-a2ui-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="a2ui-text">{{ text() }}</p>`,
  styles: `
    p {
      margin: 0;
      color: var(--text-primary);
    }
  `,
})
export class A2uiText {
  readonly node = input.required<A2uiOkNode>();
  readonly dataModel = input.required<Record<string, unknown>>();

  protected readonly text = computed(() =>
    asText(resolveBinding(this.node().definition['text'], this.dataModel())),
  );
}
