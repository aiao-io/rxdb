import type { RxDBEntityId } from '@aiao/rxdb';
import { generateKeyBetween, randomString } from '@aiao/utils';
import { DropMode } from '../models/drag-drop-types';

export interface MenuNode {
  id: RxDBEntityId;
  parentId?: RxDBEntityId | null;
  sortOrder?: string | null;
}

export interface MenuEntity extends MenuNode {
  title: string;
  hasChildren?: boolean | null;
}

/**
 * 每批一个的标题 token，保证跨批次的标题不重复。
 *
 * @remarks
 * `MenuLarge` / `MenuSimple` 上有唯一索引 `parent_title = (parentId, title)`，
 * 且 `normalized: true` 让 `parentId IS NULL` 的根节点也进入比较。
 * 原来每批都从 `Batch 0` 起编号，而 `i = 0` 那一条**必然是根**
 * （`parentIds` 初始只有 `[null]`），于是第二批必定撞上第一批的 `(null, 'Batch 0')`，
 * 整批 INSERT 回滚 —— demo 页上连点两次「添加 100 条」，第二次真的不生效。
 *
 * token 取随机而不是「扫描现有标题挑个没用过的编号」：
 * React 端的调用方只把**最后一个根**传进 `existingRoots`，
 * 任何依赖入参完整性的编号方案在那一端立刻失效。
 */
const BATCH_TOKEN_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

const newBatchToken = () => randomString(6, BATCH_TOKEN_ALPHABET);

/**
 * 批量生成菜单数据
 */
export function generateBatchMenus<T extends MenuEntity>(
  total: number,
  createEntity: () => T,
  existingRoots: T[]
): T[] {
  const batchToken = newBatchToken();
  const maxDepth = 7;
  const menus: T[] = [];
  const depths = new Map<RxDBEntityId | null, number>([[null, 0]]);

  const newChildrenMap = new Map<RxDBEntityId | null, T[]>();
  const parentIds: (RxDBEntityId | null)[] = [null];
  const createdMenusMap = new Map<RxDBEntityId, T>();

  for (let i = 0; i < total; i++) {
    let parentId = parentIds[Math.floor(Math.random() * parentIds.length)];
    let depth = depths.get(parentId) ?? 0;

    if (depth >= maxDepth) {
      parentId = null;
      depth = 0;
    }

    const menu = createEntity();
    menu.title = `Batch ${batchToken}-${i}`;
    menu.sortOrder = '';
    createdMenusMap.set(menu.id, menu);

    if (parentId !== null) {
      const parent = createdMenusMap.get(parentId);
      if (parent) {
        menu.parentId = parentId;
        // Ensure parent hasChildren is true
        parent.hasChildren = true;
      }
    }

    menus.push(menu);
    depths.set(menu.id, depth + 1);
    parentIds.push(menu.id);

    const key = parentId;
    if (!newChildrenMap.has(key)) {
      newChildrenMap.set(key, []);
    }
    newChildrenMap.get(key)!.push(menu);
  }

  // Calculate SortOrder
  const lastRootSort = existingRoots[existingRoots.length - 1]?.sortOrder ?? null;

  for (const [parentId, children] of newChildrenMap.entries()) {
    let lastSort: string | null = parentId === null ? lastRootSort : null;

    for (const child of children) {
      const newSort = generateKeyBetween(lastSort, null);
      child.sortOrder = newSort;
      lastSort = newSort;
    }
  }

  return menus;
}

/**
 * 计算拖放模式（上方/内部/下方）
 */
export function calculateDropMode(clientY: number, rect: { top: number; height: number }): DropMode {
  const y = clientY - rect.top;
  const height = rect.height;
  const topThreshold = height * 0.25;
  const bottomThreshold = height * 0.75;

  if (y < topThreshold) {
    return 'before';
  } else if (y > bottomThreshold) {
    return 'after';
  } else {
    return 'into';
  }
}

/**
 * 递归计算所有后代节点数量
 */
export function countDescendants(menuId: RxDBEntityId, allMenus: MenuNode[]): number {
  const childrenMap = new Map<RxDBEntityId | null, MenuNode[]>();
  allMenus.forEach(menu => {
    const pid = menu.parentId ?? null;
    if (!childrenMap.has(pid)) {
      childrenMap.set(pid, []);
    }
    childrenMap.get(pid)!.push(menu);
  });

  let count = 0;
  const queue: RxDBEntityId[] = [menuId];
  let head = 0;

  while (head < queue.length) {
    const currentId = queue[head++];
    const children = childrenMap.get(currentId) || [];
    for (const child of children) {
      count++;
      queue.push(child.id);
    }
  }
  return count;
}

/**
 * 递归收集所有后代节点ID
 */
export function collectDescendants(menuId: RxDBEntityId, allMenus: MenuNode[]): Set<RxDBEntityId> {
  const childrenMap = new Map<RxDBEntityId | null, MenuNode[]>();
  allMenus.forEach(menu => {
    const pid = menu.parentId ?? null;
    if (!childrenMap.has(pid)) {
      childrenMap.set(pid, []);
    }
    childrenMap.get(pid)!.push(menu);
  });

  const descendantIds = new Set<RxDBEntityId>();
  const queue: RxDBEntityId[] = [menuId];
  let head = 0;

  while (head < queue.length) {
    const currentId = queue[head++];
    const children = childrenMap.get(currentId) || [];
    for (const child of children) {
      if (!descendantIds.has(child.id)) {
        descendantIds.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return descendantIds;
}

/**
 * 比较排序顺序
 */
export function compareSortOrder(a: { sortOrder?: string | null }, b: { sortOrder?: string | null }): number {
  const aSortOrder = a.sortOrder ?? '';
  const bSortOrder = b.sortOrder ?? '';
  return (
    aSortOrder < bSortOrder ? -1
    : aSortOrder > bSortOrder ? 1
    : 0
  );
}
