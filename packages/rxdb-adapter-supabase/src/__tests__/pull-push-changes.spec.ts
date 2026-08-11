/**
 * Supabase 适配器 Pull/Push 测试（TDD Red Phase）
 *
 * 测试 RxDBAdapterSupabase 的 pullChanges 和 pushChanges 方法
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000088';

// 缺少 Supabase 测试环境时由构造或连接阶段直接失败
describe('RxDBAdapterSupabase Pull/Push', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterSupabase;

  beforeAll(async () => {
    rxdb = new RxDB({
      context: { userId: TEST_USER_ID },
      dbName: 'test-push-db',
      entities: [Todo],
      sync: {
        remote: {
          adapter: 'supabase'
        },
        type: SyncType.None
      }
    });

    // 注册 Supabase 远程适配器
    rxdb.adapter(
      'supabase',
      async db =>
        new RxDBAdapterSupabase(db, {
          supabaseUrl: SUPABASE_URL,
          supabaseKey: SUPABASE_KEY
        })
    );

    rxdb.init();
    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();
  });

  // ========================================
  // T023: pullChanges 测试
  // ========================================
  describe('pullChanges (T023)', () => {
    it('pullChanges 方法应该存在', () => {
      expect(typeof adapter.pullChanges).toBe('function');
    });

    it('应该返回 RxDBChange 数组', async () => {
      const sinceId = 0;
      const result = await adapter.pullChanges(sinceId);

      expect(Array.isArray(result)).toBe(true);
    });

    it('应该使用 sinceId 参数过滤变更', async () => {
      // 使用一个很大的 ID（在 PostgreSQL integer 范围内），应该没有更新的变更
      const futureId = 2147483647; // PostgreSQL integer max
      const result = await adapter.pullChanges(futureId);

      expect(result.length).toBe(0);
    });

    it('应该尊重 limit 参数', async () => {
      const sinceId = 0;
      const limit = 5;
      const result = await adapter.pullChanges(sinceId, limit);

      expect(result.length).toBeLessThanOrEqual(limit);
    });

    it('应该按 id ASC 排序', async () => {
      const sinceId = 0;
      const result = await adapter.pullChanges(sinceId);

      if (result.length > 1) {
        for (let i = 1; i < result.length; i++) {
          expect(result[i].id).toBeGreaterThan(result[i - 1].id);
        }
      }
    });

    it('返回的变更应该包含必要字段', async () => {
      const sinceId = 0;
      const result = await adapter.pullChanges(sinceId, 1);

      if (result.length > 0) {
        const change = result[0];
        expect(change).toHaveProperty('namespace');
        expect(change).toHaveProperty('entity');
        expect(change).toHaveProperty('entityId');
        expect(change).toHaveProperty('type');
        expect(change).toHaveProperty('patch');
        expect(change).toHaveProperty('createdAt');
      }
    });
  });

  // ========================================
  // T034: mergeChanges 测试（Push 核心方法）
  // ========================================
  describe('mergeChanges (T034)', () => {
    it('应该能通过 mergeChanges 推送 INSERT', async () => {
      const todoId = crypto.randomUUID();
      const actions = {
        inserts: new Map([
          [
            `public:Todo:${todoId}`,
            {
              patch: { id: todoId, title: 'Test mergeChanges', completed: false },
              inversePatch: null
            }
          ]
        ]),
        updates: new Map(),
        deletes: new Map()
      };

      await adapter.mergeChanges(actions);

      // 验证远程有数据
      const { data } = await adapter.client.from('todos').select('*').eq('id', todoId).single();
      expect(data).toBeDefined();
      expect(data?.title).toBe('Test mergeChanges');

      // 清理
      await adapter.client.from('todos').delete().eq('id', todoId);
      await adapter.client.from('rxdb_change').delete().eq('entityId', todoId);
    });

    it('应该能通过 mergeChanges 推送 UPDATE', async () => {
      // 先创建测试数据
      const todoId = crypto.randomUUID();
      await adapter.client.from('todos').insert({
        id: todoId,
        title: 'Original',
        completed: false
      });

      // 推送 UPDATE
      const actions = {
        inserts: new Map(),
        updates: new Map([
          [
            `public:Todo:${todoId}`,
            {
              patch: { title: 'Updated via mergeChanges' },
              inversePatch: { title: 'Original' }
            }
          ]
        ]),
        deletes: new Map()
      };

      await adapter.mergeChanges(actions);

      // 验证更新
      const { data } = await adapter.client.from('todos').select('*').eq('id', todoId).single();
      expect(data?.title).toBe('Updated via mergeChanges');

      // 清理
      await adapter.client.from('todos').delete().eq('id', todoId);
      await adapter.client.from('rxdb_change').delete().eq('entityId', todoId);
    });

    it('应该能通过 mergeChanges 推送 DELETE', async () => {
      // 先创建测试数据
      const todoId = crypto.randomUUID();
      await adapter.client.from('todos').insert({
        id: todoId,
        title: 'To Delete',
        completed: false
      });

      // 推送 DELETE
      const actions = {
        inserts: new Map(),
        updates: new Map(),
        deletes: new Map([
          [
            `public:Todo:${todoId}`,
            {
              patch: null,
              inversePatch: { id: todoId, title: 'To Delete', completed: false }
            }
          ]
        ])
      };

      await adapter.mergeChanges(actions);

      // 验证删除
      const { data } = await adapter.client.from('todos').select('*').eq('id', todoId).maybeSingle();
      expect(data).toBeNull();

      // 清理 RxDBChange
      await adapter.client.from('rxdb_change').delete().eq('entityId', todoId);
    });

    it('应该同时写入 RxDBChange 表和实体表', async () => {
      const todoId = crypto.randomUUID();
      const actions = {
        inserts: new Map([
          [
            `public:Todo:${todoId}`,
            {
              patch: { id: todoId, title: 'Dual Write Test', completed: false },
              inversePatch: null
            }
          ]
        ]),
        updates: new Map(),
        deletes: new Map()
      };

      await adapter.mergeChanges(actions);

      // 验证 RxDBChange 表有记录
      const { data: changeRecords } = await adapter.client
        .from('rxdb_change')
        .select('*')
        .eq('entityId', todoId)
        .limit(1);

      expect(changeRecords?.length).toBe(1);
      expect(changeRecords?.[0].type).toBe('INSERT');

      // 清理
      await adapter.client.from('todos').delete().eq('id', todoId);
      await adapter.client.from('rxdb_change').delete().eq('entityId', todoId);
    });
  });

  // ========================================
  // T020: repositoryFilter 测试 (Repository-Level Sync)
  // ========================================
  describe('pullChanges with repositoryFilter (T020)', () => {
    it('应该支持 repositoryFilter 参数过滤实体', async () => {
      const sinceId = 0;
      // 只拉取 Todo 实体的变更
      const result = await adapter.pullChanges(sinceId, 100, ['Todo']);

      // 所有返回的变更必须是 Todo 实体
      result.forEach(change => {
        expect(change.entity).toBe('Todo');
      });
    });

    it('repositoryFilter 为空数组时应该返回所有实体', async () => {
      const sinceId = 0;
      const resultAll = await adapter.pullChanges(sinceId, 100);
      const resultFiltered = await adapter.pullChanges(sinceId, 100, []);

      // 空数组等同于无过滤
      expect(resultFiltered.length).toBe(resultAll.length);
    });

    it('repositoryFilter 支持多个实体', async () => {
      const sinceId = 0;
      // 如果有其他实体（如 User），可以测试多实体过滤
      const result = await adapter.pullChanges(sinceId, 100, ['Todo', 'RxDBBranch']);

      // 所有返回的变更必须在过滤列表中
      result.forEach(change => {
        expect(['Todo', 'RxDBBranch']).toContain(change.entity);
      });
    });

    it('repositoryFilter 不存在的实体应立即失败', async () => {
      await expect(adapter.pullChanges(0, 100, ['NonExistentEntity'])).rejects.toThrow(
        'Entity "NonExistentEntity" is not configured'
      );
    });

    it('repositoryFilter 应该与 limit 参数协同工作', async () => {
      const sinceId = 0;
      const limit = 5;
      const result = await adapter.pullChanges(sinceId, limit, ['Todo']);

      expect(result.length).toBeLessThanOrEqual(limit);
      result.forEach(change => {
        expect(change.entity).toBe('Todo');
      });
    });
  });
});
