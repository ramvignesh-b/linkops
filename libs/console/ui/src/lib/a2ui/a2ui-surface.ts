import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {
  writePointer,
  type A2uiActionRequest,
  type A2uiCreateSurface,
} from '@linkops/shared/a2ui-protocol';
import { A2uiNode } from './a2ui-node';
import type { A2uiInternalAction } from './a2ui-button';
import { buildA2uiTree } from './render-tree';

/**
 * The renderer's whole public surface: a validated Surface in, one Action
 * out. It injects nothing — no `HttpClient`, no store, no router — which is
 * what makes it safe to hand a document from an untrusted origin: nothing it
 * can reach beyond the DOM it draws.
 *
 * Its input type is `A2uiCreateSurface`, not `unknown` or an envelope that
 * might fail — the wire's own schema already ran in `console/data-access`
 * before this component ever receives one, so there is no defensive parsing
 * to do here. Everything below this component — the whitelist, the two caps,
 * cycle detection, the pointer guard — degrades a broken or hostile branch to
 * a labelled fallback rather than ever throwing.
 */
@Component({
  selector: 'lib-a2ui-surface',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A2uiNode],
  template: `
    <lib-a2ui-node
      [node]="tree()"
      [dataModel]="dataModel()"
      (write)="onWrite($event)"
      (action)="onAction($event)"
    />
  `,
})
export class A2uiSurface {
  readonly surface = input.required<A2uiCreateSurface>();
  readonly action = output<A2uiActionRequest>();

  /**
   * The Data Model, as this render owns it: seeded from the Surface and
   * mutated only through the guarded write path, whether the write came from
   * an operator's Select or — were `updateDataModel` ever handled here — the
   * Assistant itself. One document, one writer.
   *
   * `linkedSignal` rather than a plain `signal` set from the constructor:
   * reading a required input synchronously in a constructor is a compiler
   * error (NG8118), and a `linkedSignal` is exactly this shape already — a
   * writable signal seeded from another one, that stays writable afterwards.
   */
  protected readonly dataModel = linkedSignal<Record<string, unknown>>(
    () => this.surface().dataModel ?? {},
  );

  /** The root is always the first component in the list — A2UI leaves it implicit. */
  protected readonly tree = computed(() =>
    buildA2uiTree(this.surface().components, this.surface().components[0].id),
  );

  protected onWrite(write: { path: string; value: unknown }): void {
    this.dataModel.update((current) =>
      writePointer(current, write.path, write.value),
    );
  }

  protected onAction(internalAction: A2uiInternalAction): void {
    this.action.emit({
      kind: 'act',
      surfaceId: this.surface().surfaceId,
      componentId: internalAction.componentId,
      event: internalAction.event.name,
      data: this.dataModel(),
    });
  }
}
