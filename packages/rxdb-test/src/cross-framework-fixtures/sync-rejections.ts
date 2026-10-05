/**
 * 被拒变更的三端夹具 —— US-218 AC#16。
 *
 * @remarks
 * Angular / React / Vue 的 `use-sync-state` spec 与三个 demo 的被拒面板 spec 共用这一份：
 * hub 上报同一份列表，三端读到的必须是**同一个引用**，面板渲染的字段与文案也以它为准。
 *
 * 两条覆盖两种形态：`denied` 不带 `dependsOn`；`dependency` 带指向父实体的 `dependsOn`。
 */

import type { SyncRejection } from '@aiao/rxdb';

/** 共享被拒列表：一条 RLS 拒绝的修改，一条因父实体被拒而失败的新建 */
export const SYNC_REJECTIONS_FIXTURE: readonly SyncRejection[] = Object.freeze([
  Object.freeze({
    namespace: 'public',
    entity: 'Todo',
    entityId: '00000000-0000-4000-8000-000000000001',
    op: 'UPDATE',
    code: '42501',
    reason: 'denied',
    message: 'new row violates row-level security policy for table "todos"',
    at: new Date('2026-10-05T08:00:00.000Z'),
    changeIds: Object.freeze([11, 12])
  }),
  Object.freeze({
    namespace: 'public',
    entity: 'TodoItem',
    entityId: '00000000-0000-4000-8000-000000000002',
    op: 'INSERT',
    code: '23503',
    reason: 'dependency',
    message: 'insert or update on table "todo_items" violates foreign key constraint "todo_items_todoId_fkey"',
    dependsOn: Object.freeze({
      namespace: 'public',
      entity: 'Todo',
      entityId: '00000000-0000-4000-8000-000000000003'
    }),
    at: new Date('2026-10-05T08:00:00.000Z'),
    changeIds: Object.freeze([13])
  })
] satisfies SyncRejection[]);

/** 下一轮被拒时用来验证「整体替换」的列表：一条已被删除的行上的修改 */
export const SYNC_REJECTIONS_NEXT_ROUND_FIXTURE: readonly SyncRejection[] = Object.freeze([
  Object.freeze({
    namespace: 'public',
    entity: 'Todo',
    entityId: '00000000-0000-4000-8000-000000000004',
    op: 'UPDATE',
    code: 'RX001',
    reason: 'gone',
    message: 'row no longer exists',
    at: new Date('2026-10-05T08:05:00.000Z'),
    changeIds: Object.freeze([21])
  })
] satisfies SyncRejection[]);
