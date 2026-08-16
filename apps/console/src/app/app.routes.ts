import { type Route } from '@angular/router';

/**
 * One lazy chunk per feature library, which is also what keeps a feature area
 * shaped for being packaged separately without packaging it.
 */
export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'links' },
  {
    path: 'links',
    loadChildren: () =>
      import('@linkops/console/feature-fleet').then((m) => m.fleetRoutes),
  },
  // Ahead of `links/:id`: a literal `edit` segment its own top-level route
  // rather than a child of it, so `:id` binds directly (see
  // `linkEditRoutes`'s own comment for why a child route can't).
  {
    path: 'links/:id/edit',
    loadChildren: () =>
      import('@linkops/console/feature-link-detail').then(
        (m) => m.linkEditRoutes,
      ),
  },
  {
    path: 'links/:id',
    loadChildren: () =>
      import('@linkops/console/feature-link-detail').then(
        (m) => m.linkDetailRoutes,
      ),
  },
];
