import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { ENTITIES, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { remove_all_triggers_sql, remove_trigger_sql } from '../../table/remove_trigger_sql.js';

describe('remove_trigger_sql', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `remove-trigger-test-${Date.now()}`,
      context: { userId: 'test-user' },
      entities: [...ENTITIES, Todo],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });

    rxdb.adapter('pglite', async db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });

    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    if (rxdb) {
      await rxdb.disconnectAll();
    }
  });

  beforeEach(async () => {
    // 清空测试数据（保留表结构和触发器）
    await adapter.query('DELETE FROM "shop"."user"');
    await adapter.query('DELETE FROM "public"."todos"');
  });

  describe('remove_trigger_sql (单个实体)', () => {
    it('应该生成删除触发器函数的 SQL', () => {
      const metadata = getEntityMetadata(Todo);
      const sql = remove_trigger_sql(metadata);

      expect(sql).toContain('DROP FUNCTION IF EXISTS');
      expect(sql).toContain('"public"."todos_change_trigger_fn"');
      expect(sql).toContain('CASCADE'); // 删除函数时级联删除依赖的触发器
    });

    it('应该生成删除触发器的 SQL', () => {
      const metadata = getEntityMetadata(Todo);
      const sql = remove_trigger_sql(metadata);

      expect(sql).toContain('DROP TRIGGER IF EXISTS');
      expect(sql).toContain('"todos_change_trigger"');
      expect(sql).toContain('ON "public"."todos"');
    });

    it('应该返回两个独立的 SQL 语句(用分隔符分隔)', () => {
      const metadata = getEntityMetadata(Todo);
      const sql = remove_trigger_sql(metadata);

      const statements = sql.split('---STATEMENT_SEPARATOR---');
      expect(statements.length).toBe(2);

      // 第一条: DROP TRIGGER
      expect(statements[0].trim()).toContain('DROP TRIGGER');

      // 第二条: DROP FUNCTION
      expect(statements[1].trim()).toContain('DROP FUNCTION');
    });

    it('应该使用正确的命名空间和表名', () => {
      const metadata = getEntityMetadata(User);
      const sql = remove_trigger_sql(metadata);

      expect(sql).toContain('"shop"."user"'); // 表名
      expect(sql).toContain('"shop"."user_change_trigger_fn"'); // 函数名
      expect(sql).toContain('"user_change_trigger"'); // 触发器名
    });
  });

  describe('remove_all_triggers_sql (所有实体)', () => {
    it('应该为所有 log=true 的实体生成删除 SQL', () => {
      const sql = remove_all_triggers_sql(adapter);

      // 应该包含 Todo 和 User 的触发器删除语句
      expect(sql).toContain('"todos_change_trigger"');
      expect(sql).toContain('"user_change_trigger"');
      expect(sql).toContain('"todos_change_trigger_fn"');
      expect(sql).toContain('"user_change_trigger_fn"');
    });

    it('应该跳过 log=false 的系统表', () => {
      const sql = remove_all_triggers_sql(adapter);

      // 不应包含 RxDBChange 和 RxDBBranch 的触发器
      expect(sql).not.toContain('rxdb_change_change_trigger');
      expect(sql).not.toContain('rxdb_branch_change_trigger');
    });

    it('应该返回可以直接执行的 SQL 字符串', () => {
      const sql = remove_all_triggers_sql(adapter);

      expect(sql).toBeTruthy();
      expect(typeof sql).toBe('string');

      // 每个实体应该有触发器和函数的删除语句
      const statements = sql.split('---STATEMENT_SEPARATOR---');
      // 2 实体 × 2 语句(DROP TRIGGER + DROP FUNCTION) = 4
      expect(statements.length).toBeGreaterThanOrEqual(4);
    });

    it('应该能够在数据库中执行(集成测试)', async () => {
      const sql = remove_all_triggers_sql(adapter);

      // 分割并执行每个语句 - 每个语句是一条 SQL
      const statements = sql
        .split('---STATEMENT_SEPARATOR---')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      // 执行所有 DROP 语句
      for (const statement of statements) {
        // PGlite adapter 的 query() 方法执行单条语句
        await expect(adapter.query(statement)).resolves.toBeDefined();
      }

      // 验证触发器已被删除 - 再次删除应该不抛出错误(IF EXISTS)
      for (const statement of statements) {
        await expect(adapter.query(statement)).resolves.toBeDefined();
      }
    });
  });

  describe('边界情况', () => {
    it('应该处理只有系统表的情况', () => {
      // 系统表 (log=false) 不应该生成触发器删除语句
      const sql = remove_all_triggers_sql(adapter);

      expect(sql).not.toContain('rxdb_change');
      expect(sql).not.toContain('rxdb_branch');
    });
  });
});
