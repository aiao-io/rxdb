/**
 * SWM-006：真实 module Worker 的生命周期门禁。
 *
 * 本包原有的 Worker/OPFS 覆盖全是 mock：`sqlite-load.utils.spec.ts` 只验证 mock storage
 * 收到了参数，`create_sqlite_client.remote.spec.ts` 把 `wrapWithComlink` 整体 mock 掉。
 * 于是「跨线程」这件事本身从来没被执行过——SWM-002 才能在 90%+ 覆盖率下存活。
 *
 * 这里起的是**真的** module Worker（`sqlite-wasm-lifecycle.worker.ts`，形状与 README
 * 和 `apps/dev-rxdb-*` 逐字一致），跑真的 wa-sqlite、真的 OPFS、真的 Comlink 端口。
 *
 * SWM-002 / SWM-010 的回归断言也保留在本文件，确保生命周期修复落在真实线程上。
 */

import { Entity, ENTITY_LOCAL_CREATE_EVENT, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import type { SqliteChangeEvent, SqliteClientLike } from '@aiao/rxdb-adapter-sqlite-core';
import { releaseComlinkProxy, SQLiteChangeType, wrapWithComlink } from '@aiao/rxdb-adapter-sqlite-core';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { proxy, releaseProxy } from 'comlink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSqliteClient } from '../create_sqlite_client.js';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';
import type { LoadModuleOptions } from '../sqlite.interface.js';
import { SqliteClient } from '../SqliteClient.js';

/**
 * Comlink 远端句柄。
 *
 * 与 `create_sqlite_client.ts` 里的 `SqliteWasmClientLike` 同形：`SqliteClientLike` 已经
 * 把每个方法声明成 `T | Promise<T>`，所以远端和本地共用一套类型，await 都是合法的。
 */
interface RemoteSqliteClient extends SqliteClientLike {
  init(dbName: string, options: LoadModuleOptions): Promise<void>;
  /** 与 `create_sqlite_client.ts` 的 `SqliteWasmClientLike` 同因收窄成必选（见那里的 @remarks）。 */
  beginTransactionSql(): string | Promise<string>;
  beginSystemMigrationTransactionSql(): string | Promise<string>;
}

/** WATCH_TABLES 里的表名之一——只有这三张表的写入才会触发 update_hook 派发。 */
const WATCHED_TABLE = 'rxdb$rxdb_change';

const liveWorkers: Worker[] = [];

/**
 * 起一个真实 module Worker。
 *
 * 统一登记以便 `afterEach` 兜底 terminate：caller-owned Worker 本就由调用方回收，
 * client-owned Worker 重复 terminate 也是安全的。
 */
const spawnWorker = (): Worker => {
  const worker = new Worker(new URL('./sqlite-wasm-lifecycle.worker', import.meta.url), { type: 'module' });
  liveWorkers.push(worker);
  return worker;
};

/** 直接拿到远端句柄（不走 `createSqliteClient`，以便自己控制 init 时机）。 */
const remoteClientOn = (worker: Worker): RemoteSqliteClient =>
  wrapWithComlink<RemoteSqliteClient>(new SqliteClient() as unknown as RemoteSqliteClient, {
    worker: true,
    workerInstance: worker
  });

const memoryOptions = (): LoadModuleOptions => ({
  vfs: 'memory',
  wasmUrl: sqliteWasmUrl,
  worker: true,
  batchTimeout: 1
});

const opfsRootNames = async (): Promise<string[]> => {
  const root = await navigator.storage.getDirectory();
  const names: string[] = [];
  for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
    names.push(name);
  }
  return names;
};

afterEach(() => {
  for (const worker of liveWorkers.splice(0)) worker.terminate();
});

