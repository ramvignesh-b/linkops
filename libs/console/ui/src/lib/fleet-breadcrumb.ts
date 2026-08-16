import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The back-to-Fleet link every routed Link screen opens with — one copy
 * rather than one per page, so a future change to its wording or styling
 * lands in a single place instead of drifting between them.
 */
@Component({
  selector: 'lib-fleet-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <nav class="breadcrumb">
      <a routerLink="/links" class="back-link">← Fleet</a>
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
export class FleetBreadcrumb {}
