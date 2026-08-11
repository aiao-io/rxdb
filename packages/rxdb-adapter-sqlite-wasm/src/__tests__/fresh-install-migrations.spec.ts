import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';

/**
 * 门禁补缺：**真实适配器 + 首装（空库）+ 配置了 migrations**。
 *
 * @remarks
 * 这个组合此前没有任何测试覆盖，代价有两次：
 * 1. `RXD-051`（建表与 migration 水位线分两次提交）能长期存活；
 * 2. 修它时把两者包进 `localAdapter.transaction()` 会死锁，而单包门禁用的是 mock
 *    适配器（其 `transaction` 不会 `await connect()`），照样全绿 —— 直到跨适配器回归才暴露。
 *
 * 首装路径只在「`RxDBMigration` 表不存在」时走，因此必须用全新 dbName；
 * 水位线写入只在「配置了 migrations」时发生，因此必须真的传 migrations。
 */
const createDatabase = () => {
  const rxdb = new RxDB({
    dbName: `fresh-install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    context: { userId: 'userId' },
    entities: [Todo],
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None },
    migrations: [
      { name: 'init-schema', up: vi.fn(async () => undefined), down: vi.fn(async () => undefined) },
      { name: 'add-index', up: vi.fn(async () => undefined), down: vi.fn(async () => undefined) }
    ]
  });
  rxdb.adapter(
    'sqlite-wasm',
    async db => new RxDBAdapterSqlite(db, { vfs: 'memory', batchTimeout: 1, wasmUrl: sqliteWasmUrl })
  );
  return rxdb;
};

// ✅ 2026-07-31 起是有效门禁（C1 就绪门落地后解开 skip）。以下是它当初抓到的活 P0 的完整归因，
// 保留是为了防止「把就绪等待挪回队列临界区」这类回退再次发生。
//
// 现象：空库 + 配置任意 migrations 时 `rxdb.connect()` 永久挂起（15s 超时）。
//
// 根因（2026-07-31 探针轨迹 + 浏览器栈追踪实测）：**只有一层自等待，位置在队列临界区**。
//
//   RxDB.connect(name)
//    ├─ init() → 活查询订阅 → repository.find() → adapter.query()
//    │     → #queue.addTask(#exec)          ← 占住并发度 1 的唯一槽位
//    │     → #exec 首行 await rxdb.connect(name) → 命中防重入缓存 → 自等待
//    ├─ adapter.connect() / createTables → 走 internalQuery，旁路队列，全部成功
//    └─ #markMigrationsAsApplied → transaction() → 排在卡住的队头之后，永不执行
//
// 即：队头任务在持有临界区时，等待一个只能由队列后方任务完成的 promise。
// 注意 `#run_transaction` 的探针从未打印 —— 它根本没被调度过；早前注释里写的
// 「① #run_transaction 首行自等待 / ② 卡在 #client()」两层说法**已被实测推翻**。
//
// 评审 RXD-051 只说「非幂等 migration 会重复改数据」，**低估了** —— 实际是根本连不上库。
// 零覆盖正是它长期存活的原因（水位 spec 用 mock 适配器，其 transaction 不会 await connect）。
//
// 解法见 `code-reviews/transaction-executor-design.md`（C1 就绪门）：`query()`/`transaction()`
// 在**入队之前**完成就绪等待，`#exec`/`#run_transaction` 内不再 await connect。
describe('真实适配器首装 + migrations', () => {
  const databases: RxDB[] = [];

  afterEach(async () => {
    const pending = databases.splice(0, databases.length);
    await Promise.all(pending.map(database => database.disconnectAll().catch(() => undefined)));
  });

  it('空库 + 配置了 migrations 时 connect() 必须能完成（不得死锁）', async () => {
    const rxdb = createDatabase();
    databases.push(rxdb);

    await expect(rxdb.connect('sqlite-wasm')).resolves.toBeDefined();
  });

  it('首装不执行任何 migration 的 up（建出来的表已是最新形态）', async () => {
    const rxdb = createDatabase();
    databases.push(rxdb);
    const ups = (rxdb.config.migrations ?? []).map(migration => migration.up);

    await rxdb.connect('sqlite-wasm');

    for (const up of ups) expect(up).not.toHaveBeenCalled();
  });
});
