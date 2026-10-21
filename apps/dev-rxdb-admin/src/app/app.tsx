import type { EntityType } from '@aiao/rxdb';
import { RxDBProvider, useCount, useRxDB } from '@aiao/rxdb-react';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { findWorkbenchEntity, visibleEntityEntries, type WorkbenchEntityEntry } from './entities/entity-registry';
import setup_rxdb from './rxdb/setup_rxdb';

const db = setup_rxdb();

/**
 * 实体计数徽标：只在本地适配器已连接后挂载查询——查询会触发自动连接，
 * 在空库恢复流程（/backup 先恢复后连接）里提前查询会破坏恢复前置。
 */
function EntityCountBadge({ entry }: { entry: WorkbenchEntityEntry }) {
  const rxdb = useRxDB();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const subscription = rxdb.adapterConnected$('wa-sqlite').subscribe(setConnected);
    return () => subscription.unsubscribe();
  }, [rxdb]);
  if (!connected) return null;
  return <CountValue entry={entry} />;
}

function CountValue({ entry }: { entry: WorkbenchEntityEntry }) {
  const rxdb = useRxDB();
  // 导航条目即来自同一实体注册表，构造上必然命中
  const cls = findWorkbenchEntity(rxdb.config.entities, entry.namespace, entry.name) as EntityType;
  const count = useCount(cls, { where: { combinator: 'and', rules: [] } });
  return <span className='badge badge-ghost badge-xs'>{count.value ?? 0}</span>;
}

/** 左侧导航：工作台可见实体 + 备份 / 恢复入口（实体可见性由 entity-registry 派生）。 */
function AppNav() {
  const rxdb = useRxDB();
  const entries = visibleEntityEntries(rxdb.config.entities);
  return (
    <aside className='bg-base-200 flex h-full w-56 shrink-0 flex-col gap-1 overflow-auto p-3' data-testid='app-nav'>
      <h2 className='menu-title'>实体</h2>
      <nav className='menu w-full' data-testid='entity-catalog'>
        {entries.map(entry => (
          <NavLink
            key={`${entry.namespace}/${entry.name}`}
            to={`/entities/${entry.namespace}/${entry.name}`}
            className={({ isActive }) => (isActive ? 'menu-active' : '')}
            data-testid='entity-nav-link'
          >
            <span className='truncate'>{entry.displayName}</span>
            <EntityCountBadge entry={entry} />
          </NavLink>
        ))}
      </nav>
      <h2 className='menu-title'>数据</h2>
      <nav className='menu w-full'>
        <NavLink
          to='/backup'
          className={({ isActive }) => (isActive ? 'menu-active' : '')}
          data-testid='backup-nav-link'
        >
          备份 / 恢复
        </NavLink>
      </nav>
    </aside>
  );
}

/** 顶栏：应用标题（h1 供 e2e 以标题定位页面）。 */
function AppHeader() {
  return (
    <header className='border-base-300 bg-base-100 flex h-14 shrink-0 items-center border-b px-4'>
      <h1 className='text-lg font-semibold'>模型驱动数据工作台</h1>
    </header>
  );
}

function AppLayout() {
  return (
    <div className='flex size-full' id='layout-main'>
      <AppNav />
      <div className='flex h-full min-w-0 grow flex-col overflow-hidden' id='layout-container'>
        <AppHeader />
        <div id='layout-content' className='flex min-h-0 flex-1 flex-col overflow-auto'>
          <Suspense
            fallback={
              <div
                className='flex h-full items-center justify-center'
                data-testid='loading-fallback'
                aria-label='加载中'
              >
                <span className='loading loading-spinner loading-lg'></span>
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <RxDBProvider db={db}>
      <AppLayout />
    </RxDBProvider>
  );
}