describe('SWM-006 · 真实 module Worker × memory VFS 的完整生命周期', () => {
  it('init → version → SQL 往返：跨线程跑的是真的 SQLite', async () => {
    const client = remoteClientOn(spawnWorker());
    await client.init('swm006-memory', memoryOptions());

    // 版本号来自 Worker 里的 wasm，主线程从未加载过它
    await expect(client.version()).resolves.toMatch(/^3\.\d+\.\d+$/);

    await client.execute('CREATE TABLE t(a INTEGER, b TEXT)');
    await client.execute('INSERT INTO t VALUES (?, ?)', [1, 'x']);
    const result = await client.execute('SELECT a, b FROM t');

    expect(result.results[0].rows).toEqual([[1, 'x']]);
  });

  it('disconnect 之后 execute 被拒绝', async () => {
    const client = remoteClientOn(spawnWorker());
    await client.init('swm006-memory-disconnect', memoryOptions());
    await client.disconnect();

    await expect(client.execute('SELECT 1')).rejects.toThrow(/has been disconnected/);
  });

  it('同一个 Worker 在客户端断开并释放端口后可建立新连接', async () => {
    const worker = spawnWorker();
    const first = await createSqliteClient('swm002-reuse-1', {
      ...memoryOptions(),
      workerInstance: worker
    });
    await first.execute('CREATE TABLE first_connection(v TEXT)');
    await first.disconnect();
    expect(releaseComlinkProxy(first)).toBe(true);

    const second = await createSqliteClient('swm002-reuse-2', {
      ...memoryOptions(),
      workerInstance: worker
    });
    await second.execute('CREATE TABLE second_connection(v TEXT)');
    await expect(
      second.execute('SELECT name FROM sqlite_master WHERE name = ?', ['second_connection'])
    ).resolves.toMatchObject({
      results: [{ rows: [['second_connection']] }]
    });
    await second.disconnect();
    expect(releaseComlinkProxy(second)).toBe(true);
  });
});

describe('SWM-006 · OPFS 只有在真实 Worker 里才成立', () => {
  it('主线程直连 opfs 被环境守卫挡住', async () => {
    await expect(createSqliteClient('swm006-opfs-main', { vfs: 'opfs', wasmUrl: sqliteWasmUrl })).rejects.toThrow(
      /vfs opfs only support worker/
    );
  });

  it('Worker 里的 opfs 真的落盘，另一个 Worker 打开同名库能读到', async () => {
    const dbName = 'swm006-opfs-shared';
    const opfsOptions = { vfs: 'opfs' as const, wasmUrl: sqliteWasmUrl, worker: true, batchTimeout: 1 };

    // 走公开 API：`createSqliteClient` 会把 worker/workerInstance 一起转发给远端 init
    const writer = (await createSqliteClient(dbName, {
      ...opfsOptions,
      workerInstance: spawnWorker()
    })) as RemoteSqliteClient;

    await writer.execute('DROP TABLE IF EXISTS persisted');
    await writer.execute('CREATE TABLE persisted(v TEXT)');
    await writer.execute('INSERT INTO persisted VALUES (?)', ['written-in-worker-1']);
    await writer.disconnect();

    // 数据库文件确实出现在 OPFS 里，而不是躲在某个内存 VFS
    expect(await opfsRootNames()).toContain(`${dbName}.sqlite`);

    const reader = (await createSqliteClient(dbName, {
      ...opfsOptions,
      workerInstance: spawnWorker()
    })) as RemoteSqliteClient;
    const result = await reader.execute('SELECT v FROM persisted');
    await reader.disconnect();

    expect(result.results[0].rows).toEqual([['written-in-worker-1']]);
  });

  it('主线程谎报 worker:true 时由环境守卫给出可定位错误', async () => {
    const { sqliteLoad } = await import('../sqlite-load.utils.js');

    await expect(sqliteLoad('swm006-opfs-lie', { vfs: 'opfs', wasmUrl: sqliteWasmUrl, worker: true })).rejects.toThrow(
      /actual environment is main thread/
    );
  });

  it('真实 Worker 不传 worker 标志也能打开 opfs', async () => {
    const client = remoteClientOn(spawnWorker());

    await expect(
      client.init('swm010-opfs-actual-worker', { vfs: 'opfs', wasmUrl: sqliteWasmUrl, batchTimeout: 1 })
    ).resolves.toBeUndefined();
    await client.disconnect();
  });
});

