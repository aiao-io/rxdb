/**
 * @fileoverview RxDBAdapterSupabase.utils 单元测试
 *
 * 测试 group_by_type / build_upsert_params / build_delete_params。
 * 纯单元测试，不依赖 Supabase 连接。
 */

import { RxDB, SyncType, type EntityType, type IRxDBAdapter } from '@aiao/rxdb';
import { Todo, TypeDemo } from '@aiao/rxdb-test/entities';
import { Category, ENTITIES, User } from '@aiao/rxdb-test/shop';
import { beforeAll, describe, expect, it } from 'vitest';
import { build_delete_params, build_upsert_params, group_by_type } from '../RxDBAdapterSupabase.utils.js';

function makeMockSqliteAdapter(): IRxDBAdapter {
  const noop = () => undefined;
  const asyncNoop = async () => undefined;
  return {
    init: noop,
    create: noop,
    destroy: noop,
    internalQuery: noop,
    getRepository: () => ({
      find: async () => [],
      count: async () => 0,
      create: asyncNoop,
      update: asyncNoop,
      remove: asyncNoop
    })
  } as unknown as IRxDBAdapter;
}

function groupEntities<T extends EntityType>(entities: InstanceType<T>[]): Map<T, Set<InstanceType<T>>> {
  return group_by_type<T>(entities) as unknown as Map<T, Set<InstanceType<T>>>;
}

