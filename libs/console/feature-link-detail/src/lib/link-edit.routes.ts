import type { Routes } from '@angular/router';
import { LinkEditPage } from './link-edit-page';

/**
 * Mounted at `/links/:id/edit` by the application, as its own top-level
 * route rather than a child of `linkDetailRoutes` — a path-bearing child
 * route does not inherit an ancestor's params by default, and `LinkEditPage`
 * needs `:id` bound directly the same way `LinkDetailPage` does.
 */
export const linkEditRoutes: Routes = [
  { path: '', component: LinkEditPage, title: 'Edit Link — LinkOps' },
];