describe('SWM-006 · 跨线程变更事件', () => {
  const listeningClientOn = async (dbName: string, events: SqliteChangeEvent[]): Promise<RemoteSqliteClient> => {
    const client = remoteClientOn(spawnWorker());
    await client.init(dbName, memoryOptions());
    await client.execute(`CREATE TABLE "${WATCHED_TABLE}"(v INTEGER)`);
    await client.execute('CREATE TABLE unwatched(v INTEGER)');
    // 远端返回 Promise，必须 await：不 await 就写库，监听可能还没注册上
    await client.addEventListener(
      SQLiteChangeType.SQLITE_INSERT,
      proxy((event: SqliteChangeEvent) => {
        events.push(event);
      })
    );
    return client;
  };

  it('WATCH_TABLES 的写入跨线程推给主线程，事件负载完整通过结构化克隆', async () => {
    const events: SqliteChangeEvent[] = [];
    const client = await listeningClientOn('swm006-events', events);

    await client.execute(`INSERT INTO "${WATCHED_TABLE}" VALUES (1)`);

    await vi.waitFor(() => expect(events).toHaveLength(1));
    const [event] = events;
    expect(event.type).toBe(SQLiteChangeType.SQLITE_INSERT);
    expect(event.tableName).toBe(WATCHED_TABLE);
    expect(event.rowIds).toHaveLength(1);
    // Date 不是 JSON，靠结构化克隆过线；退化成字符串的话下游 recordAt 比较会静默错
    expect(event.recordAt).toBeInstanceOf(Date);
  });

  it('同一批次里的多行合并成一个事件，rowIds 齐全', async () => {
    const events: SqliteChangeEvent[] = [];
    const client = await listeningClientOn('swm006-events-batch', events);

    // 一次 execute 内的三条 INSERT 落在同一个 debounce 窗口里
    await client.execute(
      `INSERT INTO "${WATCHED_TABLE}" VALUES (1); INSERT INTO "${WATCHED_TABLE}" VALUES (2); INSERT INTO "${WATCHED_TABLE}" VALUES (3);`
    );

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0].rowIds).toHaveLength(3);
  });

  it('WATCH_TABLES 之外的表不产生任何跨线程事件', async () => {
    const events: SqliteChangeEvent[] = [];
    const client = await listeningClientOn('swm006-events-filter', events);

    await client.execute('INSERT INTO unwatched VALUES (1)');
    await client.execute(`INSERT INTO "${WATCHED_TABLE}" VALUES (1)`);

    // 用「被监听的表」当路标：它到了，说明未被监听那条早就该到而没到
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0].tableName).toBe(WATCHED_TABLE);
  });

  it('同一 Worker 重连只保留新连接的事件监听', async () => {
    const worker = spawnWorker();
    const firstEvents: SqliteChangeEvent[] = [];
    const secondEvents: SqliteChangeEvent[] = [];
    const open = async (dbName: string, events: SqliteChangeEvent[]): Promise<SqliteClientLike> => {
      const client = await createSqliteClient(dbName, {
        vfs: 'memory',
        wasmUrl: sqliteWasmUrl,
        batchTimeout: 1,
        workerInstance: worker
      });
      await client.execute(`CREATE TABLE "${WATCHED_TABLE}"(v INTEGER)`);
      await client.addEventListener(
        SQLiteChangeType.SQLITE_INSERT,
        proxy((event: SqliteChangeEvent) => events.push(event))
      );
      return client;
    };

    const first = await open('swm002-listener-first', firstEvents);
    await first.execute(`INSERT INTO "${WATCHED_TABLE}" VALUES (1)`);
    await vi.waitFor(() => expect(firstEvents).toHaveLength(1));
    await first.disconnect();
    expect(releaseComlinkProxy(first)).toBe(true);

    const second = await open('swm002-listener-second', secondEvents);
    await second.execute(`INSERT INTO "${WATCHED_TABLE}" VALUES (2)`);
    await vi.waitFor(() => expect(secondEvents).toHaveLength(1));

    expect(firstEvents).toHaveLength(1);
    await second.disconnect();
    expect(releaseComlinkProxy(second)).toBe(true);
  });
});

