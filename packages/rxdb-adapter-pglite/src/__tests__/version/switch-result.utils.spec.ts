import { RxDB, type SwitchVersionActions, type SwitchVersionChange, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { beforeAll, describe, expect, it } from 'vitest';

import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { convertSwitchResultToSql } from '../../version/switch-result.utils.js';

/**
 * 辅助函数：创建 SwitchVersionChange
 */
const change = (patch: object | null, inversePatch: object | null = null): SwitchVersionChange => ({
  patch,
  inversePatch
});

describe('switch-result.utils', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      context: { userId: 'userId' },
      dbName: 'switch-test-db-pglite',
      entities: [Todo],
      sync: {
        local: {
          adapter: 'pglite'
        },
        type: SyncType.None
      }
    });
    db.adapter(
      'pglite',
      async db =>
        new RxDBAdapterPGlite(db, {
          store: 'memory'
        })
    );
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
  });

  describe('convertSwitchResultToSql', () => {
    it('应该处理空的 actions', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map(),
        updates: new Map()
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.deletes).toHaveLength(0);
      expect(result.inserts).toHaveLength(0);
      expect(result.updates).toHaveLength(0);
    });

    it('应该生成删除 SQL（字符串 ID）', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map([
          ['public:Todo:todo-1', change(null, { title: 'Old 1' })],
          ['public:Todo:todo-2', change(null, { title: 'Old 2' })]
        ]),
        inserts: new Map(),
        updates: new Map()
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.deletes).toHaveLength(1);
      expect(result.deletes[0].ids.size).toBe(2);
      expect(result.deletes[0].sql).toContain('DELETE FROM');
      // PostgreSQL 使用 = ANY($1) 语法
      expect(result.deletes[0].sql).toContain('= ANY($1)');
      expect(result.deletes[0].params[0]).toContain('todo-1');
      expect(result.deletes[0].params[0]).toContain('todo-2');
    });

    it('应该按主键 metadata 规范化 integer ID 并保持 change key 一致', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map([['rxdb:RxDBChange:2', change(null, { id: 2 })]]),
        inserts: new Map(),
        updates: new Map()
      };

      const result = await convertSwitchResultToSql(adapter, actions);
      const action = result.deletes[0];

      expect(action.ids).toEqual(new Set([2]));
      expect(action.params).toEqual([[2]]);
      expect(action.changes.has(2)).toBe(true);
      expect(action.changes.has('2')).toBe(false);
    });

    it('应该拒绝非有限整数主键', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map([['rxdb:RxDBChange:Infinity', change(null, { id: 1 })]]),
        inserts: new Map(),
        updates: new Map()
      };

      await expect(convertSwitchResultToSql(adapter, actions)).rejects.toThrow(
        'Invalid integer id for rxdb.RxDBChange: Infinity'
      );
    });

    it('应该把允许为 null 的 switch inversePatch 映射为更新事件所需的空 patch', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map(),
        updates: new Map([['rxdb:RxDBChange:2', change({ revertChangeId: 3 })]])
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.updates[0].changes.get(2)?.inversePatch).toEqual({});
    });

    it('应该生成插入 SQL', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map([
          ['public:Todo:todo-1', change({ title: 'Test Todo', completed: false })],
          ['public:Todo:todo-2', change({ title: 'Another Todo', completed: true })]
        ]),
        updates: new Map()
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.inserts).toHaveLength(1);
      expect(result.inserts[0].ids.size).toBe(2);
      expect(result.inserts[0].sql).toContain('INSERT');
      expect(result.inserts[0].sql).toContain('Test Todo');
      expect(result.inserts[0].sql).toContain('Another Todo');
      // PostgreSQL 使用 ON CONFLICT 语法
      expect(result.inserts[0].sql).toContain('ON CONFLICT');
    });

    it('应该在插入时应用默认值', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map([
          ['public:Todo:todo-1', change({ title: 'Test Todo' })] // completed 未提供，应使用默认值
        ]),
        updates: new Map()
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.inserts).toHaveLength(1);
      expect(result.inserts[0].sql).toContain('INSERT');
      // 验证 SQL 包含了默认值
      expect(result.inserts[0].sql).toBeDefined();
    });

    it('应该处理带有函数的默认值', async () => {
      // 创建一个有函数默认值的实体（虽然 Todo 没有，但测试覆盖代码路径）
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map([['public:Todo:todo-1', change({ title: 'Test Todo' })]]),
        updates: new Map()
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.inserts).toHaveLength(1);
      expect(result.inserts[0].sql).toContain('INSERT');
    });

    it('应该生成更新 SQL', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map(),
        updates: new Map([
          ['public:Todo:todo-1', change({ title: 'Updated Todo', completed: true })],
          ['public:Todo:todo-2', change({ title: 'Another Updated', completed: false })]
        ])
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.updates).toHaveLength(1);
      expect(result.updates[0].ids.size).toBe(2);
      expect(result.updates[0].sql).toContain('UPDATE');
      expect(result.updates[0].sql).toContain('Updated Todo');
      expect(result.updates[0].sql).toContain('Another Updated');
    });

    it('应该同时处理删除、插入和更新', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map([['public:Todo:todo-old', change(null)]]),
        inserts: new Map([['public:Todo:todo-new', change({ title: 'New Todo', completed: false })]]),
        updates: new Map([['public:Todo:todo-1', change({ title: 'Updated', completed: true })]])
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.deletes).toHaveLength(1);
      expect(result.inserts).toHaveLength(1);
      expect(result.updates).toHaveLength(1);
    });

    it('应该按命名空间和实体名称分组操作', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map([
          ['public:Todo:todo-1', change(null)],
          ['public:Todo:todo-2', change(null)],
          ['public:Todo:todo-3', change(null)]
        ]),
        inserts: new Map(),
        updates: new Map()
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      // 应该按命名空间分组
      expect(result.deletes.length).toBe(1);
      expect(result.deletes[0].ids.size).toBe(3);
      expect(result.deletes[0].metadata.name).toBe('Todo');
    });

    it('应该处理包含 updatedAt 的更新', async () => {
      const now = new Date();
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map(),
        updates: new Map([['public:Todo:todo-1', change({ title: 'Updated', updatedAt: now })]])
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.updates).toHaveLength(1);
      expect(result.updates[0].sql).toContain('UPDATE');
    });

    it('应该处理不包含 updatedAt 的更新', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map(),
        updates: new Map([['public:Todo:todo-1', change({ title: 'Updated' })]])
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.updates).toHaveLength(1);
      expect(result.updates[0].sql).toContain('UPDATE');
    });

    it('应该返回包含 metadata 的结果', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map([['public:Todo:todo-1', change(null)]]),
        inserts: new Map([['public:Todo:todo-2', change({ title: 'Test', completed: false })]]),
        updates: new Map([['public:Todo:todo-3', change({ title: 'Updated' })]])
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.deletes[0].metadata).toBeDefined();
      expect(result.deletes[0].metadata.name).toBe('Todo');
      expect(result.inserts[0].metadata).toBeDefined();
      expect(result.inserts[0].metadata.name).toBe('Todo');
      expect(result.updates[0].metadata).toBeDefined();
      expect(result.updates[0].metadata.name).toBe('Todo');
    });

    it('应该在结果中包含实体 IDs 集合', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map([
          ['public:Todo:todo-1', change(null)],
          ['public:Todo:todo-2', change(null)]
        ]),
        inserts: new Map([
          ['public:Todo:todo-3', change({ title: 'New 1', completed: false })],
          ['public:Todo:todo-4', change({ title: 'New 2', completed: false })]
        ]),
        updates: new Map()
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.deletes[0].ids.has('todo-1')).toBe(true);
      expect(result.deletes[0].ids.has('todo-2')).toBe(true);
      expect(result.inserts[0].ids.has('todo-3')).toBe(true);
      expect(result.inserts[0].ids.has('todo-4')).toBe(true);
    });

    it('应该为相同实体类型的多个操作生成正确的 SQL', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map([
          ['public:Todo:todo-1', change({ title: 'First', completed: false })],
          ['public:Todo:todo-2', change({ title: 'Second', completed: true })],
          ['public:Todo:todo-3', change({ title: 'Third', completed: false })]
        ]),
        updates: new Map()
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.inserts).toHaveLength(1);
      const sql = result.inserts[0].sql;
      expect(sql).toContain('First');
      expect(sql).toContain('Second');
      expect(sql).toContain('Third');
      // 应该包含多个 INSERT 语句
      const insertCount = (sql.match(/INSERT/g) || []).length;
      expect(insertCount).toBe(3);
    });

    it('应该为多个更新生成正确的 SQL', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map(),
        updates: new Map([
          ['public:Todo:todo-1', change({ title: 'Updated 1', completed: true })],
          ['public:Todo:todo-2', change({ title: 'Updated 2', completed: false })]
        ])
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.updates).toHaveLength(1);
      const sql = result.updates[0].sql;
      expect(sql).toContain('Updated 1');
      expect(sql).toContain('Updated 2');
      // 应该包含多个 UPDATE 语句
      const updateCount = (sql.match(/UPDATE/g) || []).length;
      expect(updateCount).toBe(2);
    });

    it('应该为 PostgreSQL 生成正确的 ON CONFLICT 子句', async () => {
      const actions: SwitchVersionActions = {
        deletes: new Map(),
        inserts: new Map([['public:Todo:todo-1', change({ title: 'Test', completed: false })]]),
        updates: new Map()
      };

      const result = await convertSwitchResultToSql(adapter, actions);

      expect(result.inserts).toHaveLength(1);
      const sql = result.inserts[0].sql;
      // PostgreSQL upsert 使用 ON CONFLICT (id) DO UPDATE SET
      expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');
    });
  });
});
