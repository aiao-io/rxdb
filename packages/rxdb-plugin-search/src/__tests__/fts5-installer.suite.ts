/**
 * 按 adapter 参数化的 FTS5 安装/回填/迁移套件（US-703 AC#8）。
 *
 * 把原先硬编码 `sqlite-wasm` 的 `fts5-installer.integration.browser.spec.ts` 抽成
 * 「接收 harness 工厂」的共享套件。与 {@link searchBehaviorSuite} 的区别：这里验证的是
 * 「装载搜索插件」这一侧的行为（建 FTS 表 / 回填 / 迁移记录 / 并发窗口），不是查询语义。
 *
 * harness 工厂同样由 {@link createFts5InstallerHarnessFactory} 从各 adapter 的
 * `AdapterFactory` 派生；`wrapRawQuery` 选项用于失败注入与安装窗口探测。
 */

import { getEntityMetadata, RxDB, RxDBMigration } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import type { AdapterFactory } from '@aiao/rxdb-adapter-sqlite-core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractFtsPlanFromMetadata, ftsMigrationName } from '../core/fts5-installer.js';
import { RxDBPluginSearch, rxDBPluginSearch } from '../plugin.js';
import { Article } from './fixtures/article.entity.js';
import { disposeScopes, installScoped } from './scoped-install.js';

/** FTS5 安装套件依赖的 harness 抽象面。 */
export interface Fts5InstallerHarness {
  readonly rxdb: RxDB;
  readonly adapter: RxDBAdapterSqliteBase;
  cleanup(): Promise<void>;
}

type RawQueryParams = Parameters<RxDBAdapterSqliteBase['rawQuery']>[1];

type WrapRawQuery = (
  sql: string,
  params: RawQueryParams,
  next: RxDBAdapterSqliteBase['rawQuery']
) => ReturnType<RxDBAdapterSqliteBase['rawQuery']>;

/** FTS5 安装 harness 工厂契约。 */
export interface Fts5InstallerHarnessFactory {
  readonly name: string;
  createHarness(options?: { readonly wrapRawQuery?: WrapRawQuery }): Promise<Fts5InstallerHarness>;
}

const quoteIdentifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;

const createHarness = async (
  adapterFactory: AdapterFactory,
  options?: { readonly wrapRawQuery?: WrapRawQuery }
): Promise<Fts5InstallerHarness> => {
  // 各 adapter factory 的 `createAdapter` 完成「建 RxDB → 注册 adapter → connect」。
  // 插件装载由各用例经 `rxDBPluginSearch` + `installScoped` 显式执行（不再走 `rxdb.use`），
  // 因此 harness 只负责把 adapter 交出来，`wrapRawQuery` 在此处先于安装包住两个通道。
  const adapter = await adapterFactory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Article] });
  const rxdb = adapter.rxdb;

  if (options?.wrapRawQuery) {
    const wrap = options.wrapRawQuery;
    const nextRawQuery = adapter.rawQuery.bind(adapter);
    adapter.rawQuery = ((sql, params) => wrap(sql, params, nextRawQuery)) as RxDBAdapterSqliteBase['rawQuery'];

    // `#runInstall` 的 FTS DDL 走 bootstrapTransaction → tx.query，不会经过 adapter.rawQuery。
    // 只包 rawQuery 会让失败注入和窗口探测全部空转。
    const nextBootstrap = adapter.bootstrapTransaction.bind(adapter);
    adapter.bootstrapTransaction = ((fun, transactionLog) =>
      nextBootstrap(
        (async tx => {
          const nextQuery = tx.query.bind(tx);
          tx.query = (sql, params) =>
            wrap(sql, params as RawQueryParams, nextQuery as RxDBAdapterSqliteBase['rawQuery']);
          return fun(tx);
        }) as typeof fun,
        transactionLog
      )) as typeof adapter.bootstrapTransaction;
  }

  return {
    rxdb,
    adapter,
    async cleanup() {
      await rxdb.disconnectAll();
    }
  };
};

const listMigrationNames = async (rxdb: RxDB): Promise<string[]> => {
  const repo = rxdb.entityManager.getRepository(RxDBMigration);
  const records = await firstValueFrom(repo.findAll({ where: { combinator: 'and', rules: [] } } as never), {
    defaultValue: [] as RxDBMigration[]
  });
  return records.map(record => record.name).sort();
};

