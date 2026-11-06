import type { EntityType } from '@aiao/rxdb';
import type { MenuNode } from '@aiao/rxdb-admin';
import { AdminLayout, AdminShellProvider } from '@aiao/rxdb-admin-react';
import { I18nProvider, useI18n } from '@aiao/rxdb-i18n-react';
import { RxDBProvider, useCount, useRxDB } from '@aiao/rxdb-react';
import { Database } from 'lucide-react';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate, useNavigation } from 'react-router-dom';
import { findWorkbenchEntity, visibleEntityEntries, type WorkbenchEntityEntry } from './entities/entity-registry';
import setup_rxdb from './rxdb/setup_rxdb';
import { createRecordSearchSource } from './shell/record-search';
import { buildWorkbenchMenu, entryOfMenuId } from './shell/workbench-menu';
import { workbenchShell } from './shell/workbench-shell';

const db = setup_rxdb();

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

/** 外壳布局：菜单、当前地址、导航状态交给 AdminLayout，路由出口作为内容区。 */
function AppLayout() {
  const { t, locale } = useI18n();
  const rxdb = useRxDB();
  const location = useLocation();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const menu: MenuNode<ReactNode>[] = buildWorkbenchMenu(rxdb.config.entities, t);
  const entries = useMemo(() => visibleEntityEntries(rxdb.config.entities), [rxdb]);

  useEffect(
    () => workbenchShell.palette.registerSource(createRecordSearchSource(rxdb, url => void navigate(url), t)),
    [rxdb, navigate, t, locale]
  );

  return (
    <AdminLayout
      menu={menu}
      url={`${location.pathname}${location.search}`}
      navigating={navigation.state !== 'idle'}
      brandIcon={<Database size={16} />}
      renderMenuExtra={node => {
        const entry = entryOfMenuId(entries, node.id);
        return entry ? <EntityCountBadge entry={entry} /> : null;
      }}
    >
      <Suspense
        fallback={
          <div
            className='flex h-full items-center justify-center'
            data-testid='loading-fallback'
            aria-label={t('app.loading')}
          >
            <span className='loading loading-spinner loading-lg'></span>
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </AdminLayout>
  );
}

export default function App() {
  return (
    <RxDBProvider db={db}>
      <I18nProvider value={workbenchShell.i18n}>
        <AdminShellProvider shell={workbenchShell}>
          <AppLayout />
        </AdminShellProvider>
      </I18nProvider>
    </RxDBProvider>
  );
}
