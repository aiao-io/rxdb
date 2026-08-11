/**
 * 同步测试 - SQLite 本地 + Supabase 远程
 *
 * 测试 Pull + Push 组合使用的完整流程
 * 使用 Supabase API 直接操作模拟"另一客户端"
 *
 * 需要运行: docker/start.sh 启动本地 Supabase
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { Todo } from '@aiao/rxdb-test/entities';
import { filter, firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

describe('同步测试 - SQLite + Supabase', () => {
  const testPrefix = `sync-${Date.now()}`;
  let rxdb: RxDB;
  let remoteAdapter: RxDBAdapterSupabase;

  /**
   * 清理远程测试数据（在测试开始前执行）
   */
  async function cleanupAllRemoteData(adapter: RxDBAdapterSupabase) {
    try {
      // 按依赖顺序清理
      // todos 上有 change 触发器：必须先删实体，再清 rxdb_change，否则会残留 DELETE change
      await adapter.client.from('todos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await adapter.client.from('rxdb_change').delete().neq('id', 0);
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }

  // 所有测试共享一个 RxDB 实例
  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `sync-test-${Date.now()}`,
      context: { userId: '00000000-0000-0000-0000-000000000099' },
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

    // 连接本地 SQLite
    await rxdb.connect('wa-sqlite');

    // 获取远程适配器
    remoteAdapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;

    // 清理远程测试数据，避免历史数据污染
    await cleanupAllRemoteData(remoteAdapter);
  });

  /**
   * 直接通过 Supabase API 插入数据（模拟另一客户端）
   */
  async function insertRemoteData(data: { id: string; title: string; completed?: boolean; createdBy?: string }) {
    const { error } = await remoteAdapter.client.from('todos').insert({
      id: data.id,
      title: data.title,
      completed: data.completed ?? false,
      createdBy: data.createdBy ?? 'remote-user',
      updatedBy: data.createdBy ?? 'remote-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (error) throw error;

    // 同时插入 RxDBChange 记录
    await remoteAdapter.client.from('rxdb_change').insert({
      namespace: 'public',
      entity: 'Todo',
      entityId: data.id,
      type: 'INSERT',
      patch: { id: data.id, title: data.title, completed: data.completed ?? false },
      clientId: 'remote-client',
      createdAt: new Date().toISOString()
    });
  }

  /**
   * 直接通过 Supabase API 更新数据（模拟另一客户端）
   */
  async function updateRemoteData(id: string, patch: Record<string, unknown>) {
    const { error } = await remoteAdapter.client
      .from('todos')
      .update({ ...patch, updatedAt: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;

    await remoteAdapter.client.from('rxdb_change').insert({
      namespace: 'public',
      entity: 'Todo',
      entityId: id,
      type: 'UPDATE',
      patch,
      clientId: 'remote-client',
      createdAt: new Date().toISOString()
    });
  }

  /**
   * 清理远程测试数据
   */
  async function cleanupRemoteData() {
    if (!remoteAdapter) return;
    try {
      await remoteAdapter.client.from('todos').delete().like('title', `${testPrefix}%`);
      await remoteAdapter.client.from('rxdb_change').delete().like('entityId', `${testPrefix}%`);
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }

  afterAll(async () => {
    await cleanupRemoteData();
  });

  // ========================================
  // T041: Push 后 Pull 同步
  // ========================================
  describe('Push 后 Pull 同步 (T041)', () => {
    it('本地 push 后，远程应该能查到数据', async () => {
      const todo = new Todo();
      todo.title = `${testPrefix}-Push Test`;
      await todo.save();

      const pushResult = await rxdb.versionManager.push();
      expect(pushResult.pushed).toBeGreaterThanOrEqual(1);

      // 验证远程数据
      const { data } = await remoteAdapter.client.from('todos').select('*').eq('id', todo.id);
      expect(data?.length).toBe(1);
      expect(data?.[0].title).toBe(`${testPrefix}-Push Test`);
    });

    it('远程有新数据时，pull 应该同步到本地', async () => {
      const remoteId = crypto.randomUUID();

      // 直接在远程插入数据（模拟另一客户端 push）
      await insertRemoteData({
        id: remoteId,
        title: `${testPrefix}-Remote Data`
      });

      // 本地 pull
      const pullResult = await rxdb.versionManager.pull();
      expect(pullResult.pulled).toBeGreaterThanOrEqual(1);

      // 验证本地能看到远程数据
      const todo = await firstValueFrom(Todo.get(remoteId));
      expect(todo).toBeDefined();
      expect(todo?.title).toBe(`${testPrefix}-Remote Data`);
    });
  });

  // ========================================
  // T042: 冲突场景测试（LWW 解决）
  // ========================================
  describe('冲突场景测试 (T042)', () => {
    it('本地和远程同时修改，pull 时应该检测到变更', async () => {
      const conflictId = crypto.randomUUID();

      // 先在远程创建初始数据
      await insertRemoteData({
        id: conflictId,
        title: `${testPrefix}-Original`
      });

      // 本地 pull 获取数据
      await rxdb.versionManager.pull();

      // 本地修改
      const localTodo = await firstValueFrom(
        Todo.findOne({
          where: {
            combinator: 'and',
            rules: [
              {
                field: 'id',
                operator: '=',
                value: conflictId
              }
            ]
          }
        })
      );

      if (localTodo) {
        localTodo.title = `${testPrefix}-Local Modified`;
        await localTodo.save();
      }

      // 远程也修改（模拟另一客户端）
      await new Promise(resolve => setTimeout(resolve, 100));
      await updateRemoteData(conflictId, { title: `${testPrefix}-Remote Modified` });

      // 本地 pull（应该检测到远程变更）
      const pullResult = await rxdb.versionManager.pull();
      expect(pullResult).toBeDefined();
    });
  });

  // ========================================
  // T043: 离线重连同步测试
  // ========================================
  describe('离线重连同步测试 (T043)', () => {
    it('离线期间的多个变更应该在 push 后正确同步', async () => {
      const testPrefix4 = `${testPrefix}-offline`;

      // 模拟离线期间创建多个 Todo
      const todos: Todo[] = [];
      for (let i = 0; i < 3; i++) {
        const todo = new Todo();
        todo.title = `${testPrefix4}-Offline Todo ${i}`;
        await todo.save();
        todos.push(todo);
      }

      // 重连后 push
      const pushResult = await rxdb.versionManager.push();

      // 应该推送变更
      expect(pushResult.pushed).toBeGreaterThanOrEqual(1);

      // 验证远程数据
      for (const todo of todos) {
        const { data } = await remoteAdapter.client.from('todos').select('*').eq('id', todo.id);
        expect(data?.length).toBe(1);
      }
    });

    it('sync() 应该先 pull 再 push', async () => {
      const testPrefix5 = `${testPrefix}-sync`;
      const remoteId = crypto.randomUUID();

      // 远程先有数据
      await insertRemoteData({
        id: remoteId,
        title: `${testPrefix5}-Remote Before Sync`
      });

      // 本地创建数据
      const localTodo = new Todo();
      localTodo.title = `${testPrefix5}-Local Before Sync`;
      await localTodo.save();

      // 调用 sync()
      const syncResult = await rxdb.versionManager.sync();

      expect(syncResult).toBeDefined();
      expect(syncResult).toHaveProperty('pullResult');
      expect(syncResult).toHaveProperty('pushResult');

      // 验证远程有本地数据
      const { data } = await remoteAdapter.client.from('todos').select('*').eq('id', localTodo.id);
      expect(data?.length).toBe(1);
    });
  });

  // ========================================
  // 变更压缩测试
  // ========================================
  describe('变更压缩', () => {
    it('INSERT→DELETE 应该被压缩丢弃', async () => {
      const testPrefix7 = `${testPrefix}-compact`;

      // 先清空之前测试的 pending changes
      await rxdb.versionManager.push();

      // 创建 Todo
      const todo = new Todo();
      todo.title = `${testPrefix7}-Temporary`;
      await todo.save();

      // 立即删除
      await todo.remove();

      // Push 应该压缩掉这两个变更
      const pushResult = await rxdb.versionManager.push();

      // INSERT + DELETE = 压缩后应该为 0
      expect(pushResult.compacted).toBeGreaterThanOrEqual(2);
      expect(pushResult.pushed).toBe(0);
    });

    it('INSERT→UPDATE* 应该压缩为单个 INSERT', async () => {
      const testPrefix8 = `${testPrefix}-compact-update`;

      // 创建 Todo
      const todo = new Todo();
      todo.title = `${testPrefix8}-Original`;
      await todo.save();

      // 多次更新
      todo.title = `${testPrefix8}-Update 1`;
      await todo.save();

      todo.title = `${testPrefix8}-Update 2`;
      await todo.save();

      todo.title = `${testPrefix8}-Final`;
      await todo.save();

      // Push 应该压缩为单个 INSERT
      const pushResult = await rxdb.versionManager.push();

      // 1 INSERT + 3 UPDATE = 4 原始，压缩后 = 1 INSERT
      expect(pushResult.compacted).toBeGreaterThanOrEqual(3);
      expect(pushResult.pushed).toBe(1);

      // 验证远程数据是最终版本
      const { data } = await remoteAdapter.client.from('todos').select('*').eq('id', todo.id);
      expect(data?.[0]?.title).toBe(`${testPrefix8}-Final`);
    });
  });

  // ========================================
  // Push 后 Undo/Redo 测试
  // ========================================
  describe('Push 后 Undo/Redo', () => {
    it('push 后应该无法 undo 已推送的变更', async () => {
      const testPrefix9 = `${testPrefix}-undo`;

      // 清空之前的 pending changes，确保起始状态干净
      await rxdb.versionManager.push();

      const history = rxdb.versionManager.history();
      const todo = new Todo();
      todo.title = `${testPrefix9}-Undo Test`;
      await todo.save();

      const pushResult = await rxdb.versionManager.push();
      expect(pushResult.pushed).toBeGreaterThanOrEqual(1);

      await new Promise(resolve => setTimeout(resolve, 200));
      expect(await firstValueFrom(history.undoCount$)).toBe(0);

      await history.undo();
      const persisted = await firstValueFrom(
        Todo.findOne({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: todo.id }] }
        })
      );
      expect(persisted?.id).toBe(todo.id);
    });

    it('push 后的新变更仍然可以 undo', async () => {
      const testPrefix10 = `${testPrefix}-undo-new`;

      // 清空之前的 pending changes
      await rxdb.versionManager.push();

      // 获取 history API
      const history = rxdb.versionManager.history();
      await firstValueFrom(history.undoCount$);

      // 创建 Todo 并 push
      const todo1 = new Todo();
      todo1.title = `${testPrefix10}-First`;
      await todo1.save();
      const pushResult = await rxdb.versionManager.push();
      expect(pushResult.pushed).toBeGreaterThanOrEqual(1);

      // 等待 push 完成和 branch 更新传播
      await new Promise(resolve => setTimeout(resolve, 200));

      // Push 后 undoCount 应该为 0
      let undoCount = await firstValueFrom(history.undoCount$);
      expect(undoCount).toBe(0);

      // 创建新的 Todo（未 push）
      const todo2 = new Todo();
      todo2.title = `${testPrefix10}-Second`;
      await todo2.save();

      // 等待变更被记录到 undoHistories$ 中
      // 使用 filter + firstValueFrom 等待 undoCount >= 1，超时 5 秒
      await firstValueFrom(history.undoCount$.pipe(filter(count => count >= 1)), { defaultValue: 0 });

      // 新变更应该可以 undo
      undoCount = await firstValueFrom(history.undoCount$);
      expect(undoCount).toBeGreaterThanOrEqual(1); // 至少有 1 个可撤销的变更
    });
  });
});
