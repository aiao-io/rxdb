import { useI18n } from '@aiao/rxdb-i18n-react';
import { useRouteError, type LazyRouteFunction, type RouteObject } from 'react-router-dom';
import AppLayout from './app';
import setup_rxdb from './rxdb/setup_rxdb';
import { requireLogin } from './shell/auth-gate';

interface RouteModule {
  default: React.ComponentType;
}

/** 搜索页 loader 失败（如本地适配器连不上）时的可读失败态，避免白屏。 */
function SearchLoadError() {
  const { t } = useI18n();
  const error = useRouteError();
  return (
    <div className='page-host items-center justify-center gap-2 p-8' data-testid='search-load-failed' role='alert'>
      <span className='text-error font-semibold'>{t('app.loadFailed')}</span>
      <span>{error instanceof Error ? error.message : t('app.searchLoadFailed')}</span>
    </div>
  );
}

/**
 * 首次进入时，登录门禁（布局路由的 loader）与懒加载页面就绪之前不渲染任何内容：未登录的人不会先看到后台外壳，
 * 与 Angular（阻塞式首次导航）、Vue（首次导航结束后才挂载）一致。
 */
function InitialLoad() {
  return null;
}

const lazyRoute =
  (importFn: () => Promise<RouteModule>): LazyRouteFunction<RouteObject> =>
  async () => {
    const { default: Component } = await importFn();
    return { Component };
  };

export const routes: RouteObject[] = [
  // 登录页在后台外壳之外；其余页面都要先登录（布局路由的 loader 是全站登录门禁）
  { path: '/login', lazy: lazyRoute(() => import('./pages/login-page')) },
  {
    path: '/',
    element: <AppLayout />,
    HydrateFallback: InitialLoad,
    loader: requireLogin,
    children: [
      { index: true, lazy: lazyRoute(() => import('./pages/start-page')) },
      { path: 'dashboard', lazy: lazyRoute(() => import('./pages/dashboard-page')) },
      {
        path: 'entities',
        lazy: lazyRoute(() => import('./pages/entity-shell')),
        children: [{ path: ':namespace/:name', lazy: lazyRoute(() => import('./pages/entity-list-page')) }]
      },
      {
        path: 'search',
        lazy: lazyRoute(() => import('./pages/search-page')),
        errorElement: <SearchLoadError />,
        loader: async (): Promise<null> => {
          // search 插件声明 inject: ['adapter:local']，渲染期同步调用 db.search()
          // 需要本地适配器先连上（深链直进时连接尚未建立会抛 plugin is not installed）
          const db = setup_rxdb();
          const adapterName = db.config.sync.local?.adapter;
          if (adapterName) await db.connect(adapterName);
          return null;
        }
      },
      { path: 'collaboration', lazy: lazyRoute(() => import('./pages/collaboration-page')) },
      { path: 'backup', lazy: lazyRoute(() => import('./pages/backup-page')) }
    ]
  }
];
