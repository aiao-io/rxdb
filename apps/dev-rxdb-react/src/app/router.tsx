import { Navigate, type LazyRouteFunction, type RouteObject } from 'react-router-dom';
import AppLayout from './app';
import HomePage from './pages/home';
import TodoPage from './pages/todo';

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
      {
        index: true,
        element: <Navigate to='home' replace />
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
        element: <Navigate to='file-manager-simple' replace />
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
