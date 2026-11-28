import type { Routes } from '@angular/router';
import LoginPage from './pages/login-page';
import { requireLogin } from './shell/auth-gate';
export const routes: Routes = [
  // 登录页在后台外壳之外；其余页面都要先登录（外壳路由的 canActivateChild 是全站登录门禁）。
  // 登录页随入口一起加载、不拆分包：登录成功后整页载入目标地址（ADMIN-US-222），那次页面加载不会再取登录页；
  // 协作的离线外壳只缓存本次页面加载取过的资源，离线时缓存授权过期要打得开登录页（C01）
  { path: 'login', component: LoginPage },
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
