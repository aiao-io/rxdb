/**
 * Pull remoteId 调试测试
 *
 * 专门测试 pull 后 RxDBChange 的 remoteId 是否正确设置
 */
import { encodeRxDBChangeEntityId, RxDB, RxDBChange, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { cleanupSqliteAdapter } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000010';
const changeEntityIdQueryValues = (id: string): string[] => [id, encodeRxDBChangeEntityId(id)];

describe('Pull remoteId 调试测试', () => {
  const testPrefix = `remoteid-debug-${Date.now()}`;
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

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `remoteid-debug-test-${Date.now()}`,
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
    await cleanupRemoteData(remoteAdapter);
  });

  afterAll(async () => {
    if (remoteAdapter) {
      await cleanupRemoteData(remoteAdapter);
    }
  });

  it('验证 pull 来的数据不生成本地 RxDBChange 记录', async () => {
    // 清理之前测试留下的本地 changes
    await cleanupLocalChanges();

    // 验证清理后的状态
    const changeRepo = localAdapter.getRepository(RxDBChange);
    await changeRepo.find({ where: { combinator: 'and', rules: [] } });

    // 清空之前的变更
    await rxdb.versionManager.push();

    // 1. 在远程创建数据
    const remoteId = crypto.randomUUID();
    const remoteTitle = `${testPrefix}-test-1`;

    await remoteAdapter.client.from('todos').insert({
      id: remoteId,
      title: remoteTitle,
      completed: false,
      createdBy: 'remote-client',
      updatedBy: 'remote-client',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // 在远程 RxDBChange 表插入记录
    const { error } = await remoteAdapter.client
      .from('rxdb_change')
      .insert({
        namespace: 'public',
        entity: 'Todo',
        entityId: remoteId,
        type: 'INSERT',
        patch: { id: remoteId, title: remoteTitle, completed: false },
        clientId: 'remote-client',
        createdAt: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw error;

    await rxdb.versionManager.pull();

    // 3. 验证本地 RxDBChange 表中不应该有这条记录
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
    const todo = await todoRepo.findOne({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: remoteId }] }
    });
    expect(todo).toBeDefined();
    expect(todo?.title).toBe(remoteTitle);
  });

  it('验证本地创建的 change 没有 remoteId', async () => {
    const todo = new Todo();
    todo.title = `${testPrefix}-local-test`;
    await todo.save();

    const changeRepo = localAdapter.getRepository(RxDBChange);
    const localChanges = await changeRepo.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'entityId', operator: 'in', value: changeEntityIdQueryValues(todo.id) }]
      }
    });

    expect(localChanges.length).toBeGreaterThanOrEqual(1);
    expect(localChanges.every(c => c.remoteId === null)).toBe(true);
  });

  it('验证 push 后再 pull 不会重复数据', async () => {
    // 清理之前测试留下的本地 changes
    await cleanupLocalChanges();
    // 创建并 push 本地数据
    const todo = new Todo();
    todo.title = `${testPrefix}-push-then-pull`;
    await todo.save();

    await rxdb.versionManager.push();

    // Pull - 不应该重复 pull 刚 push 的数据
    await rxdb.versionManager.pull();

    // 查询本地 RxDBChange
    const changeRepo = localAdapter.getRepository(RxDBChange);
    const localChanges = await changeRepo.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'entityId', operator: 'in', value: changeEntityIdQueryValues(todo.id) }]
      }
    });

    // 本地仍只有一条变更，push ACK 会写回远程 change id，pull 不会重复创建。
    expect(localChanges).toHaveLength(1);
    expect(localChanges.every(change => change.remoteId !== null)).toBe(true);
  });
});
