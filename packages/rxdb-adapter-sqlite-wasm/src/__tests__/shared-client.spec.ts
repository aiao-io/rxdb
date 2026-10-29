/**
 * @fileoverview SharedWorker 传输下多个标签页共用一个客户端、一条 SQLite 连接（US-314 B2.3b，修 main）。
 *
 * @remarks
 * 与 wa-sqlite 的同名 spec 同口径：SharedWorker 里只有一个 `SqliteClient`，每个连上来的标签页拿到的都是它。
 * 每个适配器只串行自己的队列，管不到别的标签页：一个标签页的事务开着时，另一个标签页的语句会落进这笔事务；
 * 一个标签页断开会把共用的连接关掉，别的标签页随后的读写全部失败。
 *
 * 同一个页面里开两个指向同一脚本、同一名字的 `SharedWorker` 对象，连的就是同一个 worker——与两个标签页同形。
 * 每条用例换一个 worker 名字，各是各的 worker 与内存库。
 */

import {
  ENTITY_LOCAL_CREATE_EVENT,
  RxDB,
  SyncType,
  getEntityMetadata,
  uuid,
  type TransactionExecutor
} from '@aiao/rxdb';
import { SQLiteChangeType } from '@aiao/rxdb-adapter-sqlite-core';
import { ConformanceNote, WORKING_TREE_CONFORMANCE_USER_ID } from '@aiao/rxdb-plugin-working-tree/testing';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { wrap } from 'comlink';
import { afterEach, describe, expect, it } from 'vitest';

import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';
import type { SqliteOptions } from '../sqlite.interface.js';
import { SqliteClient } from '../SqliteClient.js';

const ALL = { where: { combinator: 'and' as const, rules: [] } };
const POLL = { timeout: 5_000 };
const LOAD_OPTIONS = { vfs: 'memory' as const, wasmUrl: sqliteWasmUrl, batchTimeout: 1 };

const opened: RxDB[] = [];

afterEach(async () => {
  for (const database of opened.splice(0)) await database.disconnectAll();
});

const freshName = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// `new SharedWorker(new URL(…, import.meta.url), …)` 必须内联写：Vite 只认这个字面形状为 worker 入口
const connectSharedWorker = (name: string): SharedWorker =>
  new SharedWorker(new URL('./sqlite-wasm-shared-client.worker', import.meta.url), { type: 'module', name });

/** 适配器配置里选中 SharedWorker transport 的那部分 */
type SharedTransport = (instance: SharedWorker) => Pick<SqliteOptions, 'sharedWorker' | 'sharedWorkerInstance'>;

/**
 * 连同一个 SharedWorker 的两种配法：显式 `sharedWorker: true` 加实例，或只给实例由适配器推断。
 * 连接走的是同一条 transport，两种都必须在跨标签页的锁里排事务、断开时只交还自己那一份。
 */
const TRANSPORTS: ReadonlyArray<{ name: string; transport: SharedTransport }> = [
  {
    name: 'sharedWorker: true + 实例',
    transport: instance => ({ sharedWorker: true, sharedWorkerInstance: instance })
  },
  { name: '只有实例', transport: instance => ({ sharedWorkerInstance: instance }) }
];

/** 一个「标签页」：连到名为 `workerName` 的 SharedWorker 上那个客户端 */
const openTab = async (dbName: string, workerName: string, transport: SharedTransport): Promise<RxDB> => {
  const database = new RxDB({
    dbName,
    context: { userId: WORKING_TREE_CONFORMANCE_USER_ID },
    entities: [ConformanceNote],
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  });
  database.adapter(
    'sqlite-wasm',
    async db =>
      new RxDBAdapterSqlite(db, {
        ...LOAD_OPTIONS,
        ...transport(connectSharedWorker(workerName))
      })
  );
  opened.push(database);
  await database.connect('sqlite-wasm');
  return database;
};

