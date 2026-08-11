/**
 * 多次 Pull/Push 操作测试
 *
 * 测试场景：
 * 1. 连续多次 push（无新变更时）
 * 2. 连续多次 pull（无新变更时）
 * 3. push 后创建数据再 push
 * 4. pull 后远程有新数据再 pull
 *
 * 重点验证：
 * - Supabase 数据库中的真实数据状态
 * - RxDBSync 的 lastPushedChangeId 和 lastPullRemoteChangeId 的正确更新
 * - pushableCount$ 的准确性
 *
 * 注意：RxDB 是单例模式，测试使用唯一的 dbName 避免干扰
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { cleanupSqliteAdapter, LOCAL_RXDB_SYNC_TABLE } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

interface InternalQueryResult {
  results?: Array<{ rows?: unknown[][] }>;
}

type SqliteTestAdapter = RxDBAdapterWaSqlite & {
  internalQuery(sql: string): Promise<InternalQueryResult>;
};

function toNumber(value: unknown): number {
  const number =
    typeof value === 'bigint' ? Number(value)
    : typeof value === 'string' ? Number(value)
    : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    throw new Error(`Expected a numeric change id, received ${String(value)}`);
  }
  return number;
}

describe('多次 Pull/Push 操作测试', () => {
  const testPrefix = `multi-op-${Date.now()}`;
  let rxdb: RxDB;
  let remoteAdapter: RxDBAdapterSupabase;
  let localAdapter: SqliteTestAdapter;

  /**
   * 清理远程测试数据
   */
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

  /**
   * 直接在远程插入数据（模拟另一客户端）
   */
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

    // 同时插入 RxDBChange 记录（模拟远程 push）
    const changeResult = await remoteAdapter.client.from('rxdb_change').insert({
      namespace: 'public',
      entity: 'Todo',
      entityId: data.id,
      type: 'INSERT',
      patch: { id: data.id, title: data.title, completed: false },
      clientId: 'remote-client',
      createdAt: new Date().toISOString()
    });
    if (changeResult.error) throw changeResult.error;

    // 轮询验证数据已提交（最多等待2秒）
    for (let i = 0; i < 20; i++) {
      const { data: changes } = await remoteAdapter.client
        .from('rxdb_change')
        .select('*')
        .eq('entityId', data.id)
        .eq('type', 'INSERT');

      if (changes && changes.length > 0) {
        return; // 数据已确认写入
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Failed to verify remote data insertion for ${data.id}`);
  }

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `multi-op-test-${Date.now()}`,
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
    localAdapter = (await rxdb.getAdapter('wa-sqlite')) as unknown as SqliteTestAdapter;

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
        // 列可能已经存在，忽略错误。
      }
    }

    await cleanupRemoteData(remoteAdapter);
  });

  afterAll(async () => {
    if (remoteAdapter) {
      await cleanupRemoteData(remoteAdapter);
    }
  });

  // ========================================
  // 1. 连续多次 Push 测试
  // ========================================
  describe('连续多次 Push', () => {
    it('连续 push 两次，第二次应该 pushed=0', async () => {
      // 创建数据
      const todo = new Todo();
      todo.title = `${testPrefix}-multi-push-1`;
      await todo.save();

      // 第一次 push
      const result1 = await rxdb.versionManager.push();
      expect(result1.pushed).toBeGreaterThanOrEqual(1);

      // 验证远程数据
      const { data: remoteData1 } = await remoteAdapter.client.from('todos').select('*').eq('id', todo.id);
      expect(remoteData1?.length).toBe(1);

      // 第二次 push（无新变更）
      const result2 = await rxdb.versionManager.push();
      expect(result2.pushed).toBe(0);
      expect(result2.originalCount).toBe(0);
    });

    it('连续 push 三次，每次都应该正确处理', async () => {
      const results = [];

      // 第一次：有数据
      const todo1 = new Todo();
      todo1.title = `${testPrefix}-multi-push-2a`;
      await todo1.save();
      results.push(await rxdb.versionManager.push());

      // 第二次：无数据
      results.push(await rxdb.versionManager.push());

      // 第三次：新数据
      const todo2 = new Todo();
      todo2.title = `${testPrefix}-multi-push-2b`;
      await todo2.save();
      results.push(await rxdb.versionManager.push());

      expect(results[0].pushed).toBeGreaterThanOrEqual(1);
      expect(results[1].pushed).toBe(0);
      expect(results[2].pushed).toBeGreaterThanOrEqual(1);
    });

    it('push 后 pushableCount$ 应该为 0', async () => {
      const todo = new Todo();
      todo.title = `${testPrefix}-pushable-count-1`;
      await todo.save();

      // push 前检查
      await new Promise(resolve => setTimeout(resolve, 50));
      const countBefore = await firstValueFrom(rxdb.versionManager.pushableCount$);
      expect(countBefore).toBeGreaterThan(0);

      // 推送。
      await rxdb.versionManager.push();

      // push 后检查
      await new Promise(resolve => setTimeout(resolve, 50));
      const countAfter = await firstValueFrom(rxdb.versionManager.pushableCount$);
      expect(countAfter).toBe(0);
    });
  });

  // ========================================
  // 2. 连续多次 Pull 测试
  // ========================================
  describe('连续多次 Pull', () => {
    it('连续 pull 两次，第二次应该 pulled=0', async () => {
      // 先清空本地待推送的变更
      await rxdb.versionManager.push();

      // 在远程创建数据
      const remoteId = crypto.randomUUID();
      await insertRemoteData({ id: remoteId, title: `${testPrefix}-multi-pull-1` });

      // 第一次 pull
      const result1 = await rxdb.versionManager.pull();
      expect(result1.pulled).toBeGreaterThanOrEqual(1);

      // 验证本地数据
      const localTodo = await firstValueFrom(Todo.get(remoteId));
      expect(localTodo).toBeDefined();
      expect(localTodo?.title).toBe(`${testPrefix}-multi-pull-1`);

      // 第二次 pull（无新变更）
      const result2 = await rxdb.versionManager.pull();
      expect(result2.pulled).toBe(0);
    });

    it('pull 多次，lastPullRemoteChangeId 应该递增', async () => {
      await rxdb.versionManager.push();

      // 获取初始 repository sync 状态
      const branch = await rxdb.versionManager.getCurrentBranch();
      const repoSyncId = `public:Todo:${branch.id}`;

      // 使用直接 SQL 获取初始值。
      const initialResult = await localAdapter.internalQuery(
        `SELECT lastPullRemoteChangeId FROM ${LOCAL_RXDB_SYNC_TABLE} WHERE id = '${repoSyncId}'`
      );
      const initialValue = initialResult?.results?.[0]?.rows?.[0]?.[0];
      const initialLastPullId = initialValue == null ? 0 : toNumber(initialValue);

      // 远程创建数据
      const remoteId1 = crypto.randomUUID();
      const uniqueTitle1 = `pull-increment-${Date.now()}-1-${Math.random().toString(36).substr(2, 9)}`;
      await insertRemoteData({ id: remoteId1, title: uniqueTitle1 });

      // 第一次 pull
      await rxdb.versionManager.pull();
      const afterFirstResult = await localAdapter.internalQuery(
        `SELECT lastPullRemoteChangeId FROM ${LOCAL_RXDB_SYNC_TABLE} WHERE id = '${repoSyncId}'`
      );
      const afterFirstRow = afterFirstResult?.results?.[0]?.rows?.[0];
      const lastPullIdAfterFirstPull = toNumber(afterFirstRow?.[0]);
      expect(lastPullIdAfterFirstPull).toBeGreaterThan(initialLastPullId);

      // 等待一下确保下一次插入的 RxDBChange.id 一定比上一次大
      await new Promise(resolve => setTimeout(resolve, 100));

      // 远程再创建数据，并验证新的 RxDBChange.id 确实比 lastPullRemoteChangeId 大
      const remoteId2 = crypto.randomUUID();
      const uniqueTitle2 = `pull-increment-${Date.now()}-2-${Math.random().toString(36).substr(2, 9)}`;
      await insertRemoteData({ id: remoteId2, title: uniqueTitle2 });

      // 验证新插入的数据的 RxDBChange.id 确实比 lastPullRemoteChangeId 大
      const { data: newChanges } = await remoteAdapter.client
        .from('rxdb_change')
        .select('id')
        .eq('entityId', remoteId2)
        .order('id', { ascending: false })
        .limit(1);

      if (!newChanges || newChanges.length === 0) {
        throw new Error(`Failed to find RxDBChange for ${remoteId2}`);
      }
      const newChangeId = toNumber(newChanges[0].id);
      expect(newChangeId).toBeGreaterThan(lastPullIdAfterFirstPull);

      // 第二次 pull
      await rxdb.versionManager.pull();
      const afterSecondResult = await localAdapter.internalQuery(
        `SELECT lastPullRemoteChangeId FROM ${LOCAL_RXDB_SYNC_TABLE} WHERE id = '${repoSyncId}'`
      );
      const afterSecondRow = afterSecondResult?.results?.[0]?.rows?.[0];
      const lastPullIdAfterSecondPull = toNumber(afterSecondRow?.[0]);
      expect(lastPullIdAfterSecondPull).toBeGreaterThan(lastPullIdAfterFirstPull);
    });
  });

  // ========================================
  // 3. Push + Pull 交互测试
  // ========================================
  describe('Push + Pull 交互', () => {
    it('pull 来的数据不应该被 push 到远程', async () => {
      // 清理之前测试留下的本地 changes
      await cleanupLocalChanges();
      await rxdb.versionManager.push();

      // 远程创建数据
      const remoteId = crypto.randomUUID();
      await insertRemoteData({ id: remoteId, title: `${testPrefix}-no-re-push` });

      // 拉取。
      const pullResult = await rxdb.versionManager.pull();
      expect(pullResult.pulled).toBeGreaterThanOrEqual(1);

      // 记录远程 RxDBChange 数量
      const { count: beforeCount } = await remoteAdapter.client
        .from('rxdb_change')
        .select('*', { count: 'exact', head: true })
        .eq('entityId', remoteId);

      // Push（不应该推送 pull 来的数据，因为 pull 的数据不进本地 RxDBChange 表）
      const pushResult = await rxdb.versionManager.push();
      expect(pushResult.pushed).toBe(0);

      // 验证远程 RxDBChange 数量未增加（因为没有可推送的本地变更）
      const { count: afterCount } = await remoteAdapter.client
        .from('rxdb_change')
        .select('*', { count: 'exact', head: true })
        .eq('entityId', remoteId);
      expect(afterCount).toBe(beforeCount);
    });

    it('push→pull→创建→push 循环应该正确处理', async () => {
      // 初始 push
      await rxdb.versionManager.push();

      // 远程创建数据
      const remoteId = crypto.randomUUID();
      await insertRemoteData({ id: remoteId, title: `${testPrefix}-cycle-remote` });

      // 拉取。
      const pullResult = await rxdb.versionManager.pull();
      expect(pullResult.pulled).toBeGreaterThanOrEqual(1);

      // 本地创建新数据
      const localTodo = new Todo();
      localTodo.title = `${testPrefix}-cycle-local`;
      await localTodo.save();

      // Push 新数据
      const pushResult = await rxdb.versionManager.push();
      expect(pushResult.pushed).toBeGreaterThanOrEqual(1);

      // 验证远程只有本地新创建的数据被推送
      const { data: remoteTodo } = await remoteAdapter.client.from('todos').select('*').eq('id', localTodo.id).single();
      expect(remoteTodo?.title).toBe(`${testPrefix}-cycle-local`);
    });
  });

  // ========================================
  // 4. 边界情况测试
  // ========================================
  describe('边界情况', () => {
    it('空数据库 push 应该返回 pushed=0', async () => {
      // 确保没有待推送的变更
      await rxdb.versionManager.push();

      const result = await rxdb.versionManager.push();
      expect(result.pushed).toBe(0);
      expect(result.originalCount).toBe(0);
    });

    it('空数据库 pull 应该返回 pulled>=0（可能有历史数据）', async () => {
      const result = await rxdb.versionManager.pull();
      expect(result.pulled).toBeGreaterThanOrEqual(0);
    });

    it('push 更新已 push 的数据应该正确处理', async () => {
      // 创建并 push
      const todo = new Todo();
      todo.title = `${testPrefix}-update-pushed-1`;
      await todo.save();
      await rxdb.versionManager.push();

      // 更新并再次 push
      todo.title = `${testPrefix}-update-pushed-2`;
      await todo.save();
      const result = await rxdb.versionManager.push();
      expect(result.pushed).toBeGreaterThanOrEqual(1);

      // 验证远程数据是最新的
      const { data: remoteTodo } = await remoteAdapter.client.from('todos').select('*').eq('id', todo.id).single();
      expect(remoteTodo?.title).toBe(`${testPrefix}-update-pushed-2`);
    });
  });
});
