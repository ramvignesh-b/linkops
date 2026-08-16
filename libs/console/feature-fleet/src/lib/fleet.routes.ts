import type { Routes } from '@angular/router';
import { FleetPage } from './fleet-page';

/** Mounted at `/links` by the application, and lazy-loaded there. */
export const fleetRoutes: Routes = [
  { path: '', component: FleetPage, title: 'Fleet — LinkOps' },
];
