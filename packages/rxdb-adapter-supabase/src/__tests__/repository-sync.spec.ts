/**
 * 仓库级同步集成测试。
 *
 * 测试 repository 级别的同步功能（pullRepository, pushRepository, syncRepository）
 * 使用真实的 SQLite + Supabase 环境
 *
 * 需要运行: docker/start.sh 启动本地 Supabase
 */
import { Entity, EntityBase, PropertyType, RxDB, RxDBSync, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { cleanupSqliteAdapter } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

/**
 * 测试专用的 Todo 实体
 */
@Entity({
  name: 'Todo',
  namespace: 'public',
  tableName: 'todos',
  sync: {
    type: SyncType.Full,
    local: { adapter: 'local' },
    remote: { adapter: 'remote' }
  },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
class TodoSync extends EntityBase {
  title!: string;
  completed!: boolean;
}

describe('Repository-Level Sync Integration', () => {
  let rxdb: RxDB;
  let remoteAdapter: RxDBAdapterSupabase;
  let localAdapter: RxDBAdapterWaSqlite;

  /**
   * 清理远程测试数据
   */
  async function cleanupRemoteData() {
    if (!remoteAdapter) return;
    try {
      // todos 上有 change 触发器：必须先删实体，再清 rxdb_change，否则会残留 DELETE change
      await remoteAdapter.client.from('todos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await remoteAdapter.client.from('rxdb_change').delete().neq('id', 0);
      await remoteAdapter.client.from('rxdb_sync').delete().neq('id', 0);
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }

  /**
   * 清理本地测试数据
   */
  async function cleanupLocalData() {
    if (!localAdapter) return;
    await cleanupSqliteAdapter(localAdapter);
  }

  /**
   * 模拟"另一个客户端"创建远程数据
   * 直接插入 Todo 和对应的 RxDBChange 记录
   */
  async function createRemoteTodo(title: string, completed = false) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const createdBy = '00000000-0000-0000-0000-000000000002'; // 另一个用户

    const todoData = {
      id,
      title,
      completed,
      createdAt: now,
      updatedAt: now,
      createdBy
    };

    // 插入实体数据
    await remoteAdapter.client.from('todos').insert(todoData);

    // 插入变更记录（注意：字段名是 type 不是 operation）
    await remoteAdapter.client.from('rxdb_change').insert({
      namespace: 'public',
      entity: 'Todo',
      entityId: id,
      type: 'INSERT',
      branchId: 'main',
      patch: todoData, // INSERT 的 patch 是完整数据
      inversePatch: null, // INSERT 的 inverse 是 null
      transactionId: null,
      clientId: 'test-client-2',
      createdAt: now,
      updatedAt: now
    });

    return { id, title, completed };
  }

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `repo-sync-test-${Date.now()}`,
      context: { userId: '00000000-0000-0000-0000-000000000001' },
      entities: [TodoSync],
      sync: {
        local: { adapter: 'wa-sqlite' },
        remote: { adapter: 'supabase' },
        type: SyncType.Full
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

    // 连接本地 SQLite（会自动创建所有表）
    await rxdb.connect('wa-sqlite');

    // 获取适配器实例
    localAdapter = (await rxdb.getAdapter('wa-sqlite')) as RxDBAdapterWaSqlite;
    remoteAdapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;

    // 清理旧数据
    await cleanupRemoteData();
    await cleanupLocalData();
  });

  afterEach(async () => {
    // 每个测试后清理，确保测试隔离
    try {
      await cleanupLocalData();
    } catch (error) {
      console.warn('afterEach cleanup error:', error);
    }
  });

  afterAll(async () => {
    await cleanupRemoteData();
    await cleanupLocalData();
    await rxdb.disconnectAll();
  });

  describe('pullRepository()', () => {
    it('应该能从远程拉取指定 repository 的数据', async () => {
      // 清理数据
      await cleanupRemoteData();
      await cleanupLocalData();

      // 1. 模拟"另一个客户端"创建远程数据
      const remoteTodo = await createRemoteTodo('Remote Todo for Pull Test', false);

      // 2. 当前客户端调用 pullRepository
      const result = await rxdb.versionManager.pullRepository('public', 'Todo');

      // 3. 验证结果
      expect(result.repository.namespace).toBe('public');
      expect(result.repository.entity).toBe('Todo');
      expect(result.pulled).toBeGreaterThan(0);
      expect(result.applied).toBeGreaterThan(0);

      // 4. 验证数据已经在本地
      const localTodo = await firstValueFrom(TodoSync.get(remoteTodo.id));

      expect(localTodo).toBeDefined();
      expect(localTodo?.title).toBe('Remote Todo for Pull Test');
    });

    it('应该能处理空的远程数据', async () => {
      // 确保远程没有数据
      await cleanupRemoteData();

      const result = await rxdb.versionManager.pullRepository('public', 'Todo');

      expect(result.pulled).toBe(0);
      expect(result.applied).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('应该支持 limit 选项', async () => {
      // 清理并创建多条数据
      await cleanupRemoteData();
      await cleanupLocalData();

      // 模拟"另一个客户端"创建多条数据
      for (let i = 0; i < 5; i++) {
        await createRemoteTodo(`Todo ${i + 1}`, false);
      }

      // 只拉取 2 条
      const result = await rxdb.versionManager.pullRepository('public', 'Todo', {
        limit: 2
      });

      expect(result.pulled).toBeLessThanOrEqual(2);
    });
  });

  describe('pushRepository()', () => {
    it('应该能推送本地变更到远程', async () => {
      // 清理数据
      await cleanupRemoteData();
      await cleanupLocalData();

      // 1. 在本地创建数据
      const localTodo = new TodoSync();
      localTodo.title = 'Local Todo for Push Test';
      localTodo.completed = false;
      await localTodo.save();

      // 2. 调用 pushRepository
      const result = await rxdb.versionManager.pushRepository('public', 'Todo');

      // 3. 验证结果
      expect(result.repository.namespace).toBe('public');
      expect(result.repository.entity).toBe('Todo');
      expect(result.pushed).toBeGreaterThan(0);
      expect(result.failed).toBe(0);
      expect(result.compacted).toBeGreaterThanOrEqual(0);
      expect(result.originalCount).toBeGreaterThan(0);

      // 注意：实际的远程推送（remoteAdapter.mergeChanges()）尚未实现
      // 这里只验证变更被正确识别和压缩，不验证远程数据
    });

    it('应该能处理空的本地变更', async () => {
      await cleanupRemoteData();
      await cleanupLocalData();

      // 确保没有待推送的变更
      const result = await rxdb.versionManager.pushRepository('public', 'Todo');

      expect(result.pushed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.compacted).toBe(0);
      expect(result.originalCount).toBe(0);
    });

    it('应该能正确压缩变更（INSERT后DELETE应该被丢弃）', async () => {
      await cleanupRemoteData();
      await cleanupLocalData();

      // 创建并立即删除
      const todo = new TodoSync();
      todo.title = 'Will be deleted';
      todo.completed = false;
      await todo.save();

      await todo.remove();

      // 推送
      const result = await rxdb.versionManager.pushRepository('public', 'Todo');

      // 应该没有推送（因为变更被压缩了）
      expect(result.originalCount).toBeGreaterThan(0); // 有原始变更
      expect(result.compacted).toBeGreaterThan(0); // 被压缩了
      expect(result.pushed).toBe(0); // 实际没推送
    });
  });

  describe('syncRepository()', () => {
    it('应该能完整同步单个 repository（pull + push）', async () => {
      await cleanupRemoteData();
      await cleanupLocalData();

      // 1. 模拟"另一个客户端"创建远程数据
      const remoteTodo = await createRemoteTodo('Remote Todo', false);

      // 2. 本地创建数据
      const localTodo = new TodoSync();
      localTodo.title = 'Local Todo';
      localTodo.completed = false;
      await localTodo.save();

      // 3. 同步
      const result = await rxdb.versionManager.syncRepository('public', 'Todo');

      // 4. 验证 pull 结果
      expect(result.pullResult.pulled).toBeGreaterThan(0);
      expect(result.pullResult.applied).toBeGreaterThan(0);

      // 5. 验证 push 结果
      expect(result.pushResult.pushed).toBeGreaterThan(0);

      // 6. 验证远程有本地数据
      const { data: remoteLocalTodo } = await remoteAdapter.client
        .from('todos')
        .select('*')
        .eq('id', localTodo.id)
        .single();
      expect(remoteLocalTodo).toBeDefined();

      // 7. 验证本地有远程数据
      const localRemoteTodo = await firstValueFrom(TodoSync.get(remoteTodo.id));
      expect(localRemoteTodo).toBeDefined();
    });

    it('应该先执行 pull 再执行 push', async () => {
      await cleanupRemoteData();
      await cleanupLocalData();

      const operations: string[] = [];

      // 监听同步事件
      const syncListener = (event: { direction: string }) => {
        operations.push(event.direction); // 'sync', 'pull' 或 'push'
      };

      rxdb.addEventListener('REPOSITORY_SYNC_BEGIN', syncListener);

      // 执行同步
      await rxdb.versionManager.syncRepository('public', 'Todo');

      // 清理监听器
      rxdb.removeEventListener('REPOSITORY_SYNC_BEGIN', syncListener);

      // 验证执行顺序：应该是 ['sync', 'pull', 'push']
      expect(operations.length).toBeGreaterThanOrEqual(3);
      expect(operations[0]).toBe('sync'); // syncRepository 触发
      expect(operations[1]).toBe('pull'); // pullRepository 触发
      expect(operations[2]).toBe('push'); // pushRepository 触发
    });
  });

  describe('checkRepositoryUpdates()', () => {
    it('应该能检查远程更新数量', async () => {
      await cleanupRemoteData();
      await cleanupLocalData();

      // 先拉取一次，建立 checkpoint
      await rxdb.versionManager.pullRepository('public', 'Todo');

      // 在远程创建新数据（使用辅助函数同时创建 Todo 和 RxDBChange）
      await createRemoteTodo('New Todo 1', false);
      await createRemoteTodo('New Todo 2', false);
      await createRemoteTodo('New Todo 3', false);

      // 检查更新
      const result = await rxdb.versionManager.checkRepositoryUpdates('public', 'Todo');

      expect(result.repository.namespace).toBe('public');
      expect(result.repository.entity).toBe('Todo');
      expect(result.pendingCount).toBeGreaterThan(0);
      expect(result.hasUpdates).toBe(true);
    });
  });

  describe('getRepositorySyncStatus()', () => {
    it('应该能查询单个 repository 的同步状态', async () => {
      await cleanupRemoteData();
      await cleanupLocalData();

      // 执行一次同步
      await rxdb.versionManager.syncRepository('public', 'Todo');

      // 查询状态
      const status = await rxdb.versionManager.getRepositorySyncStatus('public', 'Todo');

      expect(status.repository.namespace).toBe('public');
      expect(status.repository.entity).toBe('Todo');
      expect(status.syncType).toBe('full');
      expect(status.lastPulledAt).toBeDefined();
      expect(status.lastPushedAt).toBeDefined();
    });

    it('应该能正确统计 pushableCount 和 pullableCount', async () => {
      await cleanupRemoteData();
      await cleanupLocalData();

      // 先同步一次
      await rxdb.versionManager.syncRepository('public', 'Todo');

      // 本地创建新数据
      const newTodo = new TodoSync();
      newTodo.title = 'New Local Todo';
      newTodo.completed = false;
      await newTodo.save();

      // 模拟"另一个客户端"创建远程新数据
      await createRemoteTodo('New Remote Todo', false);

      // 查询状态
      const status = await rxdb.versionManager.getRepositorySyncStatus('public', 'Todo');

      expect(status.pushableCount).toBeGreaterThan(0); // 有本地未推送的变更
      expect(status.pullableCount).toBeGreaterThan(0); // 有远程未拉取的变更
    });
  });

  describe('getAllRepositorySyncStatus()', () => {
    it('应该能查询所有 repository 的同步状态', async () => {
      await cleanupRemoteData();
      await cleanupLocalData();

      // 执行同步
      await rxdb.versionManager.syncRepository('public', 'Todo');

      // 查询所有状态
      const statuses = await rxdb.versionManager.getAllRepositorySyncStatus();

      expect(Array.isArray(statuses)).toBe(true);
      expect(statuses.length).toBeGreaterThan(0);

      const todoStatus = statuses.find(s => s.repository.entity === 'Todo');
      expect(todoStatus).toBeDefined();
      expect(todoStatus?.syncType).toBe('full');
    });

    it('应该支持按 syncType 过滤', async () => {
      await cleanupRemoteData();
      await cleanupLocalData();

      await rxdb.versionManager.syncRepository('public', 'Todo');

      const statuses = await rxdb.versionManager.getAllRepositorySyncStatus({
        syncType: ['full']
      });

      expect(statuses.every(s => s.syncType === 'full')).toBe(true);
    });
  });

  describe('RxDBSync 元数据管理', () => {
    it('首次同步应该创建 RxDBSync 记录', async () => {
      await cleanupRemoteData();
      await cleanupLocalData();

      // 执行同步
      await rxdb.versionManager.syncRepository('public', 'Todo');

      // 查询本地 RxDBSync 表
      const branch = await rxdb.versionManager.getCurrentBranch();
      const repoSyncId = `public:Todo:${branch.id}`;

      const repoSyncRepo = localAdapter.getRepository(RxDBSync);
      const syncRecords = await repoSyncRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: repoSyncId }]
        },
        limit: 1
      });

      expect(syncRecords.length).toBeGreaterThan(0);
      const record = syncRecords[0];

      expect(record.syncType).toBe('full');
      expect(record.lastPulledAt).toBeDefined();
      expect(record.lastPushedAt).toBeDefined();
    });

    it('后续同步应该更新 RxDBSync 记录', async () => {
      await cleanupRemoteData();
      await cleanupLocalData();

      const branch = await rxdb.versionManager.getCurrentBranch();
      const repoSyncId = `public:Todo:${branch.id}`;
      const repoSyncRepo = localAdapter.getRepository(RxDBSync);

      // 第一次同步
      await rxdb.versionManager.syncRepository('public', 'Todo');

      const firstSyncResults = await repoSyncRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: repoSyncId }]
        },
        limit: 1
      });

      const firstRecord = firstSyncResults[0];
      const firstPulledAt = firstRecord.lastPulledAt;

      // 等待一会儿
      await new Promise(resolve => setTimeout(resolve, 100));

      // 第二次同步
      await rxdb.versionManager.syncRepository('public', 'Todo');

      const secondSyncResults = await repoSyncRepo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'id', operator: '=', value: repoSyncId }]
        },
        limit: 1
      });

      const secondRecord = secondSyncResults[0];
      const secondPulledAt = secondRecord.lastPulledAt;

      if (firstPulledAt === null || secondPulledAt === null) {
        throw new Error('lastPulledAt should be set after repository sync');
      }

      // 验证 lastPulledAt 被更新
      expect(new Date(secondPulledAt).getTime()).toBeGreaterThanOrEqual(new Date(firstPulledAt).getTime());
    });
  });

  describe('错误处理', () => {
    it('pullRepository 应该在远程连接失败时抛出错误', async () => {
      // 尝试从不存在的 namespace 拉取数据应该抛出错误
      await expect(rxdb.versionManager.pullRepository('nonexistent', 'Todo')).rejects.toThrow();
    });
  });
});
