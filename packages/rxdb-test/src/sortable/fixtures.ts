/**
 * @fileoverview 手动排序契约套件的实体夹具（US-028 阶段 A / D）。
 *
 * @remarks
 * 独立夹具、独立 namespace 与表名：不碰发布出去的公共实体，也不与 demo 实体撞表。
 * `sortOrder` 不声明 `nullable`，即默认非空——建表 DDL 因此带 `NOT NULL`，
 * 套件里「同步写入 NULL 键被拒」测的正是这一条。
 *
 * 不设 `log: false`：变更日志触发器是活查询增量合并的事件源，关掉后套件里的增量合并断言无从观测。
 */
import { Entity, EntityBase, PropertyType, RelationKind } from '@aiao/rxdb';

/**
 * `SortableItem` —— 整表一条序列的手动排序实体。
 */
@Entity({
  name: 'SortableItem',
  tableName: 'manual_order_item',
  namespace: 'manual-order-fixtures',
  manualOrder: true,
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string }
  ]
})
export class SortableItem extends EntityBase {
  title!: string;
  sortOrder!: string;
}

/**
 * `SortableList` —— 分组外键指向的普通实体，本身不可排序。
 */
@Entity({
  name: 'SortableList',
  tableName: 'manual_order_list',
  namespace: 'manual-order-fixtures',
  properties: [{ name: 'title', type: PropertyType.string }]
})
export class SortableList extends EntityBase {
  title!: string;
}

/**
 * `SortableListItem` —— 按可空外键 `listId` 分组的手动排序实体（阶段 D，AC#13 的验收形态）。
 *
 * @remarks
 * 每个 `listId` 一条独立序列，`listId` 为 NULL 的行自成一组、默认排序里整体在最前。
 * 外键列两端都按码点同序：SQLite 存 TEXT，PGlite 存 uuid（逐字节比较，等同小写十六进制串的码点序）。
 */
@Entity({
  name: 'SortableListItem',
  tableName: 'manual_order_list_item',
  namespace: 'manual-order-fixtures',
  manualOrder: { groupBy: ['listId'] },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string }
  ],
  relations: [
    {
      name: 'list',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'SortableList',
      mappedProperty: 'items',
      nullable: true
    }
  ]
})
export class SortableListItem extends EntityBase {
  title!: string;
  sortOrder!: string;
  listId!: string | null;
}

/**
 * `SortableTodo` —— 按 boolean `completed` 分组的手动排序实体：进行中与已完成各一条序列。
 *
 * @remarks
 * 两端 `false` 都在前：SQLite 存 `INTEGER`（0 / 1），PGlite 原生 `boolean`，与 JS `false < true` 一致。
 */
@Entity({
  name: 'SortableTodo',
  tableName: 'manual_order_todo',
  namespace: 'manual-order-fixtures',
  manualOrder: { groupBy: ['completed'] },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'sortOrder', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean }
  ]
})
export class SortableTodo extends EntityBase {
  title!: string;
  sortOrder!: string;
  completed!: boolean;
}
