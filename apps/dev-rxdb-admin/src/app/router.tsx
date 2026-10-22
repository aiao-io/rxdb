import { redirect, type LazyRouteFunction, type RouteObject } from 'react-router-dom';
import AppLayout from './app';
import setup_rxdb from './rxdb/setup_rxdb';

interface RouteModule {
  default: React.ComponentType;
}

const lazyRoute =
  (importFn: () => Promise<RouteModule>): LazyRouteFunction<RouteObject> =>
  async () => {
    const { default: Component } = await importFn();
    return { Component };
  };

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, loader: () => redirect('/entities') },
      {
        path: 'entities',
        lazy: lazyRoute(() => import('./pages/entity-shell')),
        children: [{ path: ':namespace/:name', lazy: lazyRoute(() => import('./pages/entity-list-page')) }]
      },
      {
        path: 'search',
        lazy: lazyRoute(() => import('./pages/search-page')),
        loader: async (): Promise<null> => {
          // search 插件声明 inject: ['adapter:local']，渲染期同步调用 db.search()
          // 需要本地适配器先连上（深链直进时连接尚未建立会抛 plugin is not installed）
          const db = setup_rxdb();
          const adapterName = db.config.sync.local?.adapter;
          if (adapterName) await db.connect(adapterName);
          return null;
        }
      },
      { path: 'backup', lazy: lazyRoute(() => import('./pages/backup-page')) }
    ]
  }
];
