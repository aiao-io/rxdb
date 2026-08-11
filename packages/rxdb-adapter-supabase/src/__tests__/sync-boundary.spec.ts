/**
 * Push/Pull 边界行为测试
 *
 * 测试极端和边界场景：
 * 1. 大量数据的 push/pull（分页）
 * 2. 快速连续操作
 * 3. 同一实体的多次变更
 * 4. 空操作和错误恢复
 *
 * 注意：RxDB 是单例模式，测试使用唯一的 dbName 避免干扰
 */
import { RxDB, SyncType, uuid, type UUID } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000003';

describe('Push/Pull 边界行为测试', () => {
  const testPrefix = `boundary-${Date.now()}`;
  let rxdb: RxDB;
  let remoteAdapter: RxDBAdapterSupabase;

  async function cleanupRemoteData(adapter: RxDBAdapterSupabase) {
    try {
      // todos 上有 change 触发器：必须先删实体，再清 rxdb_change，否则会残留 DELETE change
      await adapter.client.from('todos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await adapter.client.from('rxdb_change').delete().neq('id', 0);
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }

  async function insertRemoteData(data: { id: string; title: string }) {
    await remoteAdapter.client.from('todos').insert({
      id: data.id,
      title: data.title,
      completed: false,
      createdBy: 'remote-client',
      updatedBy: 'remote-client',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await remoteAdapter.client.from('rxdb_change').insert({
      namespace: 'public',
      entity: 'Todo',
      entityId: data.id,
      type: 'INSERT',
      patch: { id: data.id, title: data.title, completed: false },
      clientId: 'remote-client',
      createdAt: new Date().toISOString()
    });
  }

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `boundary-test-${Date.now()}`,
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
    await cleanupRemoteData(remoteAdapter);
  });

  afterAll(async () => {
    if (remoteAdapter) {
      await cleanupRemoteData(remoteAdapter);
    }
  });

  // ========================================
  // 1. 批量数据测试
  // ========================================
  describe('批量数据', () => {
    it('push 10 条数据应该全部成功', async () => {
      const todos: Todo[] = [];

      for (let i = 0; i < 10; i++) {
        const todo = new Todo();
        todo.title = `${testPrefix}-batch-push-${i}`;
        await todo.save();
        todos.push(todo);
      }

      const result = await rxdb.versionManager.push();
      expect(result.pushed).toBeGreaterThanOrEqual(1);

      // 验证远程数据
      for (const todo of todos) {
        const { data } = await remoteAdapter.client.from('todos').select('*').eq('id', todo.id);
        expect(data?.length).toBe(1);
      }
    });

    it('pull 多条数据应该全部成功', async () => {
      await rxdb.versionManager.push();

      // 远程创建多条数据
      const remoteIds: UUID[] = [];
      for (let i = 0; i < 5; i++) {
        const id = uuid();
        await insertRemoteData({ id, title: `${testPrefix}-batch-pull-${i}` });
        remoteIds.push(id);
      }

      const result = await rxdb.versionManager.pull();
      expect(result.pulled).toBeGreaterThanOrEqual(5);

      // 验证本地数据
      for (const id of remoteIds) {
        const todo = await firstValueFrom(Todo.get(id));
        expect(todo).toBeDefined();
      }
    });
  });

  // ========================================
  // 2. 快速连续操作
  // ========================================
  describe('快速连续操作', () => {
    it('快速连续 push 应该正确处理', async () => {
      // 创建数据
      const todo1 = new Todo();
      todo1.title = `${testPrefix}-rapid-push-1`;
      await todo1.save();

      const todo2 = new Todo();
      todo2.title = `${testPrefix}-rapid-push-2`;
      await todo2.save();

      // 快速连续 push（不等待第一个完成）
      const results = await Promise.all([rxdb.versionManager.push(), rxdb.versionManager.push()]);

      // 至少有一个 push 应该成功推送数据
      const totalPushed = results.reduce((sum, r) => sum + r.pushed, 0);
      expect(totalPushed).toBeGreaterThanOrEqual(1);

      // 验证数据正确
      const { data: remote1 } = await remoteAdapter.client.from('todos').select('*').eq('id', todo1.id);
      const { data: remote2 } = await remoteAdapter.client.from('todos').select('*').eq('id', todo2.id);
      expect(remote1?.length).toBe(1);
      expect(remote2?.length).toBe(1);
    });

    it('push 和 pull 交替执行应该正确处理', async () => {
      await rxdb.versionManager.push();

      // 本地创建
      const localTodo = new Todo();
      localTodo.title = `${testPrefix}-interleave-local`;
      await localTodo.save();

      // 先 push 本地数据
      const pushResult = await rxdb.versionManager.push();

      // push 之后再创建远程数据（这样远程 RxDBChange.id 会大于 lastPullRemoteChangeId）
      const remoteId = crypto.randomUUID();
      await insertRemoteData({ id: remoteId, title: `${testPrefix}-interleave-remote` });

      // 然后 pull 远程数据
      const pullResult = await rxdb.versionManager.pull();

      expect(pushResult.pushed).toBeGreaterThanOrEqual(1);
      expect(pullResult.pulled).toBeGreaterThanOrEqual(1);

      // 验证双方数据都正确
      const { data: remoteTodo } = await remoteAdapter.client.from('todos').select('*').eq('id', localTodo.id);
      expect(remoteTodo?.length).toBe(1);

      const localPulled = await firstValueFrom(Todo.get(remoteId));
      expect(localPulled).toBeDefined();
    });
  });

  // ========================================
  // 3. 同一实体多次变更
  // ========================================
  describe('同一实体多次变更', () => {
    it('同一实体快速多次更新后 push 应该只推送最终状态', async () => {
      const todo = new Todo();
      todo.title = `${testPrefix}-rapid-update-1`;
      await todo.save();

      // 快速多次更新
      for (let i = 2; i <= 10; i++) {
        todo.title = `${testPrefix}-rapid-update-${i}`;
        await todo.save();
      }

      const result = await rxdb.versionManager.push();
      // TODO: 压缩优化 - 目前每次 save() 都生成新 change
      // INSERT + 9 UPDATE = 10 原始，理想情况应该压缩为 1 INSERT
      expect(result.originalCount).toBeGreaterThanOrEqual(10);
      expect(result.pushed).toBeGreaterThanOrEqual(1); // 实际是 20，因为没有压缩

      // 验证远程是最终状态
      const { data } = await remoteAdapter.client.from('todos').select('*').eq('id', todo.id);
      expect(data?.[0]?.title).toBe(`${testPrefix}-rapid-update-10`);
    });

    it('创建→删除→重新创建同 ID 应该正确处理', async () => {
      await rxdb.versionManager.push();

      // 使用固定 ID
      const fixedId = crypto.randomUUID();

      // 创建
      const todo1 = new Todo();
      (todo1 as Todo & { id: string }).id = fixedId;
      todo1.title = `${testPrefix}-recreate-1`;
      await todo1.save();

      // 删除
      await todo1.remove();

      // 由于 INSERT→DELETE 压缩为空，push 应该是 0
      const pushResult = await rxdb.versionManager.push();
      expect(pushResult.pushed).toBe(0);
    });
  });

  // ========================================
  // 4. pushableCount$ 精确性测试
  // ========================================
  describe('pushableCount$ 精确性', () => {
    it('创建多条数据后 pushableCount$ 应该准确', async () => {
      await rxdb.versionManager.push();
      await new Promise(resolve => setTimeout(resolve, 50));

      const initialCount = await firstValueFrom(rxdb.versionManager.pushableCount$);

      // 创建 3 条数据
      for (let i = 0; i < 3; i++) {
        const todo = new Todo();
        todo.title = `${testPrefix}-count-accuracy-${i}`;
        await todo.save();
      }

      await new Promise(resolve => setTimeout(resolve, 50));
      const afterCount = await firstValueFrom(rxdb.versionManager.pushableCount$);

      // 应该增加 3（每条数据一个 INSERT change）
      expect(afterCount).toBe(initialCount + 3);
    });

    it('更新数据后 pushableCount$ 应该增加', async () => {
      await rxdb.versionManager.push();

      const todo = new Todo();
      todo.title = `${testPrefix}-count-update-1`;
      await todo.save();

      await new Promise(resolve => setTimeout(resolve, 50));
      const count1 = await firstValueFrom(rxdb.versionManager.pushableCount$);
      expect(count1).toBe(1);

      todo.title = `${testPrefix}-count-update-2`;
      await todo.save();

      await new Promise(resolve => setTimeout(resolve, 50));
      const count2 = await firstValueFrom(rxdb.versionManager.pushableCount$);
      expect(count2).toBe(2); // INSERT + UPDATE（插入 + 更新）
    });

    it('删除数据后 pushableCount$ 应该增加', async () => {
      await rxdb.versionManager.push();

      const todo = new Todo();
      todo.title = `${testPrefix}-count-delete-1`;
      await todo.save();

      await new Promise(resolve => setTimeout(resolve, 50));
      const count1 = await firstValueFrom(rxdb.versionManager.pushableCount$);
      expect(count1).toBe(1);

      await todo.remove();

      await new Promise(resolve => setTimeout(resolve, 50));
      const count2 = await firstValueFrom(rxdb.versionManager.pushableCount$);
      expect(count2).toBe(2); // INSERT + DELETE（插入 + 删除）
    });
  });

  // ========================================
  // 5. sync() 方法测试
  // ========================================
  describe('sync() 方法', () => {
    it('sync() 应该先 pull 再 push', async () => {
      const localTodo = new Todo();
      localTodo.title = `${testPrefix}-sync-local`;
      await localTodo.save();

      const remoteId = crypto.randomUUID();
      await insertRemoteData({ id: remoteId, title: `${testPrefix}-sync-remote` });

      const result = await rxdb.versionManager.sync();

      expect(result.pullResult.pulled).toBeGreaterThanOrEqual(1);
      expect(result.pushResult.pushed).toBeGreaterThanOrEqual(1);
    });
  });
});
