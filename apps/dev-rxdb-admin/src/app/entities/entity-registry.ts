import { getEntityMetadata, type EntityType } from '@aiao/rxdb';

/**
 * 工作台实体可见性：导航与「声明可见」从同一份元数据派生（US-526 AC#1）。
 *
 * @remarks 不另建菜单配置表——RxDB 实例注册的实体就是单一真相源，
 * 命名空间不在 {@link WORKBENCH_NAMESPACES} 内的实体即使注册了也不给出导航入口。
 */

/** 工作台可见的实体命名空间。 */
export const WORKBENCH_NAMESPACES = ['assets'] as const;

/** 导航条目：一个可见实体。 */
export interface WorkbenchEntityEntry {
  namespace: string;
  name: string;
  displayName: string;
}

/** 从实体注册表派生可见实体导航条目（按命名空间、名称排序）。 */
export function visibleEntityEntries(entities: readonly EntityType[]): WorkbenchEntityEntry[] {
  return entities
    .map(cls => getEntityMetadata(cls))
    .filter(meta => WORKBENCH_NAMESPACES.includes(meta.namespace as (typeof WORKBENCH_NAMESPACES)[number]))
    .map(meta => ({ namespace: meta.namespace, name: meta.name, displayName: meta.displayName ?? meta.name }))
    .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name));
}

/** 在工作台可见实体里按命名空间与名称查找；不可见或不存在返回 `null`。 */
export function findWorkbenchEntity(
  entities: readonly EntityType[],
  namespace: string,
  name: string
): EntityType | null {
  const found = entities.find(cls => {
    const meta = getEntityMetadata(cls);
    return meta.namespace === namespace && meta.name === name;
  });
  if (found === undefined) return null;
  const meta = getEntityMetadata(found);
  return WORKBENCH_NAMESPACES.includes(meta.namespace as (typeof WORKBENCH_NAMESPACES)[number]) ? found : null;
}
