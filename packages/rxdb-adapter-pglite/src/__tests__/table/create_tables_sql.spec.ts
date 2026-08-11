import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { ENTITIES, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { create_tables_sql } from '../../table/create_tables_sql.js';

/** 仅用于测试 enum CHECK 约束的最小实体 */
@Entity({
  name: 'EnumOnly',
  tableName: 'enum_only',
  properties: [
    { name: 'status', type: PropertyType.enum, enum: ['active', 'inactive', 'pending'], nullable: true },
    { name: 'kind', type: PropertyType.enum, enum: ['A', 'B'], nullable: false },
    { name: 'title', type: PropertyType.string }
  ]
})
class EnumOnly extends EntityBase {}
describe('create_tables_sql', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `create-tables-test-${Date.now()}`,
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

  describe('基本功能', () => {
    it('应该生成单个表的创建 SQL', async () => {
      const sql = await create_tables_sql(adapter, [Todo]);

      // 应该包含 CREATE TABLE 语句
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('"public"."todos"');

      // 应该包含触发器创建语句(Todo 默认 log=true)
      expect(sql).toContain('CREATE OR REPLACE FUNCTION');
      expect(sql).toContain('todos_change_trigger');
    });

    it('应该生成多个表的创建 SQL', async () => {
      const sql = await create_tables_sql(adapter, [User, Todo]);

      // 应该包含两个表的 CREATE TABLE
      expect(sql).toContain('"shop"."user"');
      expect(sql).toContain('"public"."todos"');

      // 应该包含两个表的触发器
      expect(sql).toContain('user_change_trigger');
      expect(sql).toContain('todos_change_trigger');
    });

    it('应该为 log=false 的实体跳过触发器', async () => {
      // RxDBChange 和 RxDBBranch 是系统表，log=false
      const allEntities = adapter.rxdb.config.entities;
      const sql = await create_tables_sql(adapter, allEntities);

      // 应该包含所有表
      expect(sql).toContain('"shop"."user"');
      expect(sql).toContain('"rxdb"."rxdb_change"');

      // RxDBChange 不应该有触发器
      expect(sql).not.toContain('rxdb_change_change_trigger');
    });
  });

  describe('初始数据插入', () => {
    it('应该生成初始数据的 INSERT 语句', async () => {
      const initialUser = new User();
      initialUser.name = 'Test User';
      initialUser.age = 25;

      const sql = await create_tables_sql(adapter, [User], [initialUser]);

      // 应该包含表创建
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('"shop"."user"');

      // 应该包含 INSERT 语句
      expect(sql).toContain('INSERT INTO');
      expect(sql).toContain('Test User');
    });

    it('应该支持多个实体的初始数据', async () => {
      const user = new User();
      user.name = 'User 1';
      user.age = 30;

      const todo = new Todo();
      todo.title = 'Todo 1';
      todo.completed = false;

      const sql = await create_tables_sql(adapter, [User, Todo], [user, todo]);

      // 应该包含两个实体的数据
      expect(sql).toContain('User 1');
      expect(sql).toContain('Todo 1');
    });

    it('应该按实体类型分组插入数据', async () => {
      const user1 = new User();
      user1.name = 'User 1';
      user1.age = 25;

      const user2 = new User();
      user2.name = 'User 2';
      user2.age = 30;

      const sql = await create_tables_sql(adapter, [User], [user1, user2]);

      // 应该生成批量 INSERT (一个 INSERT 语句包含多行)
      expect(sql).toContain('INSERT INTO');
      expect(sql).toContain('User 1');
      expect(sql).toContain('User 2');
    });
  });

  describe('边界情况', () => {
    it('应该处理空的 EntityTypes 数组', async () => {
      const sql = await create_tables_sql(adapter, []);

      // 空数组应该返回空字符串或只有换行
      expect(sql.trim()).toBe('');
    });

    it('应该处理没有初始数据的情况', async () => {
      const sql = await create_tables_sql(adapter, [Todo]);

      // 应该包含表和触发器，但不包含用户数据的 INSERT
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION');
      // 触发器中会有 INSERT INTO RxDBChange,但不应该有 Todo 表的数据插入
      expect(sql).not.toMatch(/INSERT INTO "public"\."todos"/);
    });

    it('应该处理初始数据为空数组', async () => {
      const sql = await create_tables_sql(adapter, [Todo], []);

      // 应该包含表和触发器，但不包含用户数据的 INSERT
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('CREATE OR REPLACE FUNCTION');
      // 触发器中会有 INSERT INTO RxDBChange,但不应该有 Todo 表的数据插入
      expect(sql).not.toMatch(/INSERT INTO "public"\."todos"/);
    });
  });

  describe('SQL 语句顺序', () => {
    it('应该按正确顺序生成 SQL: CREATE TABLE -> CREATE TRIGGER -> INSERT', async () => {
      const user = new User();
      user.name = 'User 1';
      user.age = 25;

      const sql = await create_tables_sql(adapter, [User], [user]);

      const createTableIndex = sql.indexOf('CREATE TABLE');
      const createTriggerIndex = sql.indexOf('CREATE OR REPLACE FUNCTION');
      const insertIndex = sql.indexOf('INSERT INTO');

      // 顺序应该是: CREATE TABLE < CREATE TRIGGER < INSERT
      expect(createTableIndex).toBeGreaterThan(-1);
      expect(createTriggerIndex).toBeGreaterThan(createTableIndex);
      expect(insertIndex).toBeGreaterThan(createTriggerIndex);
    });
  });

  describe('enum 列 CHECK 约束', () => {
    it('应该为 enum 列生成 CHECK 约束', async () => {
      const sql = await create_tables_sql(adapter, [EnumOnly]);
      expect(sql).toContain(`CHECK ("status" IN ('active', 'inactive', 'pending'))`);
      expect(sql).toContain(`CHECK ("kind" IN ('A', 'B'))`);
    });

    it('nullable enum 列不应该包含 NOT NULL 约束', async () => {
      const sql = await create_tables_sql(adapter, [EnumOnly]);
      // status 列有 nullable: true，不得出现 NOT NULL
      expect(sql).not.toMatch(/"status" varchar NOT NULL/);
    });

    it('非 nullable enum 列应该包含 NOT NULL 约束', async () => {
      const sql = await create_tables_sql(adapter, [EnumOnly]);
      // kind 列 nullable: false，应有 NOT NULL
      expect(sql).toMatch(/"kind" varchar NOT NULL/);
    });

    it('CHECK 约束应该在 CREATE TABLE 语句内', async () => {
      const sql = await create_tables_sql(adapter, [EnumOnly]);
      const createTableStart = sql.indexOf('CREATE TABLE');
      const createTableEnd = sql.indexOf(');', createTableStart);
      const checkIndex = sql.indexOf(`CHECK ("status" IN`, createTableStart);
      expect(checkIndex).toBeGreaterThan(createTableStart);
      expect(checkIndex).toBeLessThan(createTableEnd);
    });
  });
});
