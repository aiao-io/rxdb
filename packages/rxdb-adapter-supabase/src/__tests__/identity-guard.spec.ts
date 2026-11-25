/**
 * 身份对不上的库与会话：打开时被拒，同步前被拦（US-035 AC#3～#7）
 *
 * 连真实 Supabase，令牌是测试栈的 JWT 密钥签发的真令牌：库声明的身份是 A，适配器的会话实际是 B。
 * 要钉住的不是「报了错」，而是「一个远端请求都没发、本地数据一行没动、待推变更还在原处」。
 * 默认用内存 VFS；要「关掉之后以同一个库名重开」的用例改用 IndexedDB 持久化（`persistent`）。
 */
import {
  getRxDBIdentityDatabaseName,
  RxDB,
  RXDB_ANONYMOUS_SUBJECT,
  RxDBError,
  RxDBIdentityMismatchError,
  RxDBMigration,
  RxDBSync,
  SyncType
} from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { identityFingerprint, rxDBPluginSync, RxDBSyncIdentityBinding } from '@aiao/rxdb-plugin-sync';
import { Todo } from '@aiao/rxdb-test/entities';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';
import {
  createAuthenticatedTestClient,
  getSupabaseServiceRoleClient,
  signRefreshedTestAccessToken,
  signTestAccessToken,
  TEST_USER_ID
} from './test-utils.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000b2';
/** 离线：这个端口上没有服务，请求连不上（discard 端口，本机不监听） */
const UNREACHABLE_URL = 'http://127.0.0.1:9';

interface SyncClient {
  rxdb: RxDB;
  local: RxDBAdapterWaSqlite;
  remote: RxDBAdapterSupabase;
}

interface ClientOptions {
  /** 本地库存进 IndexedDB，实例销毁之后能以同一个库名重开 */
  persistent?: boolean;
  /** 自带的客户端；不给就按 `session` 签一个已登录用户的客户端 */
  supabase?: SupabaseClient;
}

