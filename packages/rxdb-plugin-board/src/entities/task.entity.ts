import {
  Entity,
  EntityBase,
  PropertyType,
  RelationKind,
  type ISortableEntity,
  type SortOrderKey,
  type UUID
} from '@aiao/rxdb';

/**
 * `Task` —— 看板任务：以 `columnId` 为分组字段的排序域（列内手动排序）。
 *
 * @remarks
 * 无独立 `board_id`：board 由所属列推导，单一真相源（US-534）。
 * `dueDate` 是纯日期串 `YYYY-MM-DD`，不经 `Date` / UTC 换算（US-536）；存储列 `due_date`。
 * 标题与描述自首个持久化版本起声明 `searchable`，搜索插件从阶段 A 起维护索引（epic 首轮切片）。
 */
@Entity({
  name: 'Task',
  tableName: 'task',
  namespace: 'board',
  displayName: '任务',
  manualOrder: { groupBy: ['columnId'] },
  properties: [
    { name: 'title', type: PropertyType.string, displayName: '标题', searchable: true },
    { name: 'description', type: PropertyType.string, nullable: true, displayName: '描述', searchable: true },
    { name: 'dueDate', columnName: 'due_date', type: PropertyType.string, nullable: true, displayName: '截止日' },
    { name: 'sortOrder', type: PropertyType.string, displayName: '排序键' }
  ],
  relations: [
    {
      name: 'column',
      columnName: 'column_id',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Column',
      mappedProperty: 'tasks'
    },
    { name: 'labels', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'TaskLabel', mappedProperty: 'task' }
  ]
})
export class Task extends EntityBase implements ISortableEntity {
  columnId!: UUID;
  title!: string;
  description: string | null = null;
  dueDate: string | null = null;
  sortOrder!: SortOrderKey;
}
