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
];
