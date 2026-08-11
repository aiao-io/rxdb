import { PropertyType, TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb';

/**
 * MenuLarge - 复杂树结构菜单（适用于 Scenario 2）
 *
 * 特性：
 * - 数据量 1000+ 节点
 * - 懒加载 + 虚拟滚动
 * - hasChildren 由数据库计算（子查询 COUNT）
 * - 支持按需展开节点
 */
@TreeEntity({
  name: 'MenuLarge',
  tableName: 'menu_large',
  properties: [
    {
      name: 'title',
      type: PropertyType.string
    },
    {
      name: 'sortOrder',
      columnName: 'sort_order',
      type: PropertyType.string,
      nullable: true
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
export class MenuLarge extends TreeAdjacencyListEntityBase {
  title!: string;
  sortOrder!: string | null;
}
