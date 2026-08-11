/**
 * **C1 就绪门** 契约套件。
 *
 * 不变式：**任何持有串行队列槽位的任务都不得等待 `RxDB.connect()`**；就绪等待必须发生在
 * 入队之前。违反它就会复现 2026-07-31 实测到的首装死锁 —— 队头的活查询在临界区里等
 * `connect()`，而 `connect()` 要靠队列后方的水位线事务才能完成。
 *
 * 根因与探针轨迹见 `code-reviews/transaction-executor-design.md` §1。
 */
import { afterEach, describe, expect, it } from 'vitest';

import { createUnexecutedMigrations, freshDbName, TransactionContractNote } from './fixtures.js';
import type { TransactionSuiteDatabase, TransactionSuiteOptions } from './types.js';

/**
 * 注册就绪门契约。
 *
 * @param options - 适配器工厂
 */
export const runReadinessSuite = ({ factory }: TransactionSuiteOptions): void => {
  describe(`[${factory.name}] C1 就绪门`, () => {
    const opened: TransactionSuiteDatabase[] = [];

    const open = async (prefix: string, migrationNames: readonly string[] = ['init-schema', 'add-index']) => {
      const { migrations, executed } = createUnexecutedMigrations(migrationNames);
      const database = await factory.createDatabase({
        dbName: freshDbName(prefix),
        entities: [TransactionContractNote],
        migrations
      });
      opened.push(database);
      return { database, executed };
    };

    afterEach(async () => {
      const pending = opened.splice(0, opened.length);
      await Promise.all(pending.map(database => database.dispose().catch(() => undefined)));
    });

    it('空库 + 配置了 migrations 时 connect() 必须完成，不得死锁', async () => {
      const { database } = await open('readiness-fresh');

      await expect(database.rxdb.connect(database.adapterName)).resolves.toBeDefined();
    });

    it('connect() 尚未完成时并发发起的第二次 connect() 不得把引导锁死', async () => {
      const { database } = await open('readiness-concurrent-connect');

      const first = database.rxdb.connect(database.adapterName);
      const second = database.rxdb.connect(database.adapterName);

      await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    });

    it('引导完成后普通查询仍能正常入队执行', async () => {
      const { database } = await open('readiness-after-connect');
      await database.rxdb.connect(database.adapterName);

      await expect(database.adapter().query(factory.noopSql)).resolves.toBeDefined();
    });

    it('引导期内发起的实体写入最终会完成，不会被队列永久滞留', async () => {
      const { database } = await open('readiness-write-during-bootstrap');

      const connecting = database.rxdb.connect(database.adapterName);
      const note = new TransactionContractNote();
      note.label = 'issued-during-bootstrap';
      const saving = note.save();

      await expect(connecting).resolves.toBeDefined();
      await expect(saving).resolves.toBeDefined();
    });
  });
};
