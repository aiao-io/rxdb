import { encodeRxDBChangeEntityId, getEntityMetadata, RxDB, SwitchVersionActions, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { dispatch_switch_events, execute_switch_actions } from '../../version/execute_switch_actions.js';
import { convertSwitchResultToSql } from '../../version/switch-result.utils.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

/**
 * 辅助函数：创建空的 SwitchVersionActions
 */
const emptyActions = (): SwitchVersionActions => ({
  deletes: new Map(),
  updates: new Map(),
  inserts: new Map()
});

/**
 * 生成 SwitchVersionChange 的 key
 */
const generateKey = (entity: Todo): string => {
  const metadata = getEntityMetadata(Todo);
  return `${metadata.namespace}:${metadata.name}:${entity.id}`;
};

describe('execute_switch_actions 单元测试', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      dbName: generateDbName(),
      entities: [Todo],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });
    db.adapter(
      'pglite',
      db =>
        new RxDBAdapterPGlite(db, {
          store: 'memory'
        })
    );
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  afterEach(async () => await cleanup_db(adapter));

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  describe('execute_switch_actions', () => {
    it('应处理空操作', async () => {
      const actions = emptyActions();

      const switchAction = await convertSwitchResultToSql(adapter, actions);
      await execute_switch_actions(adapter, switchAction);

      // 无操作应正常完成
      expect(switchAction.inserts).toHaveLength(0);
      expect(switchAction.updates).toHaveLength(0);
      expect(switchAction.deletes).toHaveLength(0);
    });

    it('应正确执行删除操作', async () => {
      // 先创建一个 Todo
      const todo = new Todo();
      todo.title = 'to-be-deleted';
      await todo.save();

      // 验证已创建
      const countBefore = await adapter.getRepository(Todo).count({
        where: { combinator: 'and', rules: [] }
      });
      expect(countBefore).toBe(1);

      // 执行删除操作 - deletes 只需要 patch 包含 id
      const actions = emptyActions();
      actions.deletes.set(generateKey(todo), {
        patch: { id: todo.id } as Partial<Todo>,
        inversePatch: { ...todo } as Partial<Todo>
      });

      const switchAction = await convertSwitchResultToSql(adapter, actions);
      await execute_switch_actions(adapter, switchAction);

      // 验证已删除
      const countAfter = await adapter.getRepository(Todo).count({
        where: { combinator: 'and', rules: [] }
      });
      expect(countAfter).toBe(0);
    });

    it('应正确执行插入操作', async () => {
      const todo = new Todo();
      todo.title = 'inserted-todo';

      // inserts 需要 patch 包含完整实体数据
      const actions = emptyActions();
      actions.inserts.set(generateKey(todo), {
        patch: { ...todo } as Partial<Todo>,
        inversePatch: null
      });

      const switchAction = await convertSwitchResultToSql(adapter, actions);
      await execute_switch_actions(adapter, switchAction);

      expect(switchAction.inserts[0].successResults?.rows).toHaveLength(1);

      // 验证已插入
      const todos = await adapter.getRepository(Todo).find({
        where: { combinator: 'and', rules: [] }
      });
      expect(todos.length).toBe(1);
      expect(todos[0].title).toBe('inserted-todo');
    });

    it('应正确执行更新操作', async () => {
      // 先创建一个 Todo
      const todo = new Todo();
      todo.title = 'original-title';
      await todo.save();

      // 准备更新数据 - 只包含需要更新的字段和 id
      const actions = emptyActions();
      actions.updates.set(generateKey(todo), {
        patch: { id: todo.id, title: 'updated-title' } as Partial<Todo>,
        inversePatch: { id: todo.id, title: 'original-title' } as Partial<Todo>
      });

      const switchAction = await convertSwitchResultToSql(adapter, actions);
      await execute_switch_actions(adapter, switchAction);

      expect(switchAction.updates[0].successResults?.rows).toHaveLength(1);

      // 直接从数据库查询（绕过缓存）验证更新成功
      const result = await adapter.internalQuery(`SELECT * FROM "public"."todos" WHERE id = $1`, [todo.id]);
      expect(result.rows.length).toBe(1);
      expect((result.rows[0] as { title: string }).title).toBe('updated-title');
    });

    it('恢复 trigger 失败时回滚切换 DML 并保留原 trigger', async () => {
      const todo = new Todo({ title: 'must-survive' });
      await todo.save();
      await adapter.query(`
        CREATE OR REPLACE FUNCTION "rxdb"."fail_switch_actions"()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'injected switch action failure';
        END;
        $$ LANGUAGE plpgsql
      `);
      await adapter.query(`
        CREATE TRIGGER "fail_switch_actions_trigger"
        BEFORE UPDATE ON "rxdb"."rxdb_branch"
        FOR EACH STATEMENT EXECUTE FUNCTION "rxdb"."fail_switch_actions"()
      `);

      const actions = emptyActions();
      actions.deletes.set(generateKey(todo), {
        patch: { id: todo.id } as Partial<Todo>,
        inversePatch: { ...todo } as Partial<Todo>
      });
      const switchAction = await convertSwitchResultToSql(adapter, actions);

      try {
        await expect(execute_switch_actions(adapter, switchAction, undefined, true)).rejects.toThrow(
          'injected switch action failure'
        );
      } finally {
        await adapter.query(`DROP TRIGGER IF EXISTS "fail_switch_actions_trigger" ON "rxdb"."rxdb_branch"`);
        await adapter.query(`DROP FUNCTION IF EXISTS "rxdb"."fail_switch_actions"()`);
      }

      const existing = await adapter.internalQuery(`SELECT id FROM "public"."todos" WHERE id = $1`, [todo.id]);
      expect(existing.rows).toHaveLength(1);

      const after = new Todo({ title: 'trigger-still-alive' });
      await after.save();
      const changes = await adapter.internalQuery<{ branchId: string }>(
        `SELECT "branchId" FROM "rxdb"."rxdb_change"
         WHERE "entity" = 'Todo' AND "entityId" = $1`,
        [encodeRxDBChangeEntityId(after.id)]
      );
      expect(changes.rows).toHaveLength(1);
      expect(changes.rows[0].branchId).toBe('main');
    });
  });

  describe('dispatch_switch_events', () => {
    it('应在有操作时派发事件', async () => {
      // 创建一个 Todo
      const todo = new Todo();
      todo.title = 'event-test';
      await todo.save();

      // 执行包含操作的切换
      const actions = emptyActions();
      actions.updates.set(generateKey(todo), {
        patch: { ...todo } as Partial<Todo>,
        inversePatch: { ...todo } as Partial<Todo>
      });

      const switchAction = await convertSwitchResultToSql(adapter, actions);
      await execute_switch_actions(adapter, switchAction);

      // dispatch_switch_events 应该不抛异常
      await expect(dispatch_switch_events(adapter, switchAction)).resolves.not.toThrow();
    });
  });
});
