/**
 * 远端重置后旧客户端的拉取与推送（requirements/livestore-research.md「P0：记录远端身份，处理远端重置」）
 *
 * 连真实 Supabase。共享测试栈不能真的推倒重建（同一个栈上还有其它用例），这里拼出重建后的处境：
 * 以 service_role 把远端身份换成新值（重建会生成新的 `rxdb_backend` 行），再把旧客户端的拉取游标
 * 抬到远端全部 id 之上（重建后 id 从头计数，旧游标越过新库的全部 id）。
 * 远端身份在用例结束时换回原值。
 */
import { RxDB, RxDBSync, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { RemoteBackendMismatchError, rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { getSupabaseServiceRoleClient } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const TODO_SYNC_ID = 'public:Todo:main';

interface SyncClient {
  rxdb: RxDB;
  local: RxDBAdapterWaSqlite;
  remote: RxDBAdapterSupabase;
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('远端重置后的旧客户端', () => {
  const runId = crypto.randomUUID().replaceAll('-', '');
  const databases: RxDB[] = [];
  const todoIds: string[] = [];
  let originalBackendId: string;
  let rebuiltBackendId: string;
  let stale: SyncClient;
  let staleWrite: Todo;
  let afterReset: Todo;

  async function createClient(name: string): Promise<SyncClient> {
    const rxdb = new RxDB({
      dbName: `reset-${runId}-${name}`,
      context: { userId: crypto.randomUUID() },
      entities: [Todo],
      sync: {
        type: SyncType.Full,
        local: { adapter: 'wa-sqlite' },
        remote: { adapter: 'supabase' }
      }
    });
    databases.push(rxdb);
    rxdb.adapter(
      'wa-sqlite',
      db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS', async: true, worker: false, wasmPath: asyncWasmPath })
    );
    rxdb.adapter(
      'supabase',
      db => new RxDBAdapterSupabase(db, { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY })
    );
    rxdb.use(rxDBPluginHistory);
    rxdb.use(rxDBPluginSync);
    await rxdb.connect('wa-sqlite');
    return {
      rxdb,
      local: (await rxdb.getAdapter('wa-sqlite')) as RxDBAdapterWaSqlite,
      remote: (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase
    };
  }

  async function saveTodo(client: SyncClient, title: string): Promise<Todo> {
    const todo = client.rxdb.entityManager.instantiate(Todo, { title, completed: false });
    await todo.save();
    todoIds.push(todo.id);
    return todo;
  }

  async function todoSyncRecord(client: SyncClient): Promise<RxDBSync> {
    const [record] = await client.local.getRepository(RxDBSync).find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: TODO_SYNC_ID }] },
      limit: 1
    });
    if (!record) throw new Error(`${client.rxdb.config.dbName} 还没有 Todo 的同步记录`);
    return record;
  }

  async function hasLocalTodo(client: SyncClient, id: Todo['id']): Promise<boolean> {
    const rows = await client.local.getRepository(Todo).find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] },
      limit: 1
    });
    return rows.length === 1;
  }

  async function hasRemoteTodo(id: string): Promise<boolean> {
    const { data, error } = await getSupabaseServiceRoleClient().from('todos').select('id').eq('id', id);
    if (error) throw error;
    return data.length === 1;
  }

  async function setRemoteBackendId(id: string): Promise<void> {
    const { error } = await getSupabaseServiceRoleClient().from('rxdb_backend').update({ id }).eq('singleton', true);
    if (error) throw error;
  }

  async function remoteMaxChangeId(): Promise<number> {
    const { data, error } = await getSupabaseServiceRoleClient()
      .from('rxdb_change')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data[0]?.id ?? 0;
  }

  beforeAll(async () => {
    const writer = await createClient('writer');
    stale = await createClient('stale');
    originalBackendId = await writer.remote.backendId();

    await saveTodo(writer, `${runId}-before-reset`);
    await writer.rxdb.syncManager.pushRepository('public', 'Todo');
    await stale.rxdb.syncManager.pullRepository('public', 'Todo');

    rebuiltBackendId = crypto.randomUUID();
    await setRemoteBackendId(rebuiltBackendId);
    const record = await todoSyncRecord(stale);
    await stale.local
      .getRepository(RxDBSync)
      .update(record, { lastPullRemoteChangeId: (await remoteMaxChangeId()) + 1_000_000 });

    const fresh = await createClient('fresh');
    afterReset = await saveTodo(fresh, `${runId}-after-reset`);
    await fresh.rxdb.syncManager.pushRepository('public', 'Todo');
    staleWrite = await saveTodo(stale, `${runId}-stale-write`);
  });

  afterAll(async () => {
    try {
      if (originalBackendId) await setRemoteBackendId(originalBackendId);
      if (todoIds.length > 0) {
        const serviceRole = getSupabaseServiceRoleClient();
        const { error: entityError } = await serviceRole.from('todos').delete().in('id', todoIds);
        if (entityError) throw entityError;
        const { error: logError } = await serviceRole.from('rxdb_change').delete().in('entityId', todoIds);
        if (logError) throw logError;
      }
    } finally {
      for (const database of databases) await database.disconnectAll();
    }
  });

  it('远端身份在同一个库上稳定，首次同步把游标绑到它上面', async () => {
    expect(originalBackendId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await stale.remote.backendId()).toBe(rebuiltBackendId);
    expect((await todoSyncRecord(stale)).remoteBackendId).toBe(originalBackendId);
  });

  it('拉取明确报错而不是静默拉空，错误进 SyncState.lastError', async () => {
    const error = await stale.rxdb.syncManager
      .pullRepository('public', 'Todo')
      .catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(RemoteBackendMismatchError);
    expect(error).toMatchObject({ backendId: rebuiltBackendId, boundBackendIds: [originalBackendId] });
    expect(stale.rxdb.syncState.snapshot.lastError).toBe(error);
    expect(await hasLocalTodo(stale, afterReset.id)).toBe(false);
  });

  it('推送与待拉计数同样被挡下，本地待推变更不进新远端', async () => {
    await expect(stale.rxdb.syncManager.pushRepository('public', 'Todo')).rejects.toBeInstanceOf(
      RemoteBackendMismatchError
    );
    await expect(stale.rxdb.syncManager.checkRepositoryUpdates('public', 'Todo')).rejects.toBeInstanceOf(
      RemoteBackendMismatchError
    );
    expect(await hasRemoteTodo(staleWrite.id)).toBe(false);
  });

  it('显式重绑定后从新远端全量拉取，本地待推变更照常推出', async () => {
    await expect(stale.rxdb.syncManager.rebindRemoteBackend()).resolves.toEqual({
      backendId: rebuiltBackendId,
      previousBackendIds: [originalBackendId],
      rebound: 1
    });
    expect(stale.rxdb.syncState.snapshot.lastError).toBeNull();
    expect(await todoSyncRecord(stale)).toMatchObject({
      remoteBackendId: rebuiltBackendId,
      lastPullRemoteChangeId: null
    });

    await stale.rxdb.syncManager.pullRepository('public', 'Todo', { fetchAll: true });
    expect(await hasLocalTodo(stale, afterReset.id)).toBe(true);

    await expect(stale.rxdb.syncManager.pushRepository('public', 'Todo')).resolves.toMatchObject({ failed: 0 });
    expect(await hasRemoteTodo(staleWrite.id)).toBe(true);
  });
});
