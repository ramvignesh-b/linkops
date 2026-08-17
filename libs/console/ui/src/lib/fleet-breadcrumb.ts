import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The back-to-Fleet link every routed Link screen opens with — one copy
 * rather than one per page, so a future change to its wording or styling
 * lands in a single place instead of drifting between them.
 *
 * When `target` is supplied, routes back to a specific target (e.g. back to a
 * Link's detail view from its edit screen) with a custom `label`.
 */
@Component({
  selector: 'lib-fleet-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <nav class="breadcrumb">
      @if (target(); as t) {
        <a [routerLink]="t" class="back-link">{{ label() }}</a>
      } @else {
        <a routerLink="/links" class="back-link">{{ label() }}</a>
      }
    </nav>
  `,
  styles: `
    .breadcrumb {
      margin-bottom: var(--space-1);
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      color: var(--accent);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
    }

    .back-link:hover {
      text-decoration: underline;
    }
  `,
})
export class FleetBreadcrumb {
  readonly target = input<string | readonly string[] | null>(null);
  readonly label = input<string>('← Fleet');
}
