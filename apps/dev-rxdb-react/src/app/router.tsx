import { redirect, type LazyRouteFunction, type RouteObject } from 'react-router-dom';
import AppLayout from './app';
import HomePage from './pages/home';
import TodoPage from './pages/todo';
import setup_rxdb from './rxdb/setup_rxdb_sqlite-wasm';

interface RouteModule {
  default: React.ComponentType;
}

const lazyRoute =
  (importFn: () => Promise<RouteModule>): LazyRouteFunction<RouteObject> =>
  async () => {
    const { default: Component } = await importFn();
    return { Component };
  };

/**
 * 进入 `/search` 之前先把本地适配器连上。
 *
 * rxdb-plugin-search 声明 `inject: ['adapter:local']`（US-015）：宿主要等本地适配器的引导链
 * （迁移、建表、索引）跑完才调 `install()`。搜索页在渲染期**同步**调用 `db.search()`，
 * 深链直接进来时连接尚未建立，首次渲染就会抛「plugin is not installed」。
 *
 * 别的页面不需要这道门：它们的首次查询会经适配器 `ready()` 回到 `connect()`，自然把连接带起来。
 * `setup_rxdb()` 是模块级单例，`connect()` 自带去重，重复进入本路由不会重复连接。
 */
const connectLocalAdapter = async (): Promise<null> => {
  const db = setup_rxdb();
  const adapterName = db.config.sync.local?.adapter;
  if (adapterName === undefined) throw new Error('[demo] sync.local.adapter is not configured');
  await db.connect(adapterName);
  return null;
};

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        // 用 loader 重定向而不是渲染期的 <Navigate>：后者要等首屏渲染完才跳，
        // 会覆盖掉宿主在初始化后下发的深链路径（懒加载路由尤其跑不过它）。
        // 与 Vue / Angular 的配置级 redirect 对齐。
        index: true,
        loader: () => redirect('/home')
      },
      {
        path: 'home',
        element: <HomePage />
      },
      {
        path: 'todo',
        element: <TodoPage />
      },
      {
        path: 'todo-cursor',
        lazy: lazyRoute(() => import('./pages/todo-cursor'))
      },
      {
        path: 'workspace',
        lazy: lazyRoute(() => import('./pages/workspace'))
      },
      {
        path: 'menu-simple',
        lazy: lazyRoute(() => import('./pages/menu/tree-menu-simple'))
      },
      {
        path: 'menu-virtual',
        lazy: lazyRoute(() => import('./pages/menu/tree-menu-virtual'))
      },
      {
        path: 'menu-lazy',
        lazy: lazyRoute(() => import('./pages/menu/tree-menu-lazy'))
      },
      {
        path: 'file-manager-simple',
        lazy: lazyRoute(() => import('./pages/file-manager/file-manager-simple'))
      },
      {
        path: 'file-manager-virtual',
        lazy: lazyRoute(() => import('./pages/file-manager/file-manager-virtual'))
      },
      {
        path: 'file-manager-lazy',
        lazy: lazyRoute(() => import('./pages/file-manager/file-manager-lazy'))
      },
      {
        path: 'file-manager',
        loader: () => redirect('/file-manager-simple')
      },
      {
        path: 'branch-manager',
        lazy: lazyRoute(() => import('./pages/branch-manager'))
      },
      {
        path: 'ag-grid',
        lazy: lazyRoute(() => import('./pages/ag-grid'))
      },
      {
        path: 'code-editor',
        lazy: lazyRoute(() => import('./pages/code-editor'))
      },
      {
        path: 'generator',
        lazy: lazyRoute(() => import('./pages/generator'))
      },
      {
        path: 'search',
        loader: connectLocalAdapter,
        lazy: lazyRoute(() => import('./pages/search'))
      },
      {
        path: 'storage/*',
        lazy: lazyRoute(() => import('./pages/storage'))
      },
      {
        path: 'opfs/*',
        lazy: lazyRoute(() => import('./pages/opfs/opfs'))
      },
      {
        path: 'remote-cache',
        lazy: lazyRoute(() => import('./pages/remote-cache'))
      },
      {
        path: 'encrypted',
        lazy: lazyRoute(() => import('./pages/encrypted'))
      }
    ]
  }
];
