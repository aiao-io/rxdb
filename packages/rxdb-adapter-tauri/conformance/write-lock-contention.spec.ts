/**
 * 两个会话争同一个库的写锁（US-210 AC#6）。
 *
 * @remarks
 * 引擎侧的机制早就在：`engine.rs` 设了 `PRAGMA busy_timeout`，`error.rs` 把
 * `SQLITE_BUSY` / `SQLITE_LOCKED` 映射成 `database_busy`。缺的是**真的让两个会话撞上去**的用例。
 *
 * 为什么不能挂进共享套件：`rust-adapter-factory.ts` 的 `uniqueDbName()` 刻意给每次构造发一个
 * 唯一库名（套件之间不能看见对方的表），两个会话因此永远落在不同文件上，撞不到一起。
 * 争锁必须自己一个文件、显式共用同一个库名，也自己起一个宿主进程——共享宿主的工作区
 * 由 `setup.spec.ts` 的 `afterAll` 负责，跨文件借用只会让两边的生命周期缠在一起。
 *
 * # 判据是行为，不是实现形态
 *
 * 关闭条件是与 US-207 AC#5（Electron）**行为**一致：第二个 writer 要么等到持锁方提交后成功，
 * 要么超时报一个可判别的 `database_busy`，任何一种情况下都不静默改道到别的文件。
 *
 * 两侧的实现**有意**不同，照抄 Electron 的用例形态会做出错的东西：Node 版在 host 层写异步退避
 * （`node:sqlite` 是同步接口，在 Electron 主进程那条唯一的线程上等锁，会把持锁方的 `COMMIT`
 * 续体一起卡死）；Rust 版每条连接活在自己的线程上，于是直接用 SQLite 自己的忙等。
 * 理由写在 `rust/src/engine.rs` 的模块头。
 *
 * 争锁能成立还依赖一个前提：`rust/src/bin/rxdb_host_stdio.rs` 每条请求开一个线程。
 * 串行处理会让本文件里的每条用例都死锁在等待方身上——那是宿主替身的产物，不是引擎的性质。
 */

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DesktopSqliteClient, RxDBAdapterDesktopError, type DesktopHostTransport } from '../src/index.js';
import { createRustHostTransport } from './rust-host-transport.js';

/** 两个会话共用的逻辑库名——本文件的全部前提。 */
const DATABASE_NAME = 'contention.sqlite3';

/** `engine.rs` 的 `BUSY_TIMEOUT_MS`；用例只依赖它是有限值，不依赖具体数字。 */
const BUSY_TIMEOUT_MS = 5_000;

let workspace: string;
let host: ReturnType<typeof createRustHostTransport>;

const openSession = (transport: DesktopHostTransport): Promise<DesktopSqliteClient> =>
  DesktopSqliteClient.connect(transport, { engine: 'sqlite', databaseName: DATABASE_NAME });

/** 开一对会话，并保证它们在用例结束时一定被关掉。 */
const withTwoSessions = async (
  body: (holder: DesktopSqliteClient, waiter: DesktopSqliteClient) => Promise<void>
): Promise<void> => {
  const holder = await openSession(host.transport);
  const waiter = await openSession(host.transport);
  try {
    await body(holder, waiter);
  } finally {
    // 不论用例怎么结束都要把两条连接交回去：留着的话，下一条用例的 `BEGIN IMMEDIATE`
    // 会撞上一条谁也不认识的悬空事务，报出来的 `database_busy` 指向的是上一条用例。
    await holder.disconnect().catch(() => undefined);
    await waiter.disconnect().catch(() => undefined);
  }
};

const settled = (promise: Promise<unknown>): (() => boolean) => {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true)
  );
  return () => done;
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'rxdb-tauri-contention-'));
  host = createRustHostTransport(workspace);
  const setup = await openSession(host.transport);
  await setup.execute('CREATE TABLE IF NOT EXISTS contended (id INTEGER PRIMARY KEY)');
  await setup.disconnect();
});