describe('RxDBAdapterSupabase.utils', () => {
  beforeAll(() => {
    const rxdb = new RxDB({
      dbName: 'utils-unit-test',
      entities: [Todo, TypeDemo, ...ENTITIES],
      sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
    });
    rxdb.adapter('sqlite', () => makeMockSqliteAdapter());
    rxdb.init();
  });
  // ============================================
  // group_by_type
  // ============================================
  describe('group_by_type', () => {
    it('空数组返回空 Map', () => {
      const result = group_by_type([]);
      expect(result.size).toBe(0);
    });

    it('同类型实体归为同一组', () => {
      const t1 = new Todo({ title: 'a' });
      const t2 = new Todo({ title: 'b' });
      const result = group_by_type([t1, t2]);

      expect(result.size).toBe(1);
      expect(result.get(Todo)!.size).toBe(2);
    });

    it('不同类型实体分别归组', () => {
      const todo = new Todo({ title: 'x' });
      const user = new User();
      const result = groupEntities<typeof Todo | typeof User>([todo, user]);

      expect(result.size).toBe(2);
      expect(result.get(Todo)!.size).toBe(1);
      expect(result.get(User)!.size).toBe(1);
    });

    it('三种类型分别归组', () => {
      const todo = new Todo({ title: 'x' });
      const user = new User();
      const cat = new Category();
      const result = groupEntities<typeof Todo | typeof User | typeof Category>([todo, user, cat]);

      expect(result.size).toBe(3);
    });

    it('同一实体实例不重复（Set 语义）', () => {
      const t = new Todo({ title: 'single' });
      // group_by_type 内部使用 Set，相同引用不会重复
      const result = group_by_type([t, t]);
      // Set 会对相同引用去重。
      expect(result.get(Todo)!.size).toBe(1);
    });
  });

  // ============================================
  // build_upsert_params
  // ============================================
  describe('build_upsert_params', () => {
    it('空 Map 返回空数组', () => {
      const result = build_upsert_params(new Map());
      expect(result).toEqual([]);
    });

    it('单个实体类型：table/schema 正确', () => {
      const todo = new Todo({ title: 'test' });
      const map = groupEntities<typeof Todo>([todo]);
      const result = build_upsert_params(map);

      expect(result).toHaveLength(1);
      expect(result[0].table).toBe('todos');
      expect(result[0].schema).toBe('public');
    });

    it('data 包含实体数据', () => {
      const todo = new Todo({ title: 'hello' });
      const map = groupEntities<typeof Todo>([todo]);
      const result = build_upsert_params(map);

      expect(result[0].data).toHaveLength(1);
      expect(result[0].data[0]['id']).toBe(todo.id);
    });

    it('插入语义：createdBy/updatedBy 都注入', () => {
      const todo = new Todo({ title: 'inject' });
      const map = groupEntities<typeof Todo>([todo]);
      const result = build_upsert_params(map, 'user-123', 'insert');

      const row = result[0].data[0];
      expect(row['createdBy']).toBe('user-123');
      expect(row['updatedBy']).toBe('user-123');
    });

    /**
     * 服务端 `rxdb_batch_upsert` 是 `ON CONFLICT (id) DO UPDATE SET <除 id 外全部键>`，
     * 更新已存在的行时把 `createdBy` 一起送上去 = 原作者被当前用户覆写。
     * 若 RLS 依赖 `createdBy` 判归属，这等于**所有权转移**。
     * `mergeChanges` 一直是对的（更新只注 `updatedBy`），此处必须对齐。
     */
    it('更新语义：只注入 updatedBy，绝不下发 createdBy', () => {
      const todo = new Todo({ title: 'inject' });
      const map = groupEntities<typeof Todo>([todo]);
      const result = build_upsert_params(map, 'user-123', 'update');

      const row = result[0].data[0];
      expect(row['updatedBy']).toBe('user-123');
      expect('createdBy' in row).toBe(false);
    });

    it('更新语义下，实体自带的 createdBy 也不会被下发', () => {
      const todo = new Todo({ title: 'owned' });
      (todo as unknown as Record<string, unknown>)['createdBy'] = 'original-author';
      const map = groupEntities<typeof Todo>([todo]);
      const result = build_upsert_params(map, 'user-123', 'update');

      // 不下发该列，服务端 DO UPDATE SET 就不会碰它，原作者得以保留
      expect('createdBy' in result[0].data[0]).toBe(false);
    });

    it('不传 userId 时不覆盖 createdBy/updatedBy', () => {
      const todo = new Todo({ title: 'no-inject' });
      const map = groupEntities<typeof Todo>([todo]);
      const result = build_upsert_params(map);

      const row = result[0].data[0];
      // 没有注入 userId 时，字段由实体自身决定（不被强制覆盖）
      expect(row['createdBy']).toBeUndefined();
    });

    it('多个实体生成多条 data', () => {
      const todos = [new Todo({ title: 'a' }), new Todo({ title: 'b' }), new Todo({ title: 'c' })];
      const map = groupEntities<typeof Todo>(todos);
      const result = build_upsert_params(map);

      expect(result[0].data).toHaveLength(3);
    });
  });

  // ============================================
  // build_delete_params
  // ============================================
  describe('build_delete_params', () => {
    it('空 Map 返回空数组', () => {
      const result = build_delete_params(new Map());
      expect(result).toEqual([]);
    });

    it('单个实体类型：table/schema/ids 正确', () => {
      const todo = new Todo({ title: 'del' });
      const map = groupEntities<typeof Todo>([todo]);
      const result = build_delete_params(map);

      expect(result).toHaveLength(1);
      expect(result[0].table).toBe('todos');
      expect(result[0].schema).toBe('public');
      expect(result[0].ids).toEqual([todo.id]);
    });

    it('多个实体的 ids 全部包含', () => {
      const todos = [new Todo({ title: 'a' }), new Todo({ title: 'b' })];
      const map = groupEntities<typeof Todo>(todos);
      const result = build_delete_params(map);

      expect(result[0].ids).toHaveLength(2);
      expect(result[0].ids).toContain(todos[0].id);
      expect(result[0].ids).toContain(todos[1].id);
    });

    it('不同类型分组后各自有独立 ids', () => {
      const todo = new Todo({ title: 'todo' });
      const user = new User();
      user.name = 'Alice';

      const map = groupEntities<typeof Todo | typeof User>([todo, user]);
      const result = build_delete_params(map);

      expect(result).toHaveLength(2);
      const todoGroup = result.find(r => r.table === 'todos');
      const userGroup = result.find(r => r.table === 'user');
      expect(todoGroup?.ids).toEqual([todo.id]);
      expect(userGroup?.ids).toEqual([user.id]);
    });
  });
});
