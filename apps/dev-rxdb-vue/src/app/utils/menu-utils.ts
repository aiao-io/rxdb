import { randomString } from '@aiao/utils';

export interface MenuNode {
  id: string;
  parentId?: string | null;
}

export interface MenuEntity<T extends MenuNode> extends MenuNode {
  title: string;
  parent$: { set: (parent: T | null) => void };
}

/**
 * 每批一个的标题 token，保证跨批次的标题不重复。
 *
 * @remarks
 * `SortableMenuLarge` / `SortableMenuSimple` 上有唯一索引 `parent_title = (parentId, title)`，
 * 且 `normalized: true` 让 `parentId IS NULL` 的根节点也进入比较。
 * 原来每批都从 `Batch 0` 起编号，而 `i = 0` 那一条**必然是根**
 * （`parentIds` 初始只有 `['root']`），于是第二批必定撞上第一批的 `(null, 'Batch 0')`，
 * 整批 INSERT 回滚 —— demo 页上连点两次「添加 100 条」，第二次真的不生效。
 *
 * token 取随机而不是「扫描现有标题挑个没用过的编号」：生成器不读库、也不收现有节点，
 * 任何依赖现有数据完整性的编号方案都无从谈起。
 */
const BATCH_TOKEN_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

const newBatchToken = () => randomString(6, BATCH_TOKEN_ALPHABET);

/**
 * 批量生成菜单数据（带随机层级）
 *
 * @remarks
 * 不写 `sortOrder`：整批交给一次 `saveMany`，引擎按批内顺序把缺键的节点追加到各自 `parentId` 组的末尾。
 */
export function generateBatchMenus<T extends MenuEntity<T>>(
  total: number,
  EntityClass: new (data: { title: string }) => T
): T[] {
  const batchToken = newBatchToken();
  const maxDepth = 7;
  const menus: T[] = [];
  const depths = new Map<string, number>();
  depths.set('root', 0);

  const parentIds: string[] = ['root'];
  const createdMenusMap = new Map<string, T>();

  for (let i = 0; i < total; i++) {
    let parentId = parentIds[Math.floor(Math.random() * parentIds.length)];
    let depth = depths.get(parentId) ?? 0;

    if (depth >= maxDepth) {
      parentId = 'root';
      depth = 0;
    }

    const menu = new EntityClass({
      title: `Batch ${batchToken}-${i}`
    });

    createdMenusMap.set(menu.id, menu);
    if (parentId !== 'root') {
      const parent = createdMenusMap.get(parentId);
      if (parent) {
        menu.parent$.set(parent);
      }
    }

    menus.push(menu);
    if (menu.id) {
      depths.set(menu.id, depth + 1);
      parentIds.push(menu.id);
    }
  }

  return menus;
}
