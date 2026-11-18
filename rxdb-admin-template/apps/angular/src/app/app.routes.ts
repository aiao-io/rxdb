import type { Routes } from '@angular/router';
import { requireLogin } from './shell/auth-gate';
export const routes: Routes = [
  // 登录页在后台外壳之外；其余页面都要先登录（外壳路由的 canActivateChild 是全站登录门禁）
  { path: 'login', loadComponent: () => import('./pages/login-page') },
  {
    path: '',
    canActivateChild: [requireLogin],
    children: [
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
    ]
  }
];
