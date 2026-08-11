/**
 * **C2 事务作用域** 契约套件（`SQLC-001` / `PGL-001` / `RXD-062`）。
 *
 * 不变式：
 * 1. 事务身份由**显式 executor**表示，不由适配器实例上的布尔环境态推断；
 * 2. 未持有 executor 的调用**永远重新排队**，不会被进行中的事务卷走、也不会跟着回滚；
 * 3. 两次并发 `transaction()` 是两个独立事务，不得被静默合并；
 * 4. executor 逃逸出事务体后再使用必须抛错。
 *
 * 事务实现必须通过显式 executor 区分合法嵌套与外部并发；适配器实例上的布尔环境态不能承担
 * 这项职责。SQLite core 与 PGlite 均由本套件验证该不变式。
 *
 * 设计见 `code-reviews/transaction-executor-design.md` §4。
 */
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { freshDbName, TransactionContractNote } from './fixtures.js';
import type { TransactionExecutorLike, TransactionSuiteDatabase, TransactionSuiteOptions } from './types.js';

/** 简易闩：让外部写入精确落在事务窗口内。 */
const createLatch = (): { wait: Promise<void>; release: () => void } => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => {
    release = resolve;
  });
  return { wait, release };
};

const findNotes = async (database: TransactionSuiteDatabase): Promise<TransactionContractNote[]> => {
  const repository = database.rxdb.entityManager.getRepository(TransactionContractNote);
  // entityManager 的 Repository.find() 返回活查询 Observable，取首帧即当前快照
  return firstValueFrom(repository.find({ where: { combinator: 'and', rules: [] } }), {
    defaultValue: [] as TransactionContractNote[]
  });
};

/**
 * 注册事务作用域契约。
 *
 * @param options - 适配器工厂
 */
export const runTransactionIsolationSuite = ({ factory }: TransactionSuiteOptions): void => {
  describe(`[${factory.name}] C2 事务作用域`, () => {
    const opened: TransactionSuiteDatabase[] = [];

    const connect = async (prefix: string) => {
      const database = await factory.createDatabase({
        dbName: freshDbName(prefix),
        entities: [TransactionContractNote]
      });
      opened.push(database);
      await database.rxdb.connect(database.adapterName);
      return database;
    };

    afterEach(async () => {
      const pending = opened.splice(0, opened.length);
      await Promise.all(pending.map(database => database.dispose().catch(() => undefined)));
    });

    it('事务回滚不得吞掉窗口内的外部写入', async () => {
      const database = await connect('isolation-external-write');
      const latch = createLatch();
      const started = createLatch();
      const boom = new Error('rollback on purpose');

      const failing = database
        .adapter()
        .transaction(async () => {
          started.release(); // BEGIN 已执行，窗口真正打开
          await latch.wait;
          throw boom;
        })
        .catch((cause: unknown) => cause);

      // 必须等事务真正开始。少了这一步，外部写入只是排在事务**前面**，
      // 用例在坏实现上也会通过 —— 2026-07-31 实测确认过这个假绿。
      await started.wait;

      const external = new TransactionContractNote();
      external.label = 'written-outside-the-transaction';
      const externalSave = external.save();

      // 判别器：外部写入若在事务仍开着时就完成，说明它被卷进了这个事务。
      // 正确实现下它必须排队，直到事务结束才可能完成。
      const settledWhileOpen = await Promise.race([
        externalSave.then(() => 'joined-the-open-transaction' as const).catch(() => 'errored' as const),
        new Promise<'queued'>(resolve => setTimeout(() => resolve('queued'), 400))
      ]);

      latch.release();
      await expect(failing).resolves.toBeDefined();
      await externalSave;

      expect(settledWhileOpen).toBe('queued');

      const notes = await findNotes(database);
      expect(notes.map(note => note.label)).toContain('written-outside-the-transaction');
    }, 20000);

    it('两个并发 transaction() 是两个独立事务，不得被合并', async () => {
      const database = await connect('isolation-concurrent-tx');
      const seen: string[] = [];

      await Promise.all([
        database.adapter().transaction(async executor => {
          seen.push(executor.id);
        }),
        database.adapter().transaction(async executor => {
          seen.push(executor.id);
        })
      ]);

      expect(seen).toHaveLength(2);
      expect(new Set(seen).size).toBe(2);
    });

    it('executor.run() 复用当前事务，不新开事务', async () => {
      const database = await connect('isolation-nested-run');

      const ids = await database.adapter().transaction(async executor => {
        const inner = await executor.run(async nested => nested.id);
        return [executor.id, inner];
      });

      expect(ids[0]).toBe(ids[1]);
    });

    it('executor 逃逸出事务体后再使用必须抛错', async () => {
      const database = await connect('isolation-escaped-executor');
      let escaped: TransactionExecutorLike | undefined;

      await database.adapter().transaction(async executor => {
        escaped = executor;
      });

      expect(escaped?.state).toBe('committed');
      await expect(escaped?.query(factory.noopSql)).rejects.toThrow();
    });
  });
};
