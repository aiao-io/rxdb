import { Entity, EntityBase, PropertyType, RelationKind, type ISortableEntity, type SortOrderKey, type UUID } from '@aiao/rxdb';

/**
 * `Column` —— 看板的列：以 `boardId` 为分组字段的排序域（板内拖列）。
 *
 * @remarks
 * `board_id` 非空外键 + RESTRICT 默认级联：删板被应用层删除服务先行清空列，直连 SQL 删板仍被外键拦下。
 * `column.board_id` 的「创建后不可改」由领域服务入口守住（US-526 技术笔记），本实体不承诺存储层拒绝。
 */
@Entity({
  name: 'Column',
  tableName: 'column',
  namespace: 'board',
  displayName: '列',
  manualOrder: { groupBy: ['boardId'] },
  properties: [
    { name: 'title', type: PropertyType.string, displayName: '标题' },
    { name: 'sortOrder', type: PropertyType.string, displayName: '排序键' }
  ],
  relations: [
    { name: 'board', columnName: 'board_id', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'Board', mappedProperty: 'columns' },
    { name: 'tasks', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'Task', mappedProperty: 'column' }
  ]
})
export class Column extends EntityBase implements ISortableEntity {
  boardId!: UUID;
  title!: string;
  sortOrder!: SortOrderKey;
}
