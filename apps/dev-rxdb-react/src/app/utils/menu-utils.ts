import { randomString } from '@aiao/utils';

export interface MenuNode {
  id: string;
  parentId?: string | null;
  sortOrder?: string | null;
}

export interface MenuEntity<T extends MenuEntity<T>> extends MenuNode {
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
 * token 取随机而不是「扫描现有标题挑个没用过的编号」：生成器不读任何已有节点，
 * 任何依赖现有数据完整性的编号方案在这里都无从实现。
 */
const BATCH_TOKEN_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

const newBatchToken = () => randomString(6, BATCH_TOKEN_ALPHABET);

/**
 * 批量生成菜单数据（带随机层级）
 *
 * @remarks
 * 不写 `sortOrder`：实体声明了 `manualOrder`，整批一次 `saveMany` 时引擎按父节点分组、
 * 按批内顺序把缺键的行追加到各组末尾（根级接在库里已有根节点之后）。
 *
 * @param total - 生成条数
 * @param EntityClass - 菜单实体类
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

    const menu = new EntityClass({ title: `Batch ${batchToken}-${i}` });

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
