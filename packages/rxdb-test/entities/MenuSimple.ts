import { PropertyType, TreeAdjacencyListEntityBase, TreeEntity } from '@aiao/rxdb';

/**
 * MenuSimple - 简单树结构菜单（适用于 Scenario 1）
 *
 * 特性：
 * - 数据量 < 100 节点
 * - 全量加载到内存
 * - hasChildren 在内存中计算（children$.value.length > 0）
 * - 无子查询开销，性能更好
 */
@TreeEntity({
  name: 'MenuSimple',
  tableName: 'menu_simple',
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
export class MenuSimple extends TreeAdjacencyListEntityBase {
  title!: string;
  sortOrder!: string | null;
}
