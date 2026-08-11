import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import sqliteWasmUrl from '@subframe7536/sqlite-wasm/wasm?url&inline';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';

/**
 * 门禁：**事务日志序幕不得经过适配器队列**。
 *
 * @remarks
 * `#run_transaction` 已经跑在 `#queue.addTask` 的任务里（并发度 1）。`transactionLog` 为 true 时
 * 它要先取当前分支 id 才能生成 `switch_transaction_id` 语句 —— 这次读**必须**直发同一连接，
 * 不能走 `adapter.query()`：后者在非事务上下文会重新入队，排在自己身后，永久挂起。
 *
 * 历史上它靠 `#transaction_lock` 的直通快路径侥幸绕过。那条快路径是 C2（`SQLC-001`）要删的东西，
 * 而 `transactionLog` 默认为 true —— 删掉快路径而不先改这里，**每一个默认事务**都会当场挂死。
 * 这条门禁就是为了让那种改法立刻变红，而不是等到全量测试超时才被发现。
 *
 * 用超时（而非断言）表达契约：挂起才是它要抓的故障形态。
 */
@Entity({
  name: 'TxPreludeNote',
  tableName: 'tx_prelude_note',
  namespace: 'txprelude',
  properties: [{ name: 'label', type: PropertyType.string, required: true }]
})
class TxPreludeNote extends EntityBase {
  label!: string;
}

describe('事务日志序幕不得经过队列', () => {
  const databases: RxDB[] = [];

  const createDatabase = () => {
    let adapter: RxDBAdapterSqlite | undefined;
    const rxdb = new RxDB({
      dbName: `tx-prelude-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      context: { userId: 'userId' },
      entities: [TxPreludeNote],
      sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
    });
    rxdb.adapter('sqlite-wasm', async database => {
      adapter = new RxDBAdapterSqlite(database, { vfs: 'memory', batchTimeout: 1, wasmUrl: sqliteWasmUrl });
      return adapter;
    });
    databases.push(rxdb);
    return { rxdb, getAdapter: () => adapter! };
  };

  afterEach(async () => {
    const pending = databases.splice(0, databases.length);
    await Promise.all(pending.map(database => database.disconnectAll().catch(() => undefined)));
  });

  it('transactionLog=true 的空事务必须能返回，不得自等待', async () => {
    const { rxdb, getAdapter } = createDatabase();
    await rxdb.connect('sqlite-wasm');

    // transactionLog 默认 true —— 这正是会触发分支读的那条路径
    await expect(getAdapter().transaction(async () => 'done')).resolves.toBe('done');
  }, 15000);

  it('连续多个默认事务不得互相堵死', async () => {
    const { rxdb, getAdapter } = createDatabase();
    await rxdb.connect('sqlite-wasm');
    const adapter = getAdapter();

    const results = await Promise.all([
      adapter.transaction(async () => 'a'),
      adapter.transaction(async () => 'b'),
      adapter.transaction(async () => 'c')
    ]);

    expect(results).toEqual(['a', 'b', 'c']);
  }, 15000);
});
