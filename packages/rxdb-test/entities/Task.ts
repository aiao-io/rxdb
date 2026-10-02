import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * `Task` —— 三端 Todo 页的可排序待办：按 `completed` 分组手动排序，进行中与已完成各一条序列。
 *
 * @remarks
 * 不改共享 `Todo`：它被 supabase 全量同步，远端 `todos` 表没有 `sortOrder` 列，
 * 直接声明可排序会让远端缺列、让所有不带 `orderBy` 的 `Todo` 查询改序（US-028 阶段 E）。
 * 与 `Todo` 同库，所以表名不能沿用 `todos`。
 */
@Entity({
  name: 'Task',
  tableName: 'tasks',
  displayName: '任务',
  manualOrder: { groupBy: ['completed'] },
  properties: [
    { name: 'title', type: PropertyType.string, searchable: true },
    { name: 'completed', type: PropertyType.boolean, default: false },
    { name: 'sortOrder', type: PropertyType.string }
  ]
})
export class Task extends EntityBase {}
