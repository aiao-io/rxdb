import { inject } from '@angular/core';
import { Router, type CanActivateFn, type Routes } from '@angular/router';
import { AdminAccess } from './admin/admin-access';
import { AuthService } from './auth/auth.service';

const signedIn: CanActivateFn = () => inject(AuthService).session() !== null || inject(Router).parseUrl('/login');
const signedOut: CanActivateFn = () => inject(AuthService).session() === null || inject(Router).parseUrl('/');

/**
 * 管理后台：未登录去登录页；登录了还得经服务端确认是管理员，否则回首页，确认不了也回首页。
 * 放行只是不让人看到一个注定调用失败的页面，权限由 `/api/admin/*` 在服务端判定。
 */
const adminOnly: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const access = inject(AdminAccess);
  const router = inject(Router);
  if (auth.session() === null) return router.parseUrl('/login');
  return (await access.check().catch(() => false)) || router.parseUrl('/');
};

export const appRoutes: Routes = [
  { path: 'login', canActivate: [signedOut], loadComponent: () => import('./pages/login.page') },
  // 独立于工作区外壳：管理后台不需要本地库与设备登记，工作区起不来时它仍可用
  {
    path: 'admin',
    canActivate: [adminOnly],
    title: '管理后台 · 近邻',
    loadComponent: () => import('./pages/admin.page')
  },
  {
    path: '',
    canActivate: [signedIn],
    canActivateChild: [signedIn],
    loadComponent: () => import('./pages/workspace.page'),
    children: [
      { path: '', pathMatch: 'full', title: '文件共享 · 近邻', loadComponent: () => import('./pages/share.page') },
      { path: 'manage', title: '本机管理 · 近邻', loadComponent: () => import('./pages/manage.page') }
    ]
  },
  { path: '**', redirectTo: '' }
];
