import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { A2uiButton, type A2uiInternalAction } from './a2ui-button';
import { A2uiCard } from './a2ui-card';
import { A2uiFallback } from './a2ui-fallback';
import { A2uiMetric } from './a2ui-metric';
import type { A2uiRenderNode } from './render-tree';
import { A2uiSelect } from './a2ui-select';
import { A2uiSurfaceNode } from './a2ui-surface-node';
import { A2uiText } from './a2ui-text';

/**
 * One node of the walked tree, dispatched to the component that owns its
 * type — the whitelist, rendered as a `@switch` rather than a runtime `Map`,
 * because `render-tree.ts` has already turned "not one of the six" into a
 * `fallback` node by the time this component ever sees it. `@default` exists
 * only as the exhaustiveness backstop TypeScript's `A2uiComponentType` union
 * cannot itself guarantee at the template layer.
 *
 * Recursive, but only ever self-referential: `Surface` and `Card` project
 * their children through `<ng-content>` rather than importing this component
 * back, which is what lets this file import the six leaves without a cycle.
 * `write`/`action` bubble straight through every level to whoever composed
 * the root.
 */
@Component({
  selector: 'lib-a2ui-node',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    A2uiNode,
    A2uiFallback,
    A2uiSurfaceNode,
    A2uiCard,
    A2uiText,
    A2uiButton,
    A2uiSelect,
    A2uiMetric,
  ],
  template: `
    @if (node(); as n) {
      @if (n.kind === 'fallback') {
        <lib-a2ui-fallback [label]="n.label" />
      } @else {
        @switch (n.type) {
          @case ('Surface') {
            <lib-a2ui-surface-node [node]="n">
              @for (child of n.children; track $index) {
                <lib-a2ui-node
                  [node]="child"
                  [dataModel]="dataModel()"
                  (write)="write.emit($event)"
                  (action)="action.emit($event)"
                />
              }
            </lib-a2ui-surface-node>
          }
          @case ('Card') {
            <lib-a2ui-card [node]="n">
              @for (child of n.children; track $index) {
                <lib-a2ui-node
                  [node]="child"
                  [dataModel]="dataModel()"
                  (write)="write.emit($event)"
                  (action)="action.emit($event)"
                />
              }
            </lib-a2ui-card>
          }
          @case ('Text') {
            <lib-a2ui-text [node]="n" [dataModel]="dataModel()" />
          }
          @case ('Button') {
            <lib-a2ui-button [node]="n" (action)="action.emit($event)" />
          }
          @case ('Select') {
            <lib-a2ui-select
              [node]="n"
              [dataModel]="dataModel()"
              (write)="write.emit($event)"
            />
          }
          @case ('Metric') {
            <lib-a2ui-metric [node]="n" [dataModel]="dataModel()" />
          }
          @default {
            <lib-a2ui-fallback label="Unknown component" />
          }
        }
      }
    }
  `,
})
export class A2uiNode {
  readonly node = input.required<A2uiRenderNode>();
  readonly dataModel = input.required<Record<string, unknown>>();
  readonly write = output<{ path: string; value: unknown }>();
  readonly action = output<A2uiInternalAction>();
}
