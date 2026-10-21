import { RxDBProvider, useRxDB } from '@aiao/rxdb-react';
import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { visibleEntityEntries } from './entities/entity-registry';
import setup_rxdb from './rxdb/setup_rxdb';

const db = setup_rxdb();

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
            {entry.displayName}
          </NavLink>
        ))}
      </nav>
      <h2 className='menu-title'>数据</h2>
      <nav className='menu w-full'>
        <NavLink to='/backup' className={({ isActive }) => (isActive ? 'menu-active' : '')} data-testid='backup-nav-link'>
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
