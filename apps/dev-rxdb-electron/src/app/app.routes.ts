import { Route } from '@angular/router';

/**
 * 应用路由表。
 *
 * 末尾的 `**` 通配兜底到 `home` 是 Electron 下的硬要求：产物由 `file:` 协议加载，
 * 首帧 URL 是 `index.html` 本身而不是 `/home`，没有这条兜底会直接白屏。
 */
export const appRoutes: Route[] = [
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page')
  },
  {
    path: 'todo',
    loadComponent: () => import('@modules/angular-todo/todo-page')
  },
  {
    path: 'todo-cursor',
    loadComponent: () => import('@modules/angular-todo/todo-cursor-page')
  },
  {
    path: '**',
    redirectTo: 'home',
    pathMatch: 'full'
  }
];
