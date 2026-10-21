import { Entity, EntityBase, RelationKind, type UUID } from '@aiao/rxdb';

/**
 * `TaskLabel` —— 任务与板级标签的多对多关联表（US-536）。
 *
 * @remarks
 * 显式关联实体而非 `MANY_TO_MANY` 中间表：删除级联服务要按 ID 集合先清关联、
 * 撤销要按原 ID 插回（US-534 AC#11），显式实体让两条路径都走普通仓储。
 * `(taskId, labelId)` 复合唯一：重复添加不生成重复关联。
 */
@Entity({
  name: 'TaskLabel',
  tableName: 'task_label',
  namespace: 'board',
  displayName: '任务标签关联',
  relations: [
    {
      name: 'task',
      columnName: 'task_id',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Task',
      mappedProperty: 'labels'
    },
    {
      name: 'label',
      columnName: 'label_id',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'BoardLabel',
      mappedProperty: 'tasks'
    }
  ],
  indexes: [{ name: 'task_label', properties: ['taskId', 'labelId'], unique: true }]
})
export class TaskLabel extends EntityBase {
  taskId!: UUID;
  labelId!: UUID;
}
