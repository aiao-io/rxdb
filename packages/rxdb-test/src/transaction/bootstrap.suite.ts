/**
 * **C3 引导事务** 契约套件（`RXD-051`）。
 *
 * 不变式：首装路径的**建表**与 **migration 水位线写入**必须在同一个事务里提交。
 * 原实现是两次独立提交 —— 建表成功而水位写入失败时，下次启动读到的已执行集合是空的，
 * 会把每条迁移都当成从未跑过，重新打在一个已是最新形态的库上。
 *
 * 设计见 `code-reviews/transaction-executor-design.md` §5。
 */
import { RxDBBranch, RxDBChange, RxDBMigration, RxDBSync } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createUnexecutedMigrations,
  freshDbName,
  TransactionContractFailure,
  TransactionContractNote
} from './fixtures.js';
import type { TransactionSuiteDatabase, TransactionSuiteOptions } from './types.js';

/**
 * 注册引导事务契约。
 *
 * @param options - 适配器工厂
 */
export const runBootstrapAtomicitySuite = ({ factory }: TransactionSuiteOptions): void => {
  describe(`[${factory.name}] C3 引导事务`, () => {
    const opened: TransactionSuiteDatabase[] = [];
    const MIGRATION_NAMES = ['0001-init', '0002-add-index'] as const;

    const open = async (dbName: string) => {
      const { migrations, executed } = createUnexecutedMigrations(MIGRATION_NAMES);
      const database = await factory.createDatabase({
        dbName,
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

    it('首装不执行任何 migration 的 up：建出来的表已是最新形态', async () => {
      const { database, executed } = await open(freshDbName('bootstrap-fresh'));

      await database.rxdb.connect(database.adapterName);

      expect(executed).toEqual([]);
    });

    it('首装必须把每条 migration 的水位线写进 RxDBMigration 表', async () => {
      // 直接查表，而不是「重连同名库再断言没重跑」—— 内存 VFS 下第二次连接其实又是一次首装，
      // 那种写法在任何实现上都会 vacuously 通过，等于假绿。
      // 水位线缺失的真实后果：下次启动读到空的已执行集合，把每条旧 migration 重新打在一个
      // 已是最新形态的库上（RXD-051）。
      const { database } = await open(freshDbName('bootstrap-watermark'));
      await database.rxdb.connect(database.adapterName);

      const repository = database.rxdb.entityManager.getRepository(RxDBMigration);
      const records = await firstValueFrom(repository.find({ where: { combinator: 'and', rules: [] } }), {
        defaultValue: [] as RxDBMigration[]
      });
      const names = records.map(record => record.name);

      // 断言**包含**而非相等：同一张表还存放 RxDB 自己的系统水位线
      // （`__rxdb_system_schema__:N` / `__rxdb_change_codec__:N`，见 system/migration.ts）。
      // 断言相等会把「系统水位线的条数」这个与本契约无关的实现细节钉死在测试里。
      for (const name of MIGRATION_NAMES) expect(names).toContain(name);
    });

    it('末尾初始写入失败时，业务表与 migration 表必须一并回滚', async () => {
      const entityTypes = [TransactionContractNote, RxDBBranch, RxDBChange, RxDBMigration, RxDBSync];
      const probe = await factory.createBootstrapProbe({
        dbName: freshDbName('bootstrap-rollback'),
        entities: entityTypes
      });
      const failure: TransactionContractFailure = Object.create(TransactionContractFailure.prototype);
      failure.label = 'force bootstrap rollback';

      try {
        await expect(probe.createTables(entityTypes, [failure])).rejects.toThrow();
        await expect(probe.tableExists(TransactionContractNote)).resolves.toBe(false);
        await expect(probe.tableExists(RxDBMigration)).resolves.toBe(false);
      } finally {
        await probe.dispose();
      }
    });
  });
};
