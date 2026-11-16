import type { Routes } from '@angular/router';
export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./pages/start-page') },
  { path: 'dashboard', loadComponent: () => import('./pages/dashboard-page') },
  {
    path: 'entities',
    loadComponent: () => import('./pages/entity-shell'),
    children: [{ path: ':namespace/:name', loadComponent: () => import('./pages/entity-list-page') }]
  },
  { path: 'search', loadComponent: () => import('./pages/search-page') },
  { path: 'collaboration', loadComponent: () => import('./pages/collaboration-page') },
  { path: 'backup', loadComponent: () => import('./pages/backup-page') }
];
