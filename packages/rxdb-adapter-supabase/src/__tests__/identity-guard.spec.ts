/**
 * 远端会话换了主人之后的拉取与推送（US-035 AC#6）
 *
 * 连真实 Supabase，令牌是测试栈的 JWT 密钥签发的真令牌：库声明的身份是 A，适配器的会话实际是 B。
 * 要钉住的不是「报了错」，而是「一个远端请求都没发、本地数据一行没动、待推变更还在原处」。
 * 本地库用内存 VFS，不能跨实例重开；「重开同一个库」的行为由核心的持久化替身测试覆盖。
 */
import { RxDB, RxDBIdentityMismatchError, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import { createAuthenticatedTestClient, getSupabaseServiceRoleClient, TEST_USER_ID } from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000b2';

interface SyncClient {
  rxdb: RxDB;
  local: RxDBAdapterWaSqlite;
  remote: RxDBAdapterSupabase;
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('远端会话换了主人', () => {
  const runId = crypto.randomUUID().replaceAll('-', '');
  const databases: RxDB[] = [];
  const todoIds: string[] = [];

  /**
   * @param declared - 库声明的身份（`RxDBOptions.identity.subject`）
   * @param session - 适配器的会话令牌实际属于谁
   */
  async function createClient(name: string, declared: string, session: string): Promise<SyncClient> {
    const rxdb = new RxDB({
      dbName: `id-${runId.slice(0, 8)}-${name}`,
      context: { userId: crypto.randomUUID() },
      identity: { scope: SUPABASE_URL, subject: declared },
      entities: [Todo],
      sync: { type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
    });
    databases.push(rxdb);
    rxdb.adapter(
      'wa-sqlite',
      db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS', async: true, worker: false, wasmPath: asyncWasmPath })
    );
    rxdb.adapter('supabase', db => new RxDBAdapterSupabase(db, { client: createAuthenticatedTestClient(session) }));
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

  async function hasLocalTodo(client: SyncClient, id: Todo['id']): Promise<boolean> {
    const rows = await client.local.getRepository(Todo).find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] },
      limit: 1
    });
    return rows.length === 1;
  }

  async function remoteHasTodo(id: string): Promise<boolean> {
    const { data, error } = await getSupabaseServiceRoleClient().from('todos').select('id').eq('id', id);
    if (error) throw error;
    return data.length === 1;
  }

  afterAll(async () => {
    await Promise.all(databases.map(database => database.disconnectAll()));
    if (todoIds.length === 0) return;
    const serviceRole = getSupabaseServiceRoleClient();
    await serviceRole.from('todos').delete().in('id', todoIds);
    await serviceRole.from('rxdb_change').delete().in('entityId', todoIds);
  });

  it('适配器按会话令牌报告调用者：就是令牌里的用户', async () => {
    const client = await createClient('reports', TEST_USER_ID, OTHER_USER_ID);

    await expect(client.remote.callerIdentity()).resolves.toEqual({ scope: SUPABASE_URL, subject: OTHER_USER_ID });
  });

  it('会话就是声明的身份：拉取与推送照常', async () => {
    const client = await createClient('match', TEST_USER_ID, TEST_USER_ID);
    const todo = await saveTodo(client, `${runId}-match`);

    await expect(client.rxdb.syncManager.pushRepository('public', 'Todo')).resolves.toBeDefined();
    await expect(client.rxdb.syncManager.pullRepository('public', 'Todo')).resolves.toBeDefined();

    expect(await remoteHasTodo(todo.id)).toBe(true);
  });

  it('拉取：报身份不匹配，一个远端请求都不发', async () => {
    const client = await createClient('pull', TEST_USER_ID, OTHER_USER_ID);
    const pullChanges = vi.spyOn(client.remote, 'pullChanges');
    const pullChangesBatch = vi.spyOn(client.remote, 'pullChangesBatch');
    const backendId = vi.spyOn(client.remote, 'backendId');

    await expect(client.rxdb.syncManager.pullRepository('public', 'Todo')).rejects.toBeInstanceOf(
      RxDBIdentityMismatchError
    );
    await expect(client.rxdb.syncManager.pull()).rejects.toBeInstanceOf(RxDBIdentityMismatchError);

    expect(pullChanges).not.toHaveBeenCalled();
    expect(pullChangesBatch).not.toHaveBeenCalled();
    expect(backendId).not.toHaveBeenCalled();
    expect(client.rxdb.syncState.snapshot.lastError).toBeInstanceOf(RxDBIdentityMismatchError);
  });

  it('推送：报身份不匹配，远端没有这一行，待推变更留在原处', async () => {
    const client = await createClient('push', TEST_USER_ID, OTHER_USER_ID);
    const todo = await saveTodo(client, `${runId}-push`);
    const mergeChanges = vi.spyOn(client.remote, 'mergeChanges');

    await expect(client.rxdb.syncManager.pushRepository('public', 'Todo')).rejects.toBeInstanceOf(
      RxDBIdentityMismatchError
    );

    expect(mergeChanges).not.toHaveBeenCalled();
    expect(await remoteHasTodo(todo.id)).toBe(false);
    // 本地行还在，下一次以原来的身份推送时照常发出
    expect(await hasLocalTodo(client, todo.id)).toBe(true);
  });

  it('会话换回声明的身份之后：之前被拦下的推送照常发出', async () => {
    const client = await createClient('recover', TEST_USER_ID, OTHER_USER_ID);
    const todo = await saveTodo(client, `${runId}-recover`);
    await expect(client.rxdb.syncManager.pushRepository('public', 'Todo')).rejects.toBeInstanceOf(
      RxDBIdentityMismatchError
    );

    vi.spyOn(client.remote, 'callerIdentity').mockResolvedValue({ scope: SUPABASE_URL, subject: TEST_USER_ID });
    await client.rxdb.syncManager.pushRepository('public', 'Todo');

    expect(await remoteHasTodo(todo.id)).toBe(true);
  });
});
