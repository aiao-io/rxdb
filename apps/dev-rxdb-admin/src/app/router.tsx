import { redirect, type LazyRouteFunction, type RouteObject } from 'react-router-dom';
import AppLayout from './app';

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
      { path: 'backup', lazy: lazyRoute(() => import('./pages/backup-page')) }
    ]
  }
];
