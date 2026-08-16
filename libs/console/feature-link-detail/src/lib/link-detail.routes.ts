import type { Routes } from '@angular/router';
import { LinkDetailPage } from './link-detail-page';

/** Mounted at `/links/:id` by the application, and lazy-loaded there. */
export const linkDetailRoutes: Routes = [
  { path: '', component: LinkDetailPage, title: 'Link Detail — LinkOps' },
];
