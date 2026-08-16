import { Route } from '@angular/router';

/**
 * 应用路由表。
 *
 * @remarks
 * 每条可导航路由都必须在 `AppMenu.menus` 里有对应入口 —— Tauri 窗口默认
 * 没有地址栏，没有菜单项的页面在桌面端等于不存在。
 */
export const appRoutes: Route[] = [
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page')
  },
  {
    path: 'storage',
    loadComponent: () => import('./pages/storage/storage.page')
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
