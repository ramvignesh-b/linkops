import type { Routes } from '@angular/router';
import { FleetPage } from './fleet-page';
import { LinkCreatePage } from './link-create-page';

/**
 * Mounted at `/links` by the application, and lazy-loaded there. `new` is a
 * literal segment ahead of `feature-link-detail`'s `links/:id` in the
 * application's route table, so a Link id can never collide with it.
 */
export const fleetRoutes: Routes = [
  { path: '', component: FleetPage, title: 'Fleet — LinkOps' },
  { path: 'new', component: LinkCreatePage, title: 'New Link — LinkOps' },
];
