import type { RxDBEntityId } from '@aiao/rxdb';

export interface TreeMenuItem {
  id: RxDBEntityId;
  parentId?: RxDBEntityId | null;
  sortOrder?: string | null;
  title: string;
}

export interface TreeMenuNode<T extends TreeMenuItem> {
  menu: T;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

export type ResolveHasChildren<T extends TreeMenuItem> = (menu: T, children: readonly T[]) => boolean;

function createChildrenMap<T extends TreeMenuItem>(menus: readonly T[]): Map<RxDBEntityId | null, T[]> {
  const childrenMap = new Map<RxDBEntityId | null, T[]>();
  for (const menu of menus) {
    const parentId = menu.parentId ?? null;
    const children = childrenMap.get(parentId) ?? [];
    children.push(menu);
    childrenMap.set(parentId, children);
  }

  for (const children of childrenMap.values()) {
    children.sort((left, right) => (left.sortOrder ?? '').localeCompare(right.sortOrder ?? ''));
  }
  return childrenMap;
}

function findVisibleIds<T extends TreeMenuItem>(menus: readonly T[], keyword: string): Set<RxDBEntityId> | null {
  if (!keyword) return null;

  const normalizedKeyword = keyword.toLowerCase();
  const menusById = new Map(menus.map(menu => [menu.id, menu]));
  const visibleIds = new Set<RxDBEntityId>();

  for (const menu of menus) {
    if (!menu.title.toLowerCase().includes(normalizedKeyword)) continue;

    let current: T | undefined = menu;
    while (current && !visibleIds.has(current.id)) {
      visibleIds.add(current.id);
      current = current.parentId == null ? undefined : menusById.get(current.parentId);
    }
  }
  return visibleIds;
}

export function buildTreeMenuNodes<T extends TreeMenuItem>(
  menus: readonly T[],
  expandedIds: ReadonlySet<RxDBEntityId>,
  searchKeyword: string,
  resolveHasChildren: ResolveHasChildren<T> = (_menu, children) => children.length > 0
): TreeMenuNode<T>[] {
  const childrenMap = createChildrenMap(menus);
  const visibleIds = findVisibleIds(menus, searchKeyword);
  const nodes: TreeMenuNode<T>[] = [];

  const visit = (menu: T, level: number): void => {
    if (visibleIds && !visibleIds.has(menu.id)) return;

    const children = childrenMap.get(menu.id) ?? [];
    const isExpanded = expandedIds.has(menu.id);
    nodes.push({ menu, level, isExpanded, hasChildren: resolveHasChildren(menu, children) });

    if (!visibleIds && !isExpanded) return;
    for (const child of children) visit(child, level + 1);
  };

  for (const root of childrenMap.get(null) ?? []) visit(root, 0);
  return nodes;
}
