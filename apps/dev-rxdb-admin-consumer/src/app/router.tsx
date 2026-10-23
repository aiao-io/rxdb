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
      { index: true, loader: () => redirect('/bookmarks') },
      { path: 'bookmarks', lazy: lazyRoute(() => import('./pages/bookmarks')) }
    ]
  }
];
