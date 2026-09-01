import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
// 这里静态引入适配器是安全的：`pg-fts-contract.ts` 要求的惰性加载约束只针对
// `index.ts` 可达的运行时图，spec 不在发布产物里（package.json `files` 已排除）。
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPgTsvectorBackend } from '../../backend/pg/pg-backend.js';
import { buildPgResetFtsSql } from '../../backend/pg/pg-search-sql.js';
import { extractFtsPlanFromMetadata, type FtsInstallPlan } from '../../core/fts5-installer.js';
import type { MigrationRecordStore, RuntimeSqlExecutor } from '../../core/fts5-runtime.js';
import type { RawFtsRow } from '../../core/result-mapper.js';
import { SearchSchemaMismatchError } from '../../types.js';
import { Article } from '../fixtures/article.entity.js';

/**
 * pg-tsvector 后端的**真库**验收（US-703 AC#1～#4、#6、#7）。
 *
 * 这套用例刻意不 mock 执行器：PG 全文检索的坑几乎全在方言层——`ts_rank` 与 `bm25`
 * 方向相反、`$N` 占位符要显式转型、`greatest` 不是聚合函数、`ts_headline` 的
 * `StartSel/StopSel` 要能原样带出哨兵字符。这些错误在字符串断言里一个都看不出来，
 * 只有真的把 SQL 交给 PostgreSQL 才会暴露。
 *
 * 表也必须由**真实适配器**建、计划必须由 `extractFtsPlanFromMetadata` 从真实元数据推。
 * 此前这里手写 `CREATE TABLE "public$article"` 并手工构造 plan，等于让被测代码和测试
 * 共用同一个错误前提：适配器建的其实是 `"<namespace>"."<table>"`，而计划里的
 * `sqlTableName` 是 SQLite 的 `<namespace>$<table>`。整套 pg 后端因此在真实库上
 * 一行都跑不通（42P01），而这套用例全绿。
 *
 * fixture 的 namespace 是 `search-fixtures` 而非 `public`，schema 限定漏了当场就红。
 */
