import type { RxDBEntityId } from '@aiao/rxdb';
import { collectSearchPath } from './tree-search';

export interface TreeMenuItem {
  id: RxDBEntityId;
  parentId?: RxDBEntityId | null;
  title: string;
}

export interface TreeMenuNode<T extends TreeMenuItem> {
  menu: T;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

export type ResolveHasChildren<T extends TreeMenuItem> = (menu: T, children: readonly T[]) => boolean;

/** 按父节点分组，组内保持输入（查询）顺序：手动顺序只来自引擎的默认排序。 */
function createChildrenMap<T extends TreeMenuItem>(menus: readonly T[]): Map<RxDBEntityId | null, T[]> {
  const childrenMap = new Map<RxDBEntityId | null, T[]>();
  for (const menu of menus) {
    const parentId = menu.parentId ?? null;
    const children = childrenMap.get(parentId) ?? [];
    children.push(menu);
    childrenMap.set(parentId, children);
  }
  return childrenMap;
}

/**
 * 建树：搜索时只显示命中项及其祖先，祖先临时画成展开（不改用户的展开集合），与 Angular / React 同一口径。
 */
export function buildTreeMenuNodes<T extends TreeMenuItem>(
  menus: readonly T[],
  expandedIds: ReadonlySet<RxDBEntityId>,
  searchKeyword: string,
  resolveHasChildren: ResolveHasChildren<T> = (_menu, children) => children.length > 0
): TreeMenuNode<T>[] {
  const childrenMap = createChildrenMap(menus);
  const keyword = searchKeyword.toLowerCase();
  const search = searchKeyword ? collectSearchPath(menus, menu => menu.title.toLowerCase().includes(keyword)) : null;
  const nodes: TreeMenuNode<T>[] = [];

  const visit = (menu: T, level: number): void => {
    if (search && !search.visible.has(menu.id)) return;

    const children = childrenMap.get(menu.id) ?? [];
    const isExpanded = expandedIds.has(menu.id) || (search?.ancestors.has(menu.id) ?? false);
    nodes.push({ menu, level, isExpanded, hasChildren: resolveHasChildren(menu, children) });

    if (!isExpanded) return;
    for (const child of children) visit(child, level + 1);
  };

  for (const root of childrenMap.get(null) ?? []) visit(root, 0);
  return nodes;
}
