/**
 * @fileoverview 三端 Todo 页的可排序待办实体 `Task`（US-028 阶段 E：AC#18 / AC#19）
 *
 * 共享 `Todo` 被十几个项目引用、经 supabase 全量同步，远端 `todos` 表没有 `sortOrder` 列，
 * 所以 todo 页改用独立的 `Task` 承载手动排序；`Todo` 的 schema 与默认查询顺序保持不变。
 * 新实体与 `Todo` 同库，名称与表名的约束来自三端 e2e（`entity-model.spec.ts` 断言首个实体是
 * `Account`、用 `/^Todo/` 匹配链接；`working-tree.spec.ts` 按表名筛选）。
 */
import { getEntityMetadata, isManualOrderEntity, manualOrderGroupFields, SORT_ORDER_FIELD } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { ENTITIES, Task, Todo } from '../../entities/index.js';

describe('US-028 阶段 E 可排序待办实体 Task', () => {
  const metadata = getEntityMetadata(Task);

  it('按 completed 分组手动排序，sortOrder 与 completed 都非空', () => {
    expect(isManualOrderEntity(metadata)).toBe(true);
    expect(manualOrderGroupFields(metadata)).toEqual(['completed']);
    expect(metadata.propertyMap.get(SORT_ORDER_FIELD)?.nullable).toBeFalsy();
    expect(metadata.propertyMap.get('completed')?.nullable).toBeFalsy();
  });

  it('登记进 ENTITIES；名称不排在 Account 之前、不以 Todo 开头，表名不沿用 todos', () => {
    expect(ENTITIES).toContain(Task);
    expect(metadata.name.localeCompare('Account')).toBeGreaterThan(0);
    expect(metadata.name).not.toMatch(/^Todo/);
    expect(metadata.tableName).not.toBe(getEntityMetadata(Todo).tableName);
  });

  it('共享 Todo 不变：不声明手动排序、没有 sortOrder 列', () => {
    const todo = getEntityMetadata(Todo);
    expect(isManualOrderEntity(todo)).toBe(false);
    expect(todo.propertyMap.has(SORT_ORDER_FIELD)).toBe(false);
    expect(todo.tableName).toBe('todos');
  });
});
