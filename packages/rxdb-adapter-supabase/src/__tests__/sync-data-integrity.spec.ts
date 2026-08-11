/**
 * Pull/Push 数据完整性测试
 *
 * 重点验证 Supabase 数据库中的真实数据：
 * 1. RxDBChange 表的 remoteId 字段正确性
 * 2. RxDBSync 的 lastPushedChangeId 和 lastPullRemoteChangeId
 * 3. Push 后远程 RxDBChange 表的记录
 * 4. Pull 后本地 RxDBChange 表的 remoteId
 *
 * 注意：RxDB 是单例模式，测试使用唯一的 dbName 避免干扰
 */
import { encodeRxDBChangeEntityId, RxDB, RxDBChange, RxDBSync, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { cleanupSqliteAdapter, LOCAL_RXDB_SYNC_TABLE } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000002';
const changeEntityIdQueryValues = (id: string): string[] => [id, encodeRxDBChangeEntityId(id)];

describe('Pull/Push 数据完整性测试', () => {
  const testPrefix = `data-integrity-${Date.now()}`;
  let rxdb: RxDB;
  let remoteAdapter: RxDBAdapterSupabase;
  let localAdapter: RxDBAdapterWaSqlite;

  async function cleanupRemoteData(adapter: RxDBAdapterSupabase) {
    try {
      // todos 上有 change 触发器：必须先删实体，再清 rxdb_change，否则会残留 DELETE change
      await adapter.client.from('todos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await adapter.client.from('rxdb_change').delete().neq('id', 0);
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }

  async function cleanupLocalChanges() {
    await cleanupSqliteAdapter(localAdapter);
  }

  async function insertRemoteData(data: { id: string; title: string }) {
    const { error } = await remoteAdapter.client.from('todos').insert({
      id: data.id,
      title: data.title,
      completed: false,
      createdBy: 'remote-client',
      updatedBy: 'remote-client',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (error) throw error;

    const { data: changeData, error: changeError } = await remoteAdapter.client
      .from('rxdb_change')
      .insert({
        namespace: 'public',
        entity: 'Todo',
        entityId: data.id,
        type: 'INSERT',
        patch: { id: data.id, title: data.title, completed: false },
        clientId: 'remote-client',
        createdAt: new Date().toISOString()
      })
      .select('id')
      .single();

    if (changeError) throw changeError;
    return changeData?.id;
  }

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `data-integrity-test-${Date.now()}`,
      context: { userId: TEST_USER_ID },
      entities: [Todo],
      sync: {
        local: { adapter: 'wa-sqlite' },
        remote: { adapter: 'supabase' },
        type: SyncType.None
      }
    });

    rxdb.adapter(
      'wa-sqlite',
      db =>
        new RxDBAdapterWaSqlite(db, {
          vfs: 'MemoryAsyncVFS',
          async: true,
          worker: false,
          wasmPath: asyncWasmPath
        })
    );

    rxdb.adapter(
      'supabase',
      async db =>
        new RxDBAdapterSupabase(db, {
          supabaseUrl: SUPABASE_URL,
          supabaseKey: SUPABASE_KEY
        })
    );

    await rxdb.connect('wa-sqlite');
    remoteAdapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    localAdapter = (await rxdb.getAdapter('wa-sqlite')) as RxDBAdapterWaSqlite;

    // 确保 RxDBSync 表包含所有必需列（迁移兼容处理）。
    const columns = [
      'lastPushedChangeId INTEGER',
      'lastPushedAt TEXT',
      'lastPullRemoteChangeId INTEGER',
      'lastPulledAt TEXT'
    ];
    for (const col of columns) {
      try {
        await localAdapter.internalQuery(`ALTER TABLE ${LOCAL_RXDB_SYNC_TABLE} ADD COLUMN ${col};`);
      } catch {
        //
      }
    }

    // 验证表结构
    await localAdapter.internalQuery(`PRAGMA table_info(${LOCAL_RXDB_SYNC_TABLE});`);

    // 测试直接 UPDATE
    try {
      await localAdapter.internalQuery(
        `UPDATE ${LOCAL_RXDB_SYNC_TABLE} SET lastPushedChangeId = 999 WHERE id = 'test';`
      );
    } catch {
      //
    }

    await cleanupRemoteData(remoteAdapter);
  });

  afterAll(async () => {
    if (remoteAdapter) {
      await cleanupRemoteData(remoteAdapter);
    }
  });

  // ========================================
  // 1. Push 后远程数据验证
  // ========================================
  describe('Push 后远程数据验证', () => {
    it('push 后远程 RxDBChange 表应该有对应记录', async () => {
      const todo = new Todo();
      todo.title = `${testPrefix}-push-verify-1`;
      await todo.save();

      await rxdb.versionManager.push();

      // 验证远程 RxDBChange 表
      const { data: remoteChanges } = await remoteAdapter.client
        .from('rxdb_change')
        .select('*')
        .eq('entityId', todo.id)
        .order('id', { ascending: true });

      expect(remoteChanges?.length).toBeGreaterThanOrEqual(1);
      const changes = remoteChanges as unknown as Array<{
        type: string;
        entity: string;
        patch?: { title?: string };
      }>;
      const insertChange = changes.find(change => change.type === 'INSERT');
      expect(insertChange).toBeDefined();
      expect(insertChange?.entity).toBe('Todo');
      expect(insertChange?.patch?.title).toBe(`${testPrefix}-push-verify-1`);
    });

    it('push 后 lastPushedChangeId 应该更新', async () => {
      const branch = await rxdb.versionManager.getCurrentBranch();
      const repoSyncId = `public:Todo:${branch.id}`;

      const repoSyncRepo = localAdapter.getRepository(RxDBSync);
      const repoSync1 = await repoSyncRepo.findOne({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: repoSyncId }] }
      });
      const initialLastPushedId = repoSync1?.lastPushedChangeId;

      const todo = new Todo();
      todo.title = `${testPrefix}-push-lastid-1`;
      await todo.save();

      await rxdb.versionManager.push();

      // 使用直接 SQL 查询验证（绕过实体缓存）。
      const directResult = await localAdapter.internalQuery(
        `SELECT lastPushedChangeId FROM ${LOCAL_RXDB_SYNC_TABLE} WHERE id = '${repoSyncId}'`
      );
      const updatedLastPushedId = directResult?.results?.[0]?.rows?.[0]?.[0];

      expect(updatedLastPushedId).toBeGreaterThan(initialLastPushedId ?? 0);
    });

    it('push UPDATE 后远程应该有 UPDATE 类型的 RxDBChange', async () => {
      // 创建并 push
      const todo = new Todo();
      todo.title = `${testPrefix}-push-update-1`;
      await todo.save();
      await rxdb.versionManager.push();

      // 更新并 push
      todo.title = `${testPrefix}-push-update-2`;
      await todo.save();
      await rxdb.versionManager.push();

      // 验证远程有 UPDATE 类型的 change
      const { data: remoteChanges } = await remoteAdapter.client
        .from('rxdb_change')
        .select('*')
        .eq('entityId', todo.id)
        .eq('type', 'UPDATE');

      expect(remoteChanges?.length).toBeGreaterThanOrEqual(1);
      expect(remoteChanges?.[0]?.patch?.title).toBe(`${testPrefix}-push-update-2`);
    });

    it('push DELETE 后远程实体应该被删除', async () => {
      // 创建并 push
      const todo = new Todo();
      todo.title = `${testPrefix}-push-delete-1`;
      await todo.save();
      await rxdb.versionManager.push();

      // 验证远程有数据
      const { data: beforeDelete } = await remoteAdapter.client.from('todos').select('*').eq('id', todo.id);
      expect(beforeDelete?.length).toBe(1);

      // 删除并 push
      await todo.remove();
      await rxdb.versionManager.push();

      // 验证远程数据被删除
      const { data: afterDelete } = await remoteAdapter.client.from('todos').select('*').eq('id', todo.id);
      expect(afterDelete?.length).toBe(0);

      // 验证远程有 DELETE 类型的 change
      const { data: deleteChanges } = await remoteAdapter.client
        .from('rxdb_change')
        .select('*')
        .eq('entityId', todo.id)
        .eq('type', 'DELETE');
      expect(deleteChanges?.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ========================================
  // 2. Pull 后本地数据验证
  // ========================================
  describe('Pull 后本地数据验证', () => {
    it('pull 后本地 RxDBChange 表不应该有从远程拉下来的记录', async () => {
      // 清理之前测试留下的本地 changes
      await cleanupLocalChanges();
      await rxdb.versionManager.push();

      // 清理远程数据，确保测试隔离
      await cleanupRemoteData(remoteAdapter);

      // 在远程创建数据，使用完全独特的 ID
      const remoteId = crypto.randomUUID();
      const uniqueTitle = `pull-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await insertRemoteData({ id: remoteId, title: uniqueTitle });

      // 等待远程数据库事务提交
      await new Promise(resolve => setTimeout(resolve, 200));

      // 拉取。
      await rxdb.versionManager.pull();

      // 验证本地 RxDBChange 表中不应该有这条记录
      const changeRepo = localAdapter.getRepository(RxDBChange);
      const localChanges = await changeRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'entityId', operator: 'in', value: changeEntityIdQueryValues(remoteId) }]
        }
      });

      // Pull 来的数据不应该生成本地 change 记录
      expect(localChanges.length).toBe(0);

      // 但应该应用到实体表
      const todoRepo = localAdapter.getRepository(Todo);
      const todos = await todoRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: remoteId }]
        }
      });
      expect(todos.length).toBe(1);
      expect(todos[0]?.id).toBe(remoteId);
      expect(todos[0]?.title).toBe(uniqueTitle);
    });

    it('pull 后 lastPullRemoteChangeId 应该更新', async () => {
      await rxdb.versionManager.push();

      const branch = await rxdb.versionManager.getCurrentBranch();
      const repoSyncId = `public:Todo:${branch.id}`;

      // 使用直接 SQL 获取初始值。
      const initialResult = await localAdapter.internalQuery(
        `SELECT lastPullRemoteChangeId FROM ${LOCAL_RXDB_SYNC_TABLE} WHERE id = '${repoSyncId}'`
      );
      const rawInitialLastPullId = initialResult?.results?.[0]?.rows?.[0]?.[0];
      const initialLastPullId = typeof rawInitialLastPullId === 'number' ? rawInitialLastPullId : 0;

      // 远程创建数据
      const remoteId = crypto.randomUUID();
      await insertRemoteData({ id: remoteId, title: `${testPrefix}-pull-lastid-1` });

      // 拉取。
      await rxdb.versionManager.pull();

      // 使用直接 SQL 查询验证（绕过实体缓存）
      const updatedResult = await localAdapter.internalQuery(
        `SELECT lastPullRemoteChangeId FROM ${LOCAL_RXDB_SYNC_TABLE} WHERE id = '${repoSyncId}'`
      );

      // 从查询结果提取值（结构：results[0].rows[0] = [value]）。
      const row = updatedResult?.results?.[0]?.rows?.[0];
      const rawUpdatedLastPullId = Array.isArray(row) ? row[0] : null;
      const updatedLastPullId = typeof rawUpdatedLastPullId === 'number' ? rawUpdatedLastPullId : 0;

      expect(updatedLastPullId).toBeGreaterThan(initialLastPullId);
    });
    it('pull 的数据应该正确应用到本地实体表', async () => {
      await rxdb.versionManager.push();

      // 远程创建数据
      const remoteId = crypto.randomUUID();
      await insertRemoteData({ id: remoteId, title: `${testPrefix}-pull-entity-1` });

      // 拉取。
      await rxdb.versionManager.pull();

      // 使用 localAdapter 直接查询
      const TodoRepo = localAdapter.getRepository(Todo);
      const localTodos = await TodoRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: remoteId }]
        }
      });

      expect(localTodos.length).toBe(1);
      expect(localTodos[0]?.title).toBe(`${testPrefix}-pull-entity-1`);
    });
  });

  // ========================================
  // 3. remoteId 过滤验证
  // ========================================
  describe('remoteId 过滤验证', () => {
    it('pull 来的数据不应该出现在本地 RxDBChange 表中', async () => {
      // 清理之前测试留下的本地 changes
      await cleanupLocalChanges();
      await rxdb.versionManager.push();

      // 远程创建数据
      const remoteId = crypto.randomUUID();
      await insertRemoteData({ id: remoteId, title: `${testPrefix}-remoteid-filter-1` });

      // 拉取。
      await rxdb.versionManager.pull();

      // 验证本地 RxDBChange 表中不应该有这条记录
      const changeRepo = localAdapter.getRepository(RxDBChange);
      const allChanges = await changeRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'entityId', operator: 'in', value: changeEntityIdQueryValues(remoteId) }]
        }
      });

      // Pull 来的数据不应该生成任何 change 记录
      expect(allChanges.length).toBe(0);
    });

    it('本地创建的 change 应该 remoteId=null', async () => {
      const todo = new Todo();
      todo.title = `${testPrefix}-local-remoteid-1`;
      await todo.save();

      // 查询本地 RxDBChange
      const changeRepo3 = localAdapter.getRepository(RxDBChange);
      const localChanges = await changeRepo3.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'entityId', operator: 'in', value: changeEntityIdQueryValues(todo.id) }]
        }
      });

      expect(localChanges.length).toBeGreaterThanOrEqual(1);
      expect(localChanges.every(change => change.remoteId === null)).toBe(true);
    });
  });

  // ========================================
  // 4. 变更压缩后的数据验证
  // ========================================
  describe('变更压缩后的数据验证', () => {
    it('INSERT→UPDATE* 压缩实体写入并保留完整远程历史', async () => {
      await rxdb.versionManager.push();

      const todo = new Todo();
      todo.title = `${testPrefix}-compact-1`;
      await todo.save();

      todo.title = `${testPrefix}-compact-2`;
      await todo.save();

      todo.title = `${testPrefix}-compact-3`;
      await todo.save();

      const pushResult = await rxdb.versionManager.push();
      expect(pushResult.compacted).toBeGreaterThanOrEqual(2);
      expect(pushResult.pushed).toBe(1);

      const { data: remoteChanges } = await remoteAdapter.client
        .from('rxdb_change')
        .select('*')
        .eq('entityId', todo.id)
        .order('id', { ascending: true });

      expect(remoteChanges).toHaveLength(3);
      expect(remoteChanges?.map(change => change.type)).toEqual(['INSERT', 'UPDATE', 'UPDATE']);
      expect(remoteChanges?.at(-1)?.patch?.title).toBe(`${testPrefix}-compact-3`);

      const { data: remoteTodos } = await remoteAdapter.client.from('todos').select('*').eq('id', todo.id);
      expect(remoteTodos).toHaveLength(1);
      expect(remoteTodos?.[0]?.title).toBe(`${testPrefix}-compact-3`);
    });

    it('INSERT→DELETE 压缩后远程应该没有记录', async () => {
      await rxdb.versionManager.push();

      const todo = new Todo();
      todo.title = `${testPrefix}-compact-delete-1`;
      await todo.save();

      await todo.remove();

      const result = await rxdb.versionManager.push();
      expect(result.compacted).toBeGreaterThanOrEqual(2);
      expect(result.pushed).toBe(0);

      // 验证远程没有记录
      const { data: remoteChanges } = await remoteAdapter.client
        .from('rxdb_change')
        .select('*')
        .eq('entityId', todo.id);
      expect(remoteChanges?.length).toBe(0);

      const { data: remoteTodo } = await remoteAdapter.client.from('todos').select('*').eq('id', todo.id);
      expect(remoteTodo?.length).toBe(0);
    });
  });
});