const queryObjectNames = async (
  adapter: RxDBAdapterSqliteBase,
  type: 'table' | 'trigger',
  names: readonly string[]
): Promise<string[]> => {
  const placeholders = names.map(() => '?').join(', ');
  const result = await adapter.rawQuery(
    `SELECT name FROM sqlite_master WHERE type = ? AND name IN (${placeholders}) ORDER BY name`,
    [type, ...names]
  );
  const nameColumn = result.columns.indexOf('name');
  return result.rows.map(row => String(row[nameColumn]));
};

const queryFtsRowCount = async (adapter: RxDBAdapterSqliteBase, ftsTable: string): Promise<number> => {
  const result = await adapter.rawQuery(`SELECT count(*) AS count FROM ${quoteIdentifier(ftsTable)}`);
  const countColumn = result.columns.indexOf('count');
  return Number(result.rows[0]?.[countColumn] ?? 0);
};

const queryMatchCount = async (adapter: RxDBAdapterSqliteBase, ftsTable: string, query: string): Promise<number> => {
  const table = quoteIdentifier(ftsTable);
  const result = await adapter.rawQuery(`SELECT count(*) AS count FROM ${table} WHERE ${table} MATCH ?`, [query]);
  const countColumn = result.columns.indexOf('count');
  return Number(result.rows[0]?.[countColumn] ?? 0);
};

const createArticle = async (rxdb: RxDB): Promise<void> => {
  const repo = rxdb.entityManager.getRepository(Article);
  const article = rxdb.entityManager.instantiate(Article, {
    title: 'alpha title',
    body: 'alpha body with sqlite search',
    category: 'tech' as const,
    tags: ['alpha', 'sqlite'],
    authorId: 'author-1',
    viewCount: 1
  });
  await repo.create(article);
};

/** 从 adapter factory 派生 FTS5 安装 harness 工厂。 */
export const createFts5InstallerHarnessFactory = (adapterFactory: AdapterFactory): Fts5InstallerHarnessFactory => ({
  name: adapterFactory.name,
  createHarness: options => createHarness(adapterFactory, options)
});

/**
 * 按 adapter 参数化的 FTS5 安装套件：建表 / 回填 / 迁移 / 并发窗口断言。
 *
 * @param factory - FTS5 安装 harness 工厂
 */
