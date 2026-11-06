import { useI18n } from '@aiao/rxdb-i18n-react';
import { useRouteError, type LazyRouteFunction, type RouteObject } from 'react-router-dom';
import AppLayout from './app';
import setup_rxdb from './rxdb/setup_rxdb';

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
      { index: true, lazy: lazyRoute(() => import('./pages/start-page')) },
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
      { path: 'backup', lazy: lazyRoute(() => import('./pages/backup-page')) }
    ]
  }
];
