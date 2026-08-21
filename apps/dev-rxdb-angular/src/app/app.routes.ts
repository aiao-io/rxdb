import { RxDB } from '@aiao/rxdb';
import { inject } from '@angular/core';
import { CanActivateFn, Route, UrlMatcher, UrlSegment } from '@angular/router';

/**
 * 进入 `/search` 之前先把本地适配器连上。
 *
 * @remarks
 * rxdb-plugin-search 声明 `inject: ['adapter:local']`（US-015）：宿主要等本地适配器的引导链
 * （迁移、建表、索引）跑完才调 `install()`。搜索页在字段初始化里**同步**调用 `db.search()`，
 * 深链直接进来时连接尚未建立，组件构造就会抛「plugin is not installed」。
 *
 * 别的页面不需要这道门：它们的首次查询会经适配器 `ready()` 回到 `connect()`，自然把连接带起来。
 * `connect()` 自带去重，重复进入本路由不会重复连接。
 */
const connectLocalAdapter: CanActivateFn = async () => {
  const db = inject(RxDB);
  const adapterName = db.config.sync.local?.adapter;
  if (adapterName === undefined) throw new Error('[demo] sync.local.adapter is not configured');
  await db.connect(adapterName);
  return true;
};

const opfsMatcher: UrlMatcher = (segments: UrlSegment[]) => {
  if (!segments.length || segments[0].path !== 'opfs') return null;

  const rest = segments
    .slice(1)
    .map(s => decodeURIComponent(s.path))
    .join('/');
  const opfsPath = rest ? `/${rest}/` : '/';

  return {
    consumed: segments,
    posParams: { opfsPath: new UrlSegment(opfsPath, {}) }
  };
};

const storageMatcher: UrlMatcher = (segments: UrlSegment[]) => {
  if (!segments.length || segments[0].path !== 'storage') return null;

  const rest = segments
    .slice(1)
    .map(s => decodeURIComponent(s.path))
    .join('/');
  const storagePath = rest ? `/${rest}/` : '/';

  return {
    consumed: segments,
    posParams: { storagePath: new UrlSegment(storagePath, {}) }
  };
};

export const appRoutes: Route[] = [
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home.page')
  },
  {
    path: 'search',
    canActivate: [connectLocalAdapter],
    loadComponent: () => import('./pages/search/search.page')
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
    path: 'workspace',
    loadComponent: () => import('./pages/workspace/workspace.page')
  },
  {
    path: 'menu-simple',
    loadComponent: () => import('./pages/menu/tree-menu-simple/tree-menu-simple.page')
  },
  {
    path: 'menu-virtual',
    loadComponent: () => import('./pages/menu/tree-menu-virtual/tree-menu-virtual.page')
  },
  {
    path: 'menu-lazy',
    loadComponent: () => import('./pages/menu/tree-menu-lazy/tree-menu-lazy.page')
  },
  {
    path: 'ag-grid',
    loadComponent: () => import('./pages/ag-grid/ag-grid.page')
  },
  {
    path: 'code-editor',
    loadComponent: () => import('./pages/code-editor/code-editor.page')
  },
  {
    path: 'generator',
    loadComponent: () => import('./pages/generator/generator.page')
  },
  {
    path: 'file-manager-simple',
    loadComponent: () => import('./pages/file-manager/file-manager-simple/file-manager-simple.page')
  },
  {
    path: 'file-manager-virtual',
    loadComponent: () => import('./pages/file-manager/file-manager-virtual/file-manager-virtual.page')
  },
  {
    path: 'file-manager-lazy',
    loadComponent: () => import('./pages/file-manager/file-manager-lazy/file-manager-lazy.page')
  },
  {
    path: 'file-manager',
    redirectTo: 'file-manager-simple',
    pathMatch: 'full'
  },
  {
    path: 'branch-manager',
    loadComponent: () => import('./pages/branch-manager/branch-manager.page')
  },
  {
    matcher: storageMatcher,
    loadComponent: () => import('./pages/storage/storage.page')
  },
  {
    path: 'remote-cache',
    loadComponent: () => import('./pages/remote-cache/remote-cache.page')
  },
  {
    matcher: opfsMatcher,
    loadComponent: () => import('./pages/opfs/opfs.page')
  },
  {
    path: 'encrypted',
    loadComponent: () => import('./pages/encrypted/encrypted.page')
  },
  {
    path: '**',
    redirectTo: 'home',
    pathMatch: 'full'
  }
];