/** 两个标签页连同一个 SharedWorker，按顺序连上（连接时的系统迁移各自要一笔排他事务） */
const openTabs = async (
  transport: SharedTransport
): Promise<{ a: RxDB; b: RxDB; dbName: string; workerName: string }> => {
  const dbName = freshName('shared');
  const workerName = freshName('wasm-shared');
  const a = await openTab(dbName, workerName, transport);
  const b = await openTab(dbName, workerName, transport);
  return { a, b, dbName, workerName };
};

/** 建行要点名实例：同一个 realm 里挂着两个实例时，裸构造器的全局解析会抛 */
const createNote = async (database: RxDB, title: string): Promise<string> => {
  const adapter = await database.getAdapter('sqlite-wasm');
  const id = uuid();
  await adapter.transaction(async (executor: TransactionExecutor) => {
    const entity = database.entityManager.createEntityRef(ConformanceNote, { id, title, body: null });
    await executor.getRepository(ConformanceNote).create(entity);
  });
  return id;
};

const titlesOf = async (database: RxDB): Promise<string[]> => {
  const adapter = await database.getAdapter('sqlite-wasm');
  const notes = await adapter.transaction(executor => executor.getRepository(ConformanceNote).find(ALL), false);
  return notes.map(note => note.title).sort();
};

/** 记下一个实例本地派出的 note 建行事件（不含别的实例经网关转发来的） */
const recordLocalCreates = (database: RxDB): Set<unknown> => {
  const ids = new Set<unknown>();
  const { name } = getEntityMetadata(ConformanceNote);
  database.addEventListener(ENTITY_LOCAL_CREATE_EVENT, ((event: {
    entities: { entity: string; id: unknown; origin?: string }[];
  }) => {
    for (const entity of event.entities) if (entity.entity === name && entity.origin === undefined) ids.add(entity.id);
  }) as never);
  return ids;
};

const settledWithin = async (promise: Promise<unknown>, ms: number): Promise<string> =>
  Promise.race([
    promise.then(
      () => 'done',
      (error: unknown) => `failed: ${String(error)}`
    ),
    new Promise<string>(resolve => setTimeout(() => resolve('waiting'), ms))
  ]);

describe.each(TRANSPORTS)('SharedWorker 上多个标签页共用一个客户端（US-314 B2.3b）：$name', ({ transport }) => {
  it('一个标签页的事务开着时，另一个标签页的事务排在它后面，不落进这笔事务', async () => {
    const { a, b } = await openTabs(transport);
    const aAdapter = await a.getAdapter('sqlite-wasm');
    let entered!: () => void;
    const aEntered = new Promise<void>(resolve => (entered = resolve));
    let release!: () => void;
    const aReleased = new Promise<void>(resolve => (release = resolve));

    const aDone = aAdapter.transaction(async (executor: TransactionExecutor) => {
      const entity = a.entityManager.createEntityRef(ConformanceNote, { id: uuid(), title: 'A 回滚掉的', body: null });
      await executor.getRepository(ConformanceNote).create(entity);
      entered();
      await aReleased;
      throw new Error('A 回滚');
    });
    await aEntered;

    const bDone = createNote(b, 'B 写的');
    try {
      expect(await settledWithin(bDone, 300), 'B 的事务没有等 A 的事务结束').toBe('waiting');
    } finally {
      release();
    }
    await expect(aDone).rejects.toThrow('A 回滚');
    await bDone;
    expect(await titlesOf(b)).toEqual(['B 写的']);
  });

  it('一个标签页断开，另一个照常读写、照常收到变更事件；之后新连上的标签页也能用', async () => {
    const { a, b, dbName, workerName } = await openTabs(transport);
    const bLocalCreates = recordLocalCreates(b);
    await createNote(a, 'A 写的');

    opened.splice(opened.indexOf(a), 1);
    await a.disconnectAll();

    const fromB = await createNote(b, 'A 断开之后 B 写的');
    await expect.poll(() => bLocalCreates.has(fromB), POLL).toBe(true);
    const c = await openTab(dbName, workerName, transport);
    await createNote(c, 'C 写的');
    expect(await titlesOf(c)).toEqual(['A 写的', 'A 断开之后 B 写的', 'C 写的']);
  });

  it('别的标签页留下没结束的事务（标签页死在事务中间）：下一个拿到锁的标签页先回滚它', async () => {
    const { b, workerName } = await openTabs(transport);
    const orphan = wrap<SqliteClient>(connectSharedWorker(workerName).port);
    await orphan.init(b.config.dbName, { ...LOAD_OPTIONS, sharedWorker: true });
    await orphan.execute('CREATE TABLE orphan_probe (x INTEGER)');
    await orphan.execute('BEGIN');
    await orphan.execute('INSERT INTO orphan_probe VALUES (1)');

    await createNote(b, '孤儿事务之后 B 写的');

    expect(await titlesOf(b)).toEqual(['孤儿事务之后 B 写的']);
    const probe = await orphan.execute('SELECT count(*) FROM orphan_probe');
    expect(probe.results[0].rows[0][0], '孤儿事务里的写没有被回滚').toBe(0);
  });
});

