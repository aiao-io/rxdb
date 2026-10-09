import { PropertyType } from '@aiao/rxdb';
import { TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb-plugin-tree';

/**
 * SortableMenuSimple —— MenuSimple 的可排序版本，供三端 demo 的菜单 simple 页使用（US-031）。
 *
 * @remarks
 * 列、索引与计算属性 1:1 复刻 `MenuSimple`，只多两处：`manualOrder: { groupBy: ['parentId'] }` 与非空的 `sortOrder`。
 * 排序域按父节点划分：同一 `parentId` 下的子节点是一条序列，根节点（`parentId` 为 NULL）自成一组；
 * 新建、批量添加与改父节点时不给排序键，由引擎追加到所属组末尾。
 *
 * 与 `MenuSimple` 不可互换：后者 `sortOrder` 可空、不声明手动排序，留给适配器测试、远端测试表与桌面宿主使用。
 * 两者同形由 `src/__tests__/sortable-tree-entities.spec.ts` 守住。
 */
@TreeEntity({
  name: 'SortableMenuSimple',
  tableName: 'sortable_menu_simple',
  manualOrder: { groupBy: ['parentId'] },
  properties: [
    {
      name: 'title',
      type: PropertyType.string
    },
    {
      name: 'sortOrder',
      columnName: 'sort_order',
      type: PropertyType.string
    }
  ],
  features: {
    tree: { type: 'adjacency-list', hasChildren: false }
  },
  indexes: [
    {
      // RXT-016：同级菜单不能重名，此前**只有** `PathValidatorService.checkPathConflict`
      // 这一道内存校验（先读后写）——并发创建、批量导入、直接走 repository 都能绕过。
      // `normalized` 是必需的：根菜单 `parentId IS NULL`，普通 UNIQUE 对它完全不生效；
      // `lower()` 也与那道内存校验的 `title.toLowerCase()` 比较保持同口径。
      name: 'parent_title',
      properties: ['parentId', 'title'],
      unique: true,
      normalized: true
    }
  ]
})
export class SortableMenuSimple extends TreeAdjacencyListEntityBase {
  title!: string;
  sortOrder!: string;
}