afterAll(async () => {
  try {
    // 与 `setup.spec.ts` 同一组旁路信号：宿主契约上「`handle()` 永不 panic」，
    // stderr 上任何一个字都是缺陷。
    expect(host.process.stderr()).toBe('');
    expect(host.deliveryErrors()).toEqual([]);
  } finally {
    host.process.stop();
    await rm(workspace, { recursive: true, force: true });
  }
});

describe('两个会话争同一个库的写锁', () => {
  it('持锁方在超时前提交时，第二个 writer 等到锁再成功', async () => {
    await withTwoSessions(async (holder, waiter) => {
      await holder.execute(holder.beginTransactionSql());
      await holder.execute('INSERT INTO contended (id) VALUES (1)');

      const waiting = waiter.execute(waiter.beginTransactionSql());
      const isSettled = settled(waiting);
      await sleep(200);
      // 关键断言：它必须**还在等**。立刻失败同样能让后面的 `await waiting` 变红，
      // 但那是另一种行为——上层据此决定「重试」还是「报错给用户」，两者不能混。
      expect(isSettled(), '第二个 writer 没有等待，撞锁时就立刻失败了').toBe(false);

      await holder.execute('COMMIT;');
      await waiting;

      await waiter.execute('INSERT INTO contended (id) VALUES (2)');
      await waiter.execute('COMMIT;');
      const rows = (await holder.execute('SELECT id FROM contended ORDER BY id')).results[0]?.rows;
      expect(rows).toEqual([[1], [2]]);
      await holder.execute('DELETE FROM contended');
    });
  });

  it(
    '持锁方超过 busy_timeout 不放时，第二个 writer 报 database_busy',
    async () => {
      await withTwoSessions(async (holder, waiter) => {
        await holder.execute(holder.beginTransactionSql());
        await holder.execute('INSERT INTO contended (id) VALUES (1)');

        // 断言的是**错误码本身**而不是「失败了就行」：调用方要凭它分辨
        // 「稍后重试」和「这条 SQL 本身是错的」，退化成 `statement_failed` 会让重试逻辑失效。
        const failure = await waiter.execute(waiter.beginTransactionSql()).then(
          () => undefined,
          (error: unknown) => error
        );
        expect(failure).toBeInstanceOf(RxDBAdapterDesktopError);
        expect((failure as RxDBAdapterDesktopError).code).toBe('database_busy');

        await holder.execute('ROLLBACK;');
      });
    },
    // 这条用例必须真的把 `busy_timeout` 等满，本身就要 5s 上下。
    BUSY_TIMEOUT_MS * 4
  );

  it('撞锁不会让宿主改道到另一个物理文件', async () => {
    await withTwoSessions(async (holder, waiter) => {
      // 逻辑位置相同是必要条件，但它只是宿主拼出来的字符串；真正的判据是下面的文件清点。
      expect(waiter.resolvedLocation).toBe(holder.resolvedLocation);

      await holder.execute(holder.beginTransactionSql());
      await holder.execute('INSERT INTO contended (id) VALUES (7)');
      await holder.execute('COMMIT;');
      const rows = (await waiter.execute('SELECT id FROM contended')).results[0]?.rows;
      expect(rows, '第二个会话读不到第一个刚提交的行，说明它连的不是同一个库').toEqual([[7]]);

      // 「撞锁时悄悄换一个文件」会让上面每一条断言都照旧通过，只有清点物理文件才抓得到：
      // `-wal` / `-shm` 不以 `.sqlite3` 结尾，因此这里数出来的就是库文件本身。
      const files = await readdir(join(workspace, 'rxdb-data'));
      expect(files.filter(name => name.endsWith('.sqlite3'))).toEqual([DATABASE_NAME]);

      await holder.execute('DELETE FROM contended');
    });
  });
});
