import { PropertyType } from '@aiao/rxdb';
import { TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb-plugin-tree';

/**
 * SortableMenuLarge —— MenuLarge 的可排序版本，供三端 demo 的菜单 virtual 页与 lazy 页使用（US-031）。
 *
 * @remarks
 * 列、索引与计算属性 1:1 复刻 `MenuLarge`，只多两处：`manualOrder: { groupBy: ['parentId'] }` 与非空的 `sortOrder`。
 * 排序域按父节点划分：同一 `parentId` 下的子节点是一条序列，根节点（`parentId` 为 NULL）自成一组；
 * 新建、批量添加与改父节点时不给排序键，由引擎追加到所属组末尾。
 *
 * 与 `MenuLarge` 不可互换：后者 `sortOrder` 可空、不声明手动排序，留给适配器测试、远端测试表与桌面宿主使用。
 * 两者同形由 `src/__tests__/sortable-tree-entities.spec.ts` 守住。
 */
@TreeEntity({
  name: 'SortableMenuLarge',
  tableName: 'sortable_menu_large',
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
    tree: { type: 'adjacency-list', hasChildren: true }
  },
  indexes: [
    {
      // RXT-015：懒加载按 parentId 查询、按 sortOrder 排序，`hasChildren: true`
      // 还让每行再发一次子查询。1000+ 节点下没有这条索引，列表渲染会退化到近 O(N²)。
      // FileNode / FileLarge 早已有同名索引，本模型此前漏了。
      name: 'parent_sort',
      properties: ['parentId', 'sortOrder']
    },
    {
      // RXT-016：与 MenuSimple 同一条约束。`normalized` 让根菜单（`parentId IS NULL`）
      // 与大小写变体都进得了比较，否则这条唯一索引对根节点整条失效。
      name: 'parent_title',
      properties: ['parentId', 'title'],
      unique: true,
      normalized: true
    }
  ]
})
export class SortableMenuLarge extends TreeAdjacencyListEntityBase {
  title!: string;
  sortOrder!: string;
}