describe('pg-tsvector backend against a real PGlite database', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;
  let executor: RuntimeSqlExecutor;
  let migrations: string[];
  let store: MigrationRecordStore;
  let plan: FtsInstallPlan;

  const backend = createPgTsvectorBackend();
  const metadata = getEntityMetadata(Article);
  const schema = metadata.namespace;
  const table = metadata.tableName;
  /** 适配器建表用的完全限定引用，断言里直接拼进 SQL。 */
  const qualified = `"${schema}"."${table}"`;

  /** 查询侧执行器：与 `plugin.ts` 里 `mapRowsToFtsRows(await callRaw(...))` 同构。 */
  const ftsExecutor = async (sql: string, params: readonly unknown[]): Promise<readonly RawFtsRow[]> => {
    const raw = await adapter.rawQuery(sql, [...params]);
    return raw.rows.map(row => Object.fromEntries(raw.columns.map((c, i) => [c, row[i]])) as unknown as RawFtsRow);
  };

  /** 单值计数探针。 */
  const countOf = async (sql: string): Promise<number> => {
    const raw = await adapter.rawQuery(sql);
    return Number(raw.rows[0]?.[0]);
  };

  const seed = async (): Promise<void> => {
    const repo = rxdb.entityManager.getRepository(Article);
    const rows = [
      {
        title: 'Reactive database',
        body: 'a local first storage engine',
        tags: ['rxdb', 'offline']
      },
      {
        title: 'Postgres full text',
        body: 'tsvector and gin indexes explained',
        tags: ['postgres', 'search']
      },
      {
        title: 'Unrelated cooking notes',
        body: 'braising technique for winter stews',
        tags: ['food']
      }
    ];
    for (const row of rows) {
      await repo.create(
        rxdb.entityManager.instantiate(Article, {
          ...row,
          category: 'tech' as const,
          authorId: 'author-1',
          viewCount: 0
        })
      );
    }
  };

  /** 按标题定位 id：主键由适配器生成，用例不能硬编码。 */
  const idOfTitle = async (title: string): Promise<string> => {
    const raw = await adapter.rawQuery(`SELECT "id" FROM ${qualified} WHERE "title" = $1`, [title]);
    return String(raw.rows[0]?.[0]);
  };

  beforeEach(async () => {
    rxdb = new RxDB({
      dbName: `pg-search-backend-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      context: { userId: 'tester' },
      entities: [Article],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', async db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });
    await rxdb.connect('pglite');

    executor = { rawQuery: (sql, params) => adapter.rawQuery(sql, params ? [...params] : undefined) };
    plan = extractFtsPlanFromMetadata(metadata)!;
    migrations = [];
    store = {
      listInstallMigrationsForTable: (tableName: string) =>
        Promise.resolve(
          migrations.filter(name => name.startsWith(backend.installMigrationPrefix(tableName))).map(name => ({ name }))
        ),
      recordMigration: (name: string) => {
        migrations.push(name);
        return Promise.resolve();
      }
    };
  });

  afterEach(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('assertCapabilities passes on a live PGlite connection', async () => {
    await expect(backend.assertCapabilities(executor, 'pglite')).resolves.toBeUndefined();
  });

  it('installs the tsvector column, GIN index and trigger, then backfills pre-existing rows (AC#1/#4)', async () => {
    // 先灌数据再安装：这些行在 ADD COLUMN 时 `_fts` 是 NULL，只能靠回填补上
    await seed();
    const result = await backend.install(plan, executor, store);
    expect(result).toEqual({ tableName: table, status: 'installed', fields: plan.fields });

    expect(await countOf(`SELECT count(*)::int FROM ${qualified} WHERE "_fts" IS NULL`)).toBe(0);
    // 索引必须落在实体自己的 schema 里，而不是 search_path 首个 schema
    expect(
      await countOf(
        `SELECT count(*)::int FROM pg_indexes WHERE schemaname = '${schema}' AND tablename = '${table}' AND indexname = '${table}__fts_idx'`
      )
    ).toBe(1);
  });

  it('keeps _fts current for rows written after install, without a second backfill (AC#4)', async () => {
    await backend.install(plan, executor, store);
    await seed();
    expect(await countOf(`SELECT count(*)::int FROM ${qualified} WHERE "_fts" IS NULL`)).toBe(0);
  });

  it('ranks matches and returns snippets through the shared SearchEngine contract (AC#2/#3)', async () => {
    await seed();
    await backend.install(plan, executor, store);
    const engine = backend.createEngine(ftsExecutor);

    const results = await engine.search({
      table,
      schema,
      entity: 'Article',
      primaryKey: plan.primaryKey,
      fields: plan.fields.map(f => f.name),
      fieldSpecs: plan.fields,
      compiled: backend.compile('postgres'),
      pageSize: 10,
      offset: 0
    });

    expect(results.map(r => r.id)).toEqual([await idOfTitle('Postgres full text')]);
    // rank 的语义在两套后端间统一为「越小越相关」：PG 侧靠 `-ts_rank(...)` 取反达成。
    // 这条断言就是那次取反的守门人——漏掉负号时排序会整体倒过来。
    expect(results[0].rank).toBeLessThan(0);
    expect(results[0].snippet).toContain('Postgres');
  });

  it('matches array columns and finds them via the tags field (AC#2)', async () => {
    await seed();
    await backend.install(plan, executor, store);
    const engine = backend.createEngine(ftsExecutor);

    const results = await engine.search({
      table,
      schema,
      entity: 'Article',
      primaryKey: plan.primaryKey,
      fields: plan.fields.map(f => f.name),
      fieldSpecs: plan.fields,
      compiled: backend.compile('offline'),
      pageSize: 10,
      offset: 0
    });

    expect(results.map(r => r.id)).toEqual([await idOfTitle('Reactive database')]);
    expect(results[0].matchedField).toBe('tags');
  });

  it('is idempotent: a second install with the same signature is a no-op (AC#4)', async () => {
    await seed();
    await backend.install(plan, executor, store);
    const again = await backend.install(plan, executor, store);
    expect(again.status).toBe('already_installed');
    // 幂等意味着不再写第二对迁移记录
    expect(migrations).toHaveLength(2);
  });

  it('resumes an interrupted backfill instead of treating it as ready (AC#7)', async () => {
    await seed();
    await backend.install(plan, executor, store);

    // 模拟「结构装好了、回填只做了一半就被杀」：把一行的 `_fts` 打回 NULL。
    // `_fts IS NULL` 本身就是回填进度的持久化哨兵，不需要另建记账字段——
    // 这也正是 ADD COLUMN 之后存量行天然处于的状态。
    //
    // 必须先停 trigger：它是 BEFORE UPDATE，开着的话这条 UPDATE 会被它当场改回算好的值，
    // 根本造不出待回填行（这条约束本身也是「回填 = 空更新」能成立的原因）。
    const id = await idOfTitle('Postgres full text');
    await adapter.rawQuery(`ALTER TABLE ${qualified} DISABLE TRIGGER "${table}__fts_trg"`);
    await adapter.rawQuery(`UPDATE ${qualified} SET "_fts" = NULL WHERE "id" = $1`, [id]);
    await adapter.rawQuery(`ALTER TABLE ${qualified} ENABLE TRIGGER "${table}__fts_trg"`);

    const resumed = await backend.install(plan, executor, store);
    expect(resumed.status).toBe('repaired');
    expect(await countOf(`SELECT count(*)::int FROM ${qualified} WHERE "_fts" IS NULL`)).toBe(0);
  });

  it('rebuilds and fully recomputes when the trigger was dropped externally (AC#7)', async () => {
    await seed();
    await backend.install(plan, executor, store);
    await adapter.rawQuery(`DROP TRIGGER "${table}__fts_trg" ON ${qualified}`);

    const repaired = await backend.install(plan, executor, store);
    expect(repaired.status).toBe('repaired');

    expect(
      await countOf(`SELECT count(*)::int FROM pg_trigger WHERE tgname = '${table}__fts_trg' AND NOT tgisinternal`)
    ).toBe(1);
    expect(await countOf(`SELECT count(*)::int FROM ${qualified} WHERE "_fts" IS NULL`)).toBe(0);
  });

  it('fails fast when the recorded signature does not match the current schema (AC#6)', async () => {
    await backend.install(plan, executor, store);
    await expect(backend.install({ ...plan, signature: 'sig-v2' }, executor, store)).rejects.toBeInstanceOf(
      SearchSchemaMismatchError
    );
  });

  it('recomputes every row through the live trigger — no SQL here ever restates the tsvector expression', async () => {
    await backend.install(plan, executor, store);
    await seed();

    // `buildPgResetFtsSql` 写的是 `SET "_fts" = NULL`，但 BEFORE UPDATE trigger 会在落盘前
    // 把 NEW."_fts" 重新算好——所以它实际的效果是**全表重算**，而不是清空。这正是想要的：
    // 结构被外部改坏后重建 trigger，紧接着这一条就把所有旧向量换成新表达式的产物，
    // 而插件侧完全不必复制一份 to_tsvector 表达式（复制就会与 trigger 漂移）。
    await adapter.rawQuery(buildPgResetFtsSql({ schema, table }));
    expect(await countOf(`SELECT count(*)::int FROM ${qualified} WHERE "_fts" IS NULL`)).toBe(0);

    const id = await idOfTitle('Postgres full text');
    const raw = await adapter.rawQuery(`SELECT "_fts"::text FROM ${qualified} WHERE "id" = $1`, [id]);
    expect(String(raw.rows[0]?.[0])).toContain('postgr');
    expect(String(raw.rows[0]?.[0])).toContain('tsvector');
  });
});
