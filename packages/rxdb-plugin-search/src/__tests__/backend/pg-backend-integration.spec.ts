import { PGliteClient } from '@aiao/rxdb-adapter-pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPgTsvectorBackend } from '../../backend/pg/pg-backend.js';
import { buildPgResetFtsSql } from '../../backend/pg/pg-search-sql.js';
import type { FtsInstallPlan } from '../../core/fts5-installer.js';
import type { MigrationRecordStore, RuntimeSqlExecutor } from '../../core/fts5-runtime.js';
import type { RawFtsRow } from '../../core/result-mapper.js';
import { SearchSchemaMismatchError } from '../../types.js';

/**
 * pg-tsvector 后端的**真库**验收（US-703 AC#1～#4、#6、#7）。
 *
 * 这套用例刻意不 mock 执行器：PG 全文检索的坑几乎全在方言层——`ts_rank` 与 `bm25`
 * 方向相反、`$N` 占位符要显式转型、`greatest` 不是聚合函数、`ts_headline` 的
 * `StartSel/StopSel` 要能原样带出哨兵字符。这些错误在字符串断言里一个都看不出来，
 * 只有真的把 SQL 交给 PostgreSQL 才会暴露。
 */
describe('pg-tsvector backend against a real PGlite database', () => {
  let client: PGliteClient;
  let executor: RuntimeSqlExecutor;
  let migrations: string[];
  let store: MigrationRecordStore;

  const backend = createPgTsvectorBackend();

  /**
   * PGlite 的 `query()` 返回 `{ fields, rows: 对象数组 }`，而插件的执行器契约要的是
   * `{ columns, rows: 值数组的数组 }`——生产路径上这层转换由
   * `RxDBAdapterPGlite.rawQuery` 做，这里手工复刻同一形状。
   */
  const rawQuery = async (
    sql: string,
    params?: readonly unknown[]
  ): Promise<{ rowsAffected: number; rows: unknown[][]; columns: string[] }> => {
    const res = await client.query<Record<string, unknown>>(sql, params ? [...params] : undefined);
    const columns = res.fields.map(field => field.name);
    return {
      rowsAffected: res.affectedRows ?? 0,
      columns,
      rows: res.rows.map(row => columns.map(column => row[column]))
    };
  };

  /** 查询侧执行器：与 `plugin.ts` 里 `mapRowsToFtsRows(await callRaw(...))` 同构。 */
  const ftsExecutor = async (sql: string, params: readonly unknown[]): Promise<readonly RawFtsRow[]> => {
    const raw = await rawQuery(sql, params);
    return raw.rows.map(row => Object.fromEntries(raw.columns.map((c, i) => [c, row[i]])) as unknown as RawFtsRow);
  };

  const plan: FtsInstallPlan = {
    tableName: 'article',
    sqlTableName: 'public$article',
    primaryKey: 'id',
    fields: [
      { name: 'title', isArray: false },
      { name: 'body', isArray: false },
      { name: 'tags', isArray: true }
    ],
    signature: 'sig-v1'
  };

  const seed = async (): Promise<void> => {
    const rows: readonly (readonly [string, string, string, readonly string[]])[] = [
      ['a1', 'Reactive database', 'a local first storage engine', ['rxdb', 'offline']],
      ['a2', 'Postgres full text', 'tsvector and gin indexes explained', ['postgres', 'search']],
      ['a3', 'Unrelated cooking notes', 'braising technique for winter stews', ['food']]
    ];
    for (const [id, title, body, tags] of rows) {
      await client.query(`INSERT INTO "public$article" (id, title, body, tags) VALUES ($1, $2, $3, $4::text[])`, [
        id,
        title,
        body,
        tags
      ]);
    }
  };

  beforeEach(async () => {
    client = new PGliteClient();
    await client.init(`pg-search-backend-${Date.now()}-${Math.random().toString(36).slice(2)}`, { store: 'memory' });
    await client.exec(`
      CREATE TABLE "public$article" (
        id TEXT PRIMARY KEY,
        title TEXT,
        body TEXT,
        tags TEXT[]
      );
    `);
    executor = { rawQuery };
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
    if (client) await client.disconnect();
  });

  it('assertCapabilities passes on a live PGlite connection', async () => {
    await expect(backend.assertCapabilities(executor, 'pglite')).resolves.toBeUndefined();
  });

  it('installs the tsvector column, GIN index and trigger, then backfills pre-existing rows (AC#1/#4)', async () => {
    // 先灌数据再安装：这些行在 ADD COLUMN 时 `_fts` 是 NULL，只能靠回填补上
    await seed();
    const result = await backend.install(plan, executor, store);
    expect(result).toEqual({ tableName: 'article', status: 'installed', fields: plan.fields });

    const pending = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "public$article" WHERE "_fts" IS NULL`
    );
    expect(pending.rows[0]?.count).toBe(0);

    const idx = await client.query(
      `SELECT 1 FROM pg_indexes WHERE tablename = 'public$article' AND indexname = 'public$article__fts_idx'`
    );
    expect(idx.rows).toHaveLength(1);
  });

  it('keeps _fts current for rows written after install, without a second backfill (AC#4)', async () => {
    await backend.install(plan, executor, store);
    await seed();
    const pending = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "public$article" WHERE "_fts" IS NULL`
    );
    expect(pending.rows[0]?.count).toBe(0);
  });

  it('ranks matches and returns snippets through the shared SearchEngine contract (AC#2/#3)', async () => {
    await seed();
    await backend.install(plan, executor, store);
    const engine = backend.createEngine(ftsExecutor);

    const results = await engine.search({
      table: 'article',
      sqlTable: 'public$article',
      entity: 'Article',
      primaryKey: 'id',
      fields: ['title', 'body', 'tags'],
      fieldSpecs: plan.fields,
      compiled: backend.compile('postgres'),
      pageSize: 10,
      offset: 0
    });

    expect(results.map(r => r.id)).toEqual(['a2']);
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
      table: 'article',
      sqlTable: 'public$article',
      entity: 'Article',
      primaryKey: 'id',
      fields: ['title', 'body', 'tags'],
      fieldSpecs: plan.fields,
      compiled: backend.compile('offline'),
      pageSize: 10,
      offset: 0
    });

    expect(results.map(r => r.id)).toEqual(['a1']);
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
    await client.exec(`ALTER TABLE "public$article" DISABLE TRIGGER "public$article__fts_trg";`);
    await client.query(`UPDATE "public$article" SET "_fts" = NULL WHERE id = 'a2'`);
    await client.exec(`ALTER TABLE "public$article" ENABLE TRIGGER "public$article__fts_trg";`);

    const resumed = await backend.install(plan, executor, store);
    expect(resumed.status).toBe('repaired');

    const pending = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "public$article" WHERE "_fts" IS NULL`
    );
    expect(pending.rows[0]?.count).toBe(0);
  });

  it('rebuilds and fully recomputes when the trigger was dropped externally (AC#7)', async () => {
    await seed();
    await backend.install(plan, executor, store);
    await client.exec(`DROP TRIGGER "public$article__fts_trg" ON "public$article";`);

    const repaired = await backend.install(plan, executor, store);
    expect(repaired.status).toBe('repaired');

    const trg = await client.query(
      `SELECT 1 FROM pg_trigger WHERE tgname = 'public$article__fts_trg' AND NOT tgisinternal`
    );
    expect(trg.rows).toHaveLength(1);
    const pending = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "public$article" WHERE "_fts" IS NULL`
    );
    expect(pending.rows[0]?.count).toBe(0);
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
    await client.exec(buildPgResetFtsSql('public$article'));
    const recomputed = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "public$article" WHERE "_fts" IS NULL`
    );
    expect(recomputed.rows[0]?.count).toBe(0);

    const row = await client.query<{ fts: string }>(`SELECT "_fts"::text AS fts FROM "public$article" WHERE id = 'a2'`);
    expect(row.rows[0]?.fts).toContain('postgr');
    expect(row.rows[0]?.fts).toContain('tsvector');
  });
});