export const fts5InstallerSuite = (factory: Fts5InstallerHarnessFactory): void => {
  describe(`fts5 installer integration [${factory.name}]`, () => {
    const cleanups: Array<() => Promise<void>> = [];

    afterEach(async () => {
      while (cleanups.length > 0) {
        await cleanups.pop()?.();
      }
      await disposeScopes();
    });

    it('T024 installs the FTS table, triggers, and install migration on first mount', async () => {
      const harness = await factory.createHarness();
      cleanups.push(() => harness.cleanup());

      const plugin = rxDBPluginSearch(harness.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      const { scope: pluginScope } = installScoped(plugin);
      cleanups.push(() => pluginScope.dispose());
      await plugin.ready;

      const plan = extractFtsPlanFromMetadata(getEntityMetadata(Article))!;
      const sqlTable = plan.sqlTableName!;
      const installMigration = `${ftsMigrationName(sqlTable, 'install')}__${plan.signature}`;
      const backfillMigration = `${ftsMigrationName(sqlTable, 'backfill')}__${plan.signature}`;
      const expectedTriggers = [`_fts_${sqlTable}_ad`, `_fts_${sqlTable}_ai`, `_fts_${sqlTable}_au`];

      await vi.waitFor(async () => {
        expect(await listMigrationNames(harness.rxdb)).toEqual(
          expect.arrayContaining([installMigration, backfillMigration])
        );
      });

      const tables = await queryObjectNames(harness.adapter, 'table', [`_fts_${sqlTable}`]);
      expect(tables).toEqual([`_fts_${sqlTable}`]);

      const triggers = await queryObjectNames(harness.adapter, 'trigger', expectedTriggers);
      expect(triggers).toEqual(expectedTriggers);
    });

    it('T086 backfills existing rows once and records the backfill migration', async () => {
      const harness = await factory.createHarness();
      cleanups.push(() => harness.cleanup());

      await createArticle(harness.rxdb);

      const plugin = rxDBPluginSearch(harness.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      const { scope: pluginScope } = installScoped(plugin);
      cleanups.push(() => pluginScope.dispose());
      await plugin.ready;

      const plan = extractFtsPlanFromMetadata(getEntityMetadata(Article))!;
      const sqlTable = plan.sqlTableName!;
      const ftsTable = `_fts_${sqlTable}`;
      const installMigration = `${ftsMigrationName(sqlTable, 'install')}__${plan.signature}`;
      const backfillMigration = `${ftsMigrationName(sqlTable, 'backfill')}__${plan.signature}`;

      await vi.waitFor(async () => {
        expect(await listMigrationNames(harness.rxdb)).toEqual(
          expect.arrayContaining([installMigration, backfillMigration])
        );
      });

      expect(await queryFtsRowCount(harness.adapter, ftsTable)).toBe(1);
      expect(await queryMatchCount(harness.adapter, ftsTable, 'alpha')).toBe(1);

      const secondPlugin = rxDBPluginSearch(harness.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      const { scope: secondPluginScope } = installScoped(secondPlugin);
      cleanups.push(() => secondPluginScope.dispose());
      await secondPlugin.ready;

      expect(await queryFtsRowCount(harness.adapter, ftsTable)).toBe(1);
      expect(await queryMatchCount(harness.adapter, ftsTable, 'alpha')).toBe(1);
    });

    it('T086 propagates backfill failures instead of swallowing them', async () => {
      const harness = await factory.createHarness({
        wrapRawQuery: async (sql, params, next) => {
          // backfill 与 reset、triggers 同批下发，靠 backfill 独有的 `SELECT src.rowid` 认批次
          if (sql.includes('SELECT src.rowid')) {
            throw new Error('forced backfill failure');
          }
          return next(sql, params);
        }
      });
      cleanups.push(() => harness.cleanup());

      await createArticle(harness.rxdb);

      const plugin = rxDBPluginSearch(harness.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      const { scope: pluginScope, installing } = installScoped(plugin);
      cleanups.push(() => pluginScope.dispose());

      // `installing` 与 `ready` 同成同败，两个都要断言：只等 `ready` 会把宿主那一路
      // 的 rejection 漏成 unhandledrejection，把整个 vitest 进程拖成非零退出
      await expect(installing).rejects.toThrow('forced backfill failure');
      await expect(plugin.ready).rejects.toThrow('forced backfill failure');
      const migrationNames = await listMigrationNames(harness.rxdb);
      expect(migrationNames.filter(name => name.startsWith('fts5__'))).toEqual([]);
    });

    // `#runInstall` 把 install 包进 bootstrapTransaction；`installFtsForEntity` 仍拆成两次 query：
    // CREATE VIRTUAL TABLE，以及 reset + backfill + triggers 的合并批次。
    // 批次内部不再有用户写入窗口；残留窗口只在建表与批次之间。
    //
    // 旧顺序 DDL → triggers → reset → backfill 会在「triggers 已生效、索引仍为空」时炸：
    // 用户 DELETE 让 `_ad` 对着空索引发 `'delete'`，FTS5 抛 SQLITE_CORRUPT_VTAB
    // （字面报错「database disk image is malformed」）。
    //
    // 这条用例在每一次 `_fts_` query 之后插一次真实 DELETE：建表后无 trigger，批次后
    // trigger 已存在且索引已回填。两者都不得抛错；若有人把 trigger 提前或把批次拆开，
    // DELETE 会再次打到空索引。
    it('SRCH-FTS-BOOTSTRAP 安装期间任一窗口内的并发删除都不得打崩索引', async () => {
      const plan = extractFtsPlanFromMetadata(getEntityMetadata(Article))!;
      const quotedTable = quoteIdentifier(plan.sqlTableName!);
      const deleteErrors: unknown[] = [];
      let windows = 0;

      const harness = await factory.createHarness({
        wrapRawQuery: async (sql, params, next) => {
          const result = await next(sql, params);
          if (sql.includes('_fts_')) {
            windows += 1;
            try {
              // 每个窗口删掉一行存量数据，模拟用户此刻按下的删除按钮
              await next(`DELETE FROM ${quotedTable} WHERE rowid = (SELECT min(rowid) FROM ${quotedTable})`, undefined);
            } catch (error) {
              deleteErrors.push(error);
            }
          }
          return result;
        }
      });
      cleanups.push(() => harness.cleanup());

      // 每个窗口消耗一行，多备几行避免窗口数增加时删到空表而使断言失去意义
      await createArticle(harness.rxdb);
      await createArticle(harness.rxdb);
      await createArticle(harness.rxdb);

      const plugin = rxDBPluginSearch(harness.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      const { scope: pluginScope } = installScoped(plugin);
      cleanups.push(() => pluginScope.dispose());
      await plugin.ready;

      expect(windows).toBeGreaterThanOrEqual(2);
      expect(deleteErrors).toEqual([]);
    });
  });
};
