import { useRxDB } from '@aiao/rxdb-react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { visibleEntityEntries } from '../entities/entity-registry';

/**
 * 实体壳页（/entities）：右侧由 `:namespace/:name` 子路由渲染实体列表，
 * 无子路由时自动重定向到首个可见实体。导航入口在 AppLayout 的左侧栏，
 * 本页只负责重定向与列表出口（US-526 AC#1 / #2 的导航闭环）。
 */
export default function EntityShell() {
  const rxdb = useRxDB();
  const entries = visibleEntityEntries(rxdb.config.entities);
  const { namespace, name } = useParams();

  if (namespace === undefined || name === undefined) {
    const first = entries[0];
    if (first === undefined) {
      return <div role='alert'>没有可见实体</div>;
    }
    return <Navigate to={`/entities/${first.namespace}/${first.name}`} replace />;
  }

  return (
    <div className='page-host' data-testid='entity-shell'>
      <Outlet />
    </div>
  );
}
