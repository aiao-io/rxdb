import { getEntityMetadata, type Entity } from '@aiao/rxdb';
import { useCount, useRxDB } from '@aiao/rxdb-react';
import { useEffect, useMemo } from 'react';
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';

/** 左侧目录里的实体条目。 */
interface EntityOption {
  namespace: string;
  name: string;
  /** `${namespace}:${name}` */
  key: string;
  displayName: string;
  cls: Entity;
}

/** 非 public namespace 的实体分组。 */
interface EntityGroup {
  namespace: string;
  entities: EntityOption[];
}

/** 每个实体一个计数徽章组件：hook 不能进循环 / map 回调，用子组件隔离调用点。 */
function EntityCountBadge({ cls }: { cls: Entity }): React.JSX.Element {
  const count = useCount(cls, { where: { combinator: 'and', rules: [] } });
  return <span className='badge badge-ghost badge-xs'>{count.value ?? 0}</span>;
}

function EntityCatalogLink({ entity }: { entity: EntityOption }): React.JSX.Element {
  return (
    <NavLink
      to={`/entities/${entity.namespace}/${entity.name}`}
      className={({ isActive }) => (isActive ? 'menu-active' : '')}
    >
      <span className='truncate'>{entity.displayName}</span>
      <EntityCountBadge cls={entity.cls} />
    </NavLink>
  );
}

/**
 * rxdb-model 实体浏览壳页（/entities，dashboard 同款两栏布局）：
 * 左侧为按 namespace 分组的实体目录（含计数），点击切换右侧列表；
 * 无子路由时自动重定向到首个实体。右侧由 `:namespace/:name` 子路由渲染实体列表。
 */
export default function EntityShell(): React.JSX.Element {
  const rxdb = useRxDB();
  const navigate = useNavigate();
  const location = useLocation();
  const childMatch = useMatch('/entities/:namespace/:name');

  const entityList: EntityOption[] = useMemo(
    () =>
      rxdb.config.entities.map(cls => {
        const meta = getEntityMetadata(cls);
        return {
          namespace: meta.namespace,
          name: meta.name,
          key: `${meta.namespace}:${meta.name}`,
          displayName: meta.displayName ?? meta.name,
          cls
        };
      }),
    [rxdb]
  );

  const publicEntities = useMemo(() => entityList.filter(e => e.namespace === 'public'), [entityList]);

  const entityGroups = useMemo<EntityGroup[]>(() => {
    const map = new Map<string, EntityOption[]>();
    for (const e of entityList) {
      if (e.namespace === 'public') continue;
      const arr = map.get(e.namespace) ?? [];
      arr.push(e);
      map.set(e.namespace, arr);
    }
    return [...map.entries()].map(([namespace, entities]) => ({ namespace, entities }));
  }, [entityList]);

  // 无子路由时自动重定向到首个实体（Angular 壳页 NavigationEnd 订阅的 React 对应物；
  // childMatch 为 null 说明 :namespace/:name 子路由没吃到，右栏 Outlet 空着）
  useEffect(() => {
    if (!entityList.length || childMatch !== null) return;
    const first = entityList[0];
    void navigate(`${first.namespace}/${first.name}`);
  }, [entityList, childMatch, navigate, location.pathname]);

  return (
    <div className='page-host bg-base-100 flex h-full' data-testid='entity-shell'>
      {/* 左侧：实体目录（public 平铺，其余按 namespace 分组） */}
      <div className='border-base-300 bg-base-100 flex h-full w-56 shrink-0 flex-col border-r'>
        <div className='border-base-300 text-base-content/70 flex h-10 min-h-10 items-center border-b px-3 text-xs font-medium'>
          实体类型
        </div>
        <div className='flex-1 overflow-y-auto'>
          <ul className='menu menu-sm w-full'>
            {publicEntities.map(entity => (
              <li key={entity.key}>
                <EntityCatalogLink entity={entity} />
              </li>
            ))}
            {entityGroups.map(group => (
              <li key={group.namespace}>
                <details open>
                  <summary className='text-base-content/50 text-xs font-semibold tracking-wide uppercase'>
                    {group.namespace}
                  </summary>
                  <ul>
                    {group.entities.map(entity => (
                      <li key={entity.key}>
                        <EntityCatalogLink entity={entity} />
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
        <div className='border-base-300 text-base-content/40 flex items-center border-t px-3 py-1.5 text-xs'>
          <span>共 {entityList.length} 个实体</span>
        </div>
      </div>

      {/* 右侧：所选实体的列表（relative 把表格的加载/空态遮罩限制在面板内，不遮左侧目录） */}
      <div className='relative flex flex-1 flex-col overflow-hidden'>
        <Outlet />
      </div>
    </div>
  );
}