describe('SWM-006 · 端口与线程的所有权', () => {
  it('caller-owned Worker 只释放客户端端口，不擅自终止线程', async () => {
    const worker = spawnWorker();
    const terminate = vi.spyOn(worker, 'terminate');
    const client = await createSqliteClient('swm002-caller-owned', {
      ...memoryOptions(),
      workerInstance: worker
    });
    await client.disconnect();
    expect(releaseComlinkProxy(client)).toBe(true);

    await expect((async () => client.version())()).rejects.toThrow(/released/);
    expect(terminate).not.toHaveBeenCalled();
  });

  it('client-owned Worker 在释放客户端时终止线程', async () => {
    const worker = spawnWorker();
    const terminate = vi.spyOn(worker, 'terminate');
    const client = await createSqliteClient('swm002-client-owned', {
      ...memoryOptions(),
      workerInstance: worker,
      workerOwnership: 'client'
    });

    await client.disconnect();
    expect(releaseComlinkProxy(client)).toBe(true);
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('client-owned Worker 初始化失败时也会终止', async () => {
    const worker = spawnWorker();
    const terminate = vi.spyOn(worker, 'terminate');

    await expect(
      createSqliteClient('swm002-client-owned-init-failure', {
        ...memoryOptions(),
        batchTimeout: -1,
        workerInstance: worker,
        workerOwnership: 'client'
      })
    ).rejects.toThrow(/batchTimeout/);
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('直接根代理执行 releaseProxy 后所有远端调用都失败', async () => {
    const client = remoteClientOn(spawnWorker());
    await client.init('swm006-release', memoryOptions());

    (client as unknown as { [releaseProxy]: () => void })[releaseProxy]();

    await expect((async () => client.version())()).rejects.toThrow(/released/);
  });
});

/**
 * 注意 **没有** `log: false`：变更事件链的第一环就是 change-log 表，
 * 关掉日志会让下面那条「跨线程推回主线程」的断言静默变成空转。
 */
@Entity({
  name: 'WorkerNote',
  tableName: 'worker_note',
  namespace: 'swm006',
  properties: [{ name: 'label', type: PropertyType.string, required: true }]
})
class WorkerNote extends EntityBase {
  label!: string;
}

describe('SWM-006 · 适配器走真实 Worker 的端到端路径', () => {
  const databases: RxDB[] = [];

  afterEach(async () => {
    const pending = databases.splice(0);
    await Promise.all(pending.map(database => database.disconnectAll().catch(() => undefined)));
  });

  it('connect → 建表 → 写入 → 读回全程跨线程，且变更事件经 proxy 回调回到主线程', async () => {
    const rxdb = new RxDB({
      dbName: `swm006-adapter-${Math.random().toString(36).slice(2, 8)}`,
      context: { userId: 'userId' },
      entities: [WorkerNote],
      sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
    });
    databases.push(rxdb);
    rxdb.adapter(
      'sqlite-wasm',
      async database =>
        new RxDBAdapterSqlite(database, {
          vfs: 'memory',
          batchTimeout: 1,
          wasmUrl: sqliteWasmUrl,
          worker: true,
          workerInstance: spawnWorker()
        })
    );

    const created: unknown[] = [];
    rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, event => created.push(event));

    await rxdb.connect('sqlite-wasm');
    const adapter = (await rxdb.getAdapter('sqlite-wasm')) as RxDBAdapterSqlite;

    const note = new WorkerNote();
    note.label = 'written-across-the-thread-boundary';
    await adapter.getRepository(WorkerNote).create(note);

    const rows = await adapter.query('SELECT label FROM "swm006$worker_note";');
    expect(rows.results[0].rows).toEqual([['written-across-the-thread-boundary']]);

    // `RxDBAdapterSqliteBase#ensureClientEventListeners` 用 comlink `proxy()` 注册回调；
    // 回调是主线程的闭包，被 Worker 里的 update_hook 反向调用。这条链断掉的话
    // 一切写入照常成功、只是活查询永远不刷新——正是 mock 门禁看不见的那类失效。
    await vi.waitFor(() => expect(created.length).toBeGreaterThan(0));
  });
});
