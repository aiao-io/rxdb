/**
 * @fileoverview 待推数按记录数 —— 真实 wa-sqlite 本地库。
 *
 * @remarks
 * 一次 `saveMany()` 在一个事务里落库，变更日志里那 10 行带同一个 `transactionId`，
 * 操作历史是一条「事务: 创建10条」，`pushableCount$` 也该是 1。整条链都是真的：
 * 事务给日志打 `transactionId`、`count({ groupBy })` 生成的 SQL、历史插件的计数。
 *
 * 待推资格只看同步配置（`SyncType.Full` 带远端），计数全在本地，远端适配器不用真的接上。
 */
import { RxDB, SyncType } from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { Todo } from '@aiao/rxdb-test/entities';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterWaSqlite } from '../RxDBAdapterSqlite.js';
import { asyncWasmPath } from './wa-sqlite-wasm.js';

describe('pushableCount$ 按记录数（wa-sqlite）', () => {
  let rxdb: RxDB;

  const pushableCount = () => firstValueFrom(rxdb.versionManager.pushableCount$);

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: `pushable-records-${Date.now()}`,
      context: { userId: 'userId' },
      entities: [Todo],
      sync: {
        local: { adapter: 'wa-sqlite' },
        remote: { adapter: 'pushable-records-remote' },
        type: SyncType.Full
      }
    });
    rxdb.adapter(
      'wa-sqlite',
      db =>
        new RxDBAdapterWaSqlite(db, {
          vfs: 'MemoryAsyncVFS',
          async: true,
          worker: false,
          wasmPath: asyncWasmPath,
          batchTimeout: 1
        })
    );
    rxdb.use(rxDBPluginHistory);
    await rxdb.connect('wa-sqlite');
  });

  afterAll(async () => {
    await rxdb?.disconnectAll();
  });

  it('saveMany 批量添加 10 条是 1 条待推记录，之后单独保存的一条再记 1 条', async () => {
    const todos = Array.from({ length: 10 }, (_, index) => new Todo({ title: `batch-${index}` }));
    await rxdb.entityManager.saveMany(todos);

    await expect.poll(pushableCount).toBe(1);

    await new Todo({ title: 'single' }).save();

    await expect.poll(pushableCount).toBe(2);
  });
});