describe('客户端按持有者计数（US-314 B2.3b）', () => {
  /** 一张进 update hook 的表：客户端只为这几张系统表派变更事件 */
  const WATCHED = '"rxdb$rxdb_change"';

  it('最后一个持有者 release 才断开，断开了还能再 init；release 只摘这个持有者登记的监听', async () => {
    const client = new SqliteClient();
    const dbName = freshName('owners');
    await client.init(dbName, LOAD_OPTIONS, 'a');
    await client.init(dbName, LOAD_OPTIONS, 'b');
    const seen = { a: 0, b: 0 };
    client.addEventListener(SQLiteChangeType.SQLITE_INSERT, () => seen.a++, 'a');
    client.addEventListener(SQLiteChangeType.SQLITE_INSERT, () => seen.b++, 'b');
    await client.execute(`CREATE TABLE ${WATCHED} (id INTEGER PRIMARY KEY, x INTEGER)`);

    await client.release('a');
    await client.execute(`INSERT INTO ${WATCHED} (x) VALUES (1)`);
    await expect.poll(() => seen.b, POLL).toBe(1);
    expect(seen.a, 'release 之后 a 的监听还在').toBe(0);

    await client.release('b');
    await expect(client.execute('SELECT 1')).rejects.toThrow('has been disconnected');
    await client.init(dbName, LOAD_OPTIONS, 'c');
    await expect(client.execute('SELECT 1')).resolves.toBeDefined();
    await client.disconnect();
  });

  it('同一个持有者重复 release 只算一次', async () => {
    const client = new SqliteClient();
    const dbName = freshName('owners-twice');
    await client.init(dbName, LOAD_OPTIONS, 'a');
    await client.init(dbName, LOAD_OPTIONS, 'b');

    await client.release('a');
    await client.release('a');

    await expect(client.execute('SELECT 1')).resolves.toBeDefined();
    await client.release('b');
    await expect(client.execute('SELECT 1')).rejects.toThrow('has been disconnected');
  });

  it('rollbackOrphanTransaction：有没结束的事务就回滚并答 true，没有答 false', async () => {
    const client = new SqliteClient();
    await client.init(freshName('orphan'), LOAD_OPTIONS);
    await client.execute('CREATE TABLE t (x INTEGER)');
    await expect(client.rollbackOrphanTransaction()).resolves.toBe(false);

    await client.execute('BEGIN');
    await client.execute('INSERT INTO t VALUES (1)');
    await expect(client.rollbackOrphanTransaction()).resolves.toBe(true);

    const count = await client.execute('SELECT count(*) FROM t');
    expect(count.results[0].rows[0][0]).toBe(0);
    await client.disconnect();
  });
});
