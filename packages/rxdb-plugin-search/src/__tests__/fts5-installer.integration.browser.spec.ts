import { getEntityMetadata, RxDB, RxDBMigration, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractFtsPlanFromMetadata, ftsMigrationName } from '../core/fts5-installer.js';
import { RxDBPluginSearch, rxDBPluginSearch } from '../plugin.js';
import { Article } from './fixtures/article.entity.js';

interface Harness {
  readonly rxdb: RxDB;
  readonly adapter: RxDBAdapterSqlite;
  cleanup(): Promise<void>;
}

type RawQueryParams = Parameters<RxDBAdapterSqlite['rawQuery']>[1];

const quoteIdentifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;

const createHarness = async (options?: {
  readonly registerPlugin?: boolean;
  readonly wrapRawQuery?: (
    sql: string,
    params: RawQueryParams,
    next: RxDBAdapterSqlite['rawQuery']
  ) => ReturnType<RxDBAdapterSqlite['rawQuery']>;
}): Promise<Harness> => {
  const rxdb = new RxDB({
    dbName: `search-browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entities: [Article],
    sync: {
      local: { adapter: 'sqlite-wasm' },
      type: SyncType.None
    }
  });

  if (options?.registerPlugin !== false) {
    rxdb.use(rxDBPluginSearch, { debounce: 0 });
  }

  rxdb.adapter('sqlite-wasm', db => new RxDBAdapterSqlite(db, { vfs: 'memory', batchTimeout: 1 }));
  rxdb.init();

  const adapter =
    options?.registerPlugin === false || options?.wrapRawQuery ?
      ((await rxdb.connect('sqlite-wasm')) as RxDBAdapterSqlite)
    : ((await rxdb.getAdapter('sqlite-wasm')) as RxDBAdapterSqlite);

  if (options?.wrapRawQuery) {
    const next = adapter.rawQuery.bind(adapter);
    adapter.rawQuery = ((sql, params) => options.wrapRawQuery!(sql, params, next)) as RxDBAdapterSqlite['rawQuery'];
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
  adapter: RxDBAdapterSqlite,
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

const queryFtsRowCount = async (adapter: RxDBAdapterSqlite, ftsTable: string): Promise<number> => {
  const result = await adapter.rawQuery(`SELECT count(*) AS count FROM ${quoteIdentifier(ftsTable)}`);
  const countColumn = result.columns.indexOf('count');
  return Number(result.rows[0]?.[countColumn] ?? 0);
};

const queryMatchCount = async (adapter: RxDBAdapterSqlite, ftsTable: string, query: string): Promise<number> => {
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

describe('fts5 installer browser integration', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it('T024 installs the FTS table, triggers, and install migration on first mount', async () => {
    const harness = await createHarness();
    cleanups.push(() => harness.cleanup());

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
    const harness = await createHarness({ registerPlugin: false });
    cleanups.push(() => harness.cleanup());

    await createArticle(harness.rxdb);

    const plugin = rxDBPluginSearch(harness.rxdb, { debounce: 0 }) as RxDBPluginSearch;
    plugin.install();
    cleanups.push(async () => plugin.destroy());
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
    secondPlugin.install();
    cleanups.push(async () => secondPlugin.destroy());
    await secondPlugin.ready;

    expect(await queryFtsRowCount(harness.adapter, ftsTable)).toBe(1);
    expect(await queryMatchCount(harness.adapter, ftsTable, 'alpha')).toBe(1);
  });

  it('T086 propagates backfill failures instead of swallowing them', async () => {
    const harness = await createHarness({
      registerPlugin: false,
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
    plugin.install();
    cleanups.push(async () => plugin.destroy());

    await expect(plugin.ready).rejects.toThrow('forced backfill failure');
    const migrationNames = await listMigrationNames(harness.rxdb);
    expect(migrationNames.filter(name => name.startsWith('fts5__'))).toEqual([]);
  });

  // FTS5 安装由多条 rawQuery 组成，而 `#runInstall` 并没有把它们包进事务
  //（`installFtsForEntity` 的 TSDoc 写「调用方负责」，而调用方没做）。
  // 适配器按 rawQuery 粒度串行，所以**每两条语句之间都是一个能落进用户写入的窗口**。
  //
  // 旧顺序 DDL → triggers → reset → backfill 在「triggers 之后」那个窗口上会炸：
  // trigger 已生效而索引还是空的，一条用户 DELETE 让 `_ad` 对着空索引发 `'delete'`，
  // FTS5 抛 SQLITE_CORRUPT_VTAB —— 用户看到的字面报错是「database disk image is malformed」。
  // 语句回滚、行还在，所以再点一次又好了；浏览器里表现为约 1/650 的偶发删除失灵。
  //
  // 这条用例在**每一个**窗口都插一次真实 DELETE，把偶发钉成确定性复现。
  // 它同时守住修复的两个要件：trigger 排在 backfill 之后，且三者不得被重新拆开。
  it('SRCH-FTS-BOOTSTRAP 安装期间任一窗口内的并发删除都不得打崩索引', async () => {
    const plan = extractFtsPlanFromMetadata(getEntityMetadata(Article))!;
    const quotedTable = quoteIdentifier(plan.sqlTableName!);
    const deleteErrors: unknown[] = [];
    let windows = 0;

    const harness = await createHarness({
      registerPlugin: false,
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
    plugin.install();
    cleanups.push(async () => plugin.destroy());
    await plugin.ready;

    expect(windows).toBeGreaterThanOrEqual(2);
    expect(deleteErrors).toEqual([]);
  });
});
