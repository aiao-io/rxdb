import type { EntityType } from '@aiao/rxdb';
import { RxDBProvider, useCount, useRxDB } from '@aiao/rxdb-react';
import { ArchiveRestore, Boxes, Database, PanelLeftClose, PanelLeftDashed, Search, Tags, Wrench } from 'lucide-react';
import { Suspense, useEffect, useState, type JSX } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { findWorkbenchEntity, visibleEntityEntries, type WorkbenchEntityEntry } from './entities/entity-registry';
import setup_rxdb from './rxdb/setup_rxdb';

const db = setup_rxdb();

/** 实体图标（按实体名映射，未知实体用通用盒子图标）。 */
const ENTITY_ICONS: Record<string, JSX.Element> = {
  Asset: <Boxes size={16} />,
  AssetCategory: <Tags size={16} />,
  AssetEvent: <Wrench size={16} />
};

/**
 * 实体计数徽标：只在本地适配器已连接后挂载查询——查询会触发自动连接，
 * 在空库恢复流程（/backup 先恢复后连接）里提前查询会破坏恢复前置。
 */
function EntityCountBadge({ entry }: { entry: WorkbenchEntityEntry }) {
  const rxdb = useRxDB();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const subscription = rxdb.adapterConnected$('sqlite-wasm').subscribe(setConnected);
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
function AppSidebar({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  const rxdb = useRxDB();
  const entries = visibleEntityEntries(rxdb.config.entities);
  return (
    <aside className='app-sidebar' id='app-navigation' data-testid='app-nav'>
      <div className='bg-base-300 flex h-10 min-h-10 items-center justify-between p-1'>
        <button
          className='btn btn-ghost btn-sm hover:border-transparent hover:bg-transparent'
          onClick={onToggle}
          type='button'
          aria-label='工作台'
        >
          <Database size={16} />
          <span className='sidebar-label'>工作台</span>
        </button>
        <button className='btn btn-ghost btn-sm' onClick={onToggle} type='button' aria-label='sidebar toggle'>
          {pinned ?
            <PanelLeftClose size={16} />
          : <PanelLeftDashed size={16} />}
        </button>
      </div>
      <nav className='bg-base-200 flex-1 overflow-y-auto p-1'>
        <ul className='menu bg-base-200 rounded-box w-full p-1' data-testid='entity-catalog'>
          <li className='menu-title'>
            <span className='sidebar-label'>实体</span>
          </li>
          {entries.map(entry => (
            <li key={`${entry.namespace}/${entry.name}`}>
              <NavLink
                to={`/entities/${entry.namespace}/${entry.name}`}
                className={({ isActive }) => (isActive ? 'menu-active' : '')}
                data-testid='entity-nav-link'
              >
                {ENTITY_ICONS[entry.name] ?? <Boxes size={16} />}
                <span className='sidebar-label'>{entry.displayName}</span>
                {pinned && <EntityCountBadge entry={entry} />}
              </NavLink>
            </li>
          ))}
          <li className='menu-title'>
            <span className='sidebar-label'>数据</span>
          </li>
          <li>
            <NavLink
              to='/search'
              className={({ isActive }) => (isActive ? 'menu-active' : '')}
              data-testid='search-nav-link'
            >
              <Search size={16} />
              <span className='sidebar-label'>搜索</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to='/backup'
              className={({ isActive }) => (isActive ? 'menu-active' : '')}
              data-testid='backup-nav-link'
            >
              <ArchiveRestore size={16} />
              <span className='sidebar-label'>备份 / 恢复</span>
            </NavLink>
          </li>
        </ul>
      </nav>
    </aside>
  );
}

/** 顶栏：导航切换与应用标题。 */
function AppHeader({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <header className='border-base-300 bg-base-100 flex h-14 shrink-0 items-center border-b px-4'>
      <button
        className='btn btn-ghost btn-sm mr-2'
        type='button'
        onClick={onToggle}
        aria-label={pinned ? '收起导航' : '展开导航'}
        aria-expanded={pinned}
        aria-controls='app-navigation'
      >
        {pinned ?
          <PanelLeftClose size={16} />
        : <PanelLeftDashed size={16} />}
      </button>
      <h1 className='text-lg font-semibold'>模型驱动数据工作台</h1>
    </header>
  );
}

function AppLayout() {
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem('workbench-sidebar-pinned') !== '0';
    } catch {
      return true;
    }
  });
  const toggleSidebar = (): void =>
    setPinned(current => {
      const next = !current;
      try {
        localStorage.setItem('workbench-sidebar-pinned', next ? '1' : '0');
      } catch {
        // 隐私模式等场景 localStorage 不可用：仅本次会话生效
      }
      return next;
    });

  return (
    <div className={`flex size-full ${pinned ? 'left-menu-pinned' : ''}`} id='layout-main'>
      <AppSidebar pinned={pinned} onToggle={toggleSidebar} />
      <div className='flex h-full min-w-0 grow flex-col overflow-hidden' id='layout-container'>
        <AppHeader pinned={pinned} onToggle={toggleSidebar} />
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