/** 在限定时间内读本地 Todo：读到行是 `{ rows }`，报错是 `{ error }`，到点还在等就是 `'still-waiting'` */
function readTodosWithin(rxdb: RxDB, milliseconds: number): Promise<{ rows: Todo[] } | { error: unknown } | string> {
  const find = firstValueFrom(rxdb.entityManager.getRepository(Todo).find({ where: { combinator: 'and', rules: [] } }));
  return Promise.race([
    find.then(
      rows => ({ rows }),
      (error: unknown) => ({ error })
    ),
    new Promise<string>(resolve => setTimeout(() => resolve('still-waiting'), milliseconds))
  ]);
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)('远端会话换了主人', () => {
  const runId = crypto.randomUUID().replaceAll('-', '');
  const databases: RxDB[] = [];
  const todoIds: string[] = [];

  /**
   * 建实例、登记适配器，不连接
   *
   * @param name - 本地库名（加上本轮的前缀）
   * @param declared - 库声明的身份（`RxDBOptions.identity.subject`）；`null` 表示不声明身份
   * @param session - 适配器的会话令牌实际属于谁
   */
  function openDatabase(name: string, declared: string | null, session: string, options: ClientOptions = {}): RxDB {
    const rxdb = new RxDB({
      dbName: `id-${runId.slice(0, 8)}-${name}`,
      context: { userId: crypto.randomUUID() },
      ...(declared === null ? {} : { identity: { scope: SUPABASE_URL, subject: declared } }),
      entities: [Todo],
      sync: { type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
    });
    databases.push(rxdb);
    rxdb.adapter(
      'wa-sqlite',
      db =>
        new RxDBAdapterWaSqlite(db, {
          vfs: options.persistent ? 'IDBBatchAtomicVFS' : 'MemoryAsyncVFS',
          async: true,
          worker: false,
          wasmPath: asyncWasmPath
        })
    );
    rxdb.adapter(
      'supabase',
      db => new RxDBAdapterSupabase(db, { client: options.supabase ?? createAuthenticatedTestClient(session) })
    );
    rxdb.use(rxDBPluginHistory);
    rxdb.use(rxDBPluginSync);
    return rxdb;
  }

  /** 建实例并连上本地库（参数同 {@link openDatabase}） */
  async function createClient(
    name: string,
    declared: string | null,
    session: string,
    options: ClientOptions = {}
  ): Promise<SyncClient> {
    const rxdb = openDatabase(name, declared, session, options);
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
    // 持久化的本地库都在 IDBBatchAtomicVFS 这一个 IndexedDB 库里，用完整个删掉
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('IDBBatchAtomicVFS');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
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

  // AC#3：A 刷新过令牌（新的签名与过期时间，同一个 sub），同步照常，库绑定的始终是 A
  it('同一个用户刷新令牌之后照常同步，库绑定的始终是这个用户', async () => {
    let token = await signTestAccessToken(TEST_USER_ID);
    const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY, { accessToken: async () => token });
    const client = await createClient('refresh', TEST_USER_ID, TEST_USER_ID, { supabase });
    const before = await saveTodo(client, `${runId}-refresh-before`);
    await client.rxdb.syncManager.pushRepository('public', 'Todo');

    const refreshed = await signRefreshedTestAccessToken(TEST_USER_ID);
    expect(refreshed).not.toBe(token);
    token = refreshed;
    const after = await saveTodo(client, `${runId}-refresh-after`);
    await client.rxdb.syncManager.pushRepository('public', 'Todo');
    await expect(client.rxdb.syncManager.pullRepository('public', 'Todo')).resolves.toBeDefined();

    expect(await remoteHasTodo(before.id)).toBe(true);
    expect(await remoteHasTodo(after.id)).toBe(true);
    const fingerprint = identityFingerprint({ scope: SUPABASE_URL, subject: TEST_USER_ID });
    const everything = { where: { combinator: 'and' as const, rules: [] } };
    const bindings = await client.local.getRepository(RxDBSyncIdentityBinding).find(everything);
    expect(bindings.map(binding => binding.identityFingerprint)).toEqual([fingerprint]);
    const migrations = await client.local.getRepository(RxDBMigration).find(everything);
    expect(migrations.filter(migration => migration.name.endsWith(fingerprint))).toHaveLength(1);
  });

  // AC#4：库已绑定 A，应用以 B 的身份打开它。在线时远端会话就是 B，与声明一致，同步前那道核对拦不住；
  // 离线时远端连不上。两种情况拦下它的都是打开时的核对：连接被拒，仓储读不到 A 的行，A 回来时库原样还在
  it('库已绑定 A、以 B 的身份打开：在线与离线都拒绝连接，读不到 A 的行，本地数据不动', async () => {
    const a = await createClient('bound-a', TEST_USER_ID, TEST_USER_ID, { persistent: true });
    const todo = await saveTodo(a, `${runId}-bound-a`);
    await a.rxdb.destroy();

    const offline = createSupabaseClient(UNREACHABLE_URL, SUPABASE_KEY, {
      accessToken: () => signTestAccessToken(OTHER_USER_ID)
    });
    const sessions = [
      ['online', createAuthenticatedTestClient(OTHER_USER_ID)],
      ['offline', offline]
    ] as const;
    for (const [mode, supabase] of sessions) {
      const b = openDatabase('bound-a', OTHER_USER_ID, OTHER_USER_ID, { persistent: true, supabase });
      if (mode === 'online') {
        const remote = (await b.connect('supabase')) as RxDBAdapterSupabase;
        await expect(remote.callerIdentity()).resolves.toEqual({ scope: SUPABASE_URL, subject: OTHER_USER_ID });
      }

      await expect(b.connect('wa-sqlite'), mode).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
      expect(await readTodosWithin(b, 500), mode).not.toHaveProperty('rows');
      await b.destroy();
    }

    const reopened = await createClient('bound-a', TEST_USER_ID, TEST_USER_ID, { persistent: true });
    expect(await hasLocalTodo(reopened, todo.id)).toBe(true);
    // 对照：身份对得上时，同一个读在时限内拿到 A 的行，上面的「读不到」不是读得慢
    const control = await readTodosWithin(reopened.rxdb, 500);
    expect(control).toHaveProperty('rows');
    expect((control as { rows: Todo[] }).rows.map(row => row.id)).toContain(todo.id);
  });

  // RV-01a2118227d9715ab33e8ef2556bb4b6：库没声明身份时以 A 同步过，应用之后改为声明身份、仍用这个库名。
  // 第一次声明打开的是 B：同步插件按会话写下的绑定同时记进了库的身份绑定，打开即被拒、读不到 A 的行；
  // A 以自己的身份声明打开照常连接，未声明期留下的待推变更推得出去
  it('没声明身份时以 A 同步过的库：之后以 B 声明打开被拒，以 A 声明打开照常同步', async () => {
    const undeclared = await createClient('undeclared-a', null, TEST_USER_ID, { persistent: true });
    const synced = await saveTodo(undeclared, `${runId}-undeclared-synced`);
    await undeclared.rxdb.syncManager.pushRepository('public', 'Todo');
    const pending = await saveTodo(undeclared, `${runId}-undeclared-pending`);
    await undeclared.rxdb.destroy();

    const b = openDatabase('undeclared-a', OTHER_USER_ID, OTHER_USER_ID, { persistent: true });
    await expect(b.connect('wa-sqlite')).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
    expect(await readTodosWithin(b, 500)).not.toHaveProperty('rows');
    await b.destroy();

    const a = await createClient('undeclared-a', TEST_USER_ID, TEST_USER_ID, { persistent: true });
    expect(await hasLocalTodo(a, pending.id)).toBe(true);
    await a.rxdb.syncManager.pushRepository('public', 'Todo');
    expect(await remoteHasTodo(synced.id)).toBe(true);
    expect(await remoteHasTodo(pending.id)).toBe(true);
  });

  // AC#5：库按未登录的身份建、绑定 anon。登录之后应用仍打开这个库被拒；改按登录用户算库名，照常同步
  it('库已绑定 anon、登录后仍用这个库：拒绝连接；改用该用户自己的库照常同步', async () => {
    const anonymous = { scope: SUPABASE_URL, subject: RXDB_ANONYMOUS_SUBJECT };
    const signedIn = { scope: SUPABASE_URL, subject: TEST_USER_ID };
    const visitorLibrary = getRxDBIdentityDatabaseName('visitor', anonymous);
    const ownLibrary = getRxDBIdentityDatabaseName('visitor', signedIn);
    expect(ownLibrary).not.toBe(visitorLibrary);

    const visitor = await createClient(visitorLibrary, RXDB_ANONYMOUS_SUBJECT, RXDB_ANONYMOUS_SUBJECT, {
      persistent: true,
      supabase: createSupabaseClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    });
    await expect(visitor.remote.callerIdentity()).resolves.toEqual(anonymous);
    await visitor.rxdb.destroy();

    const stale = openDatabase(visitorLibrary, TEST_USER_ID, TEST_USER_ID, { persistent: true });
    await expect(stale.connect('wa-sqlite')).rejects.toBeInstanceOf(RxDBIdentityMismatchError);
    await stale.destroy();

    const own = await createClient(ownLibrary, TEST_USER_ID, TEST_USER_ID, { persistent: true });
    const todo = await saveTodo(own, `${runId}-signed-in`);
    await own.rxdb.syncManager.pushRepository('public', 'Todo');
    await expect(own.rxdb.syncManager.pullRepository('public', 'Todo')).resolves.toBeDefined();
    expect(await remoteHasTodo(todo.id)).toBe(true);
  });

  // AC#7：A 的拉取在途，应用销毁 A 的实例、以 B 的身份打开 B 的库，之后旧响应才到
  it('A 的拉取在途时销毁实例、换 B 的库：旧响应不落进任何一个库，A 的进度不动', async () => {
    const writer = await createClient('inflight-writer', TEST_USER_ID, TEST_USER_ID);
    const todo = await saveTodo(writer, `${runId}-inflight`);
    await writer.rxdb.syncManager.pushRepository('public', 'Todo');

    const a = await createClient('inflight-a', TEST_USER_ID, TEST_USER_ID, { persistent: true });
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const fetched: string[] = [];
    const pullChanges = a.remote.pullChanges.bind(a.remote);
    vi.spyOn(a.remote, 'pullChanges').mockImplementation(async (...args) => {
      const changes = await pullChanges(...args);
      fetched.push(...changes.map(change => String(change.entityId)));
      await gate;
      return changes;
    });
    const pending = a.rxdb.syncManager.pullRepository('public', 'Todo').then(
      () => 'pulled' as const,
      (error: unknown) => error
    );
    await vi.waitFor(() => expect(fetched).toContain(todo.id), { timeout: 15_000, interval: 50 });

    await a.rxdb.destroy();
    const b = await createClient('inflight-b', OTHER_USER_ID, OTHER_USER_ID);
    release();

    // 旧实例的拉取以错误收场，不悬着：它所属的连接已经结束
    expect(await pending).toBeInstanceOf(RxDBError);
    expect(await hasLocalTodo(b, todo.id)).toBe(false);
    const reopened = await createClient('inflight-a', TEST_USER_ID, TEST_USER_ID, { persistent: true });
    expect(await hasLocalTodo(reopened, todo.id)).toBe(false);
    const records = await reopened.local.getRepository(RxDBSync).find({
      where: { combinator: 'and', rules: [{ field: 'entity', operator: '=', value: 'Todo' }] }
    });
    expect(records.map(record => record.lastPullRemoteChangeId ?? null)).not.toContainEqual(expect.any(Number));
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
