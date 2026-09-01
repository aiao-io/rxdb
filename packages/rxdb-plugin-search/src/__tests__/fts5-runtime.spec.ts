/**
 * T030 —— FTS5 运行时安装器单元测试。
 *
 * 用内存 mock `RuntimeSqlExecutor` + `MigrationRecordStore` 覆盖：
 *  - 首次安装：DDL + triggers + backfill + 两条 migration 记录顺序
 *  - 重复调用幂等（同签名）
 *  - 签名漂移触发 `SearchSchemaMismatchError`
 *  - stringArray 字段回填走 `json_each + group_concat`
 */
import { describe, expect, it, vi } from 'vitest';

import type { FtsInstallPlan } from '../core/fts5-installer.js';
import {
  buildBackfillSql,
  installFtsForEntity,
  type MigrationRecordStore,
  type RuntimeSqlExecutor
} from '../core/fts5-runtime.js';
import { SearchSchemaMismatchError } from '../types.js';

const makePlan = (overrides: Partial<FtsInstallPlan> = {}): FtsInstallPlan => ({
  tableName: 'article',
  sqlTableName: 'public$article',
  primaryKey: 'id',
  fields: [
    { name: 'title', isArray: false },
    { name: 'tags', isArray: true }
  ],
  signature: 'sig-v1',
  ...overrides
});

const healthyRuntimeRows: unknown[][] = [
  [
    'table',
    '_fts_public$article',
    `CREATE VIRTUAL TABLE "_fts_public$article" USING fts5("title", "tags", content='public$article', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2')`
  ],
  [
    'trigger',
    '_fts_public$article_ai',
    `CREATE TRIGGER "_fts_public$article_ai" AFTER INSERT ON "public$article" BEGIN INSERT INTO "_fts_public$article" VALUES (rxdb_fts_bigram(NEW."title"), rxdb_fts_bigram(NEW."tags")); END`
  ],
  [
    'trigger',
    '_fts_public$article_ad',
    `CREATE TRIGGER "_fts_public$article_ad" AFTER DELETE ON "public$article" BEGIN INSERT INTO "_fts_public$article" VALUES (rxdb_fts_bigram(OLD."title"), rxdb_fts_bigram(OLD."tags")); END`
  ],
  [
    'trigger',
    '_fts_public$article_au',
    `CREATE TRIGGER "_fts_public$article_au" AFTER UPDATE ON "public$article" BEGIN INSERT INTO "_fts_public$article" VALUES (NEW."title", NEW."tags", rxdb_fts_bigram(NEW."title")); END`
  ]
];

const makeExecutor = (runtimeRows: unknown[][] = []) => {
  const rawQuery = vi.fn(async (sql: string) =>
    sql.includes('sqlite_master') ?
      { rowsAffected: 0, rows: runtimeRows, columns: ['type', 'name', 'sql'] }
    : { rowsAffected: 0, rows: [], columns: [] }
  );
  return { rawQuery } as RuntimeSqlExecutor & { rawQuery: ReturnType<typeof vi.fn> };
};

const makeStore = (
  initial: readonly { name: string }[] = []
): MigrationRecordStore & {
  list: ReturnType<typeof vi.fn>;
  record: ReturnType<typeof vi.fn>;
  recorded: string[];
} => {
  const store: { name: string }[] = [...initial];
  const recorded: string[] = [];
  const list = vi.fn(async () => [...store]);
  const record = vi.fn(async (name: string) => {
    recorded.push(name);
    store.push({ name });
  });
  return {
    listInstallMigrationsForTable: list,
    recordMigration: record,
    list,
    record,
    recorded
  };
};

describe('installFtsForEntity (T030)', () => {
  it('首次安装：DDL 一次 + 「reset → backfill → triggers」同批一次 → 2 条 migration', async () => {
    const plan = makePlan();
    const exec = makeExecutor();
    const store = makeStore();

    const result = await installFtsForEntity(plan, exec, store);

    expect(result).toEqual({
      tableName: 'article',
      status: 'installed',
      fields: plan.fields
    });

    // 只有 2 条 rawQuery：create table，以及 reset + backfill + triggers 的合并批次。
    // 合并不是为了省往返：适配器按 rawQuery 粒度串行，每多拆一次就多一个能插入
    // 用户写入的窗口，而窗口里的 DELETE 会让 `_ad` trigger 打空索引 → SQLITE_CORRUPT_VTAB。
    expect(exec.rawQuery).toHaveBeenCalledTimes(2);
    const sqls = exec.rawQuery.mock.calls.map(c => c[0] as string);
    expect(sqls[0]).toMatch(/CREATE VIRTUAL TABLE IF NOT EXISTS "_fts_public\$article"/);

    const batch = sqls[1];
    const resetAt = batch.indexOf(`INSERT INTO "_fts_public$article"("_fts_public$article") VALUES('delete-all')`);
    const backfillAt = batch.indexOf(`INSERT INTO "_fts_public$article"(rowid,`);
    const triggerAt = batch.indexOf(`CREATE TRIGGER IF NOT EXISTS "_fts_public$article_ai"`);
    expect(resetAt).toBeGreaterThanOrEqual(0);
    // trigger 必须排在 backfill 之后：反过来则 backfill 期间的用户 DELETE 会打空索引
    expect(backfillAt).toBeGreaterThan(resetAt);
    expect(triggerAt).toBeGreaterThan(backfillAt);

    // migration 两条，签名编码在后缀
    expect(store.recorded).toEqual([
      'fts5__public$article__v1__install__sig-v1',
      'fts5__public$article__v1__backfill__sig-v1'
    ]);
  });

  it('签名一致时幂等：already_installed，无 SQL 副作用', async () => {
    const plan = makePlan();
    const exec = makeExecutor(healthyRuntimeRows);
    const store = makeStore([{ name: 'fts5__public$article__v1__install__sig-v1' }]);

    const result = await installFtsForEntity(plan, exec, store);

    expect(result.status).toBe('already_installed');
    expect(exec.rawQuery).toHaveBeenCalledTimes(1);
    expect(exec.rawQuery.mock.calls[0][0]).toContain('sqlite_master');
    expect(store.record).not.toHaveBeenCalled();
  });

  it('迁移名存在但运行时对象缺失时修复 FTS 表和 triggers', async () => {
    const plan = makePlan();
    const exec = makeExecutor();
    const store = makeStore([{ name: 'fts5__public$article__v1__install__sig-v1' }]);

    const result = await installFtsForEntity(plan, exec, store);

    expect(result.status).toBe('repaired');
    expect(exec.rawQuery.mock.calls[0][0]).toContain('sqlite_master');
    expect(exec.rawQuery.mock.calls[1][0]).toContain('DROP TRIGGER');
    expect(exec.rawQuery.mock.calls[2][0]).toContain('CREATE VIRTUAL TABLE');
    // 修复不是「补一个缺的对象」，而是与 PG 侧一样的**全量重算**：
    // 第 4 次 rawQuery 仍是 reset → backfill → triggers 的同一个合并批次。
    const repairBatch = exec.rawQuery.mock.calls[3][0] as string;
    expect(repairBatch).toContain(`VALUES('delete-all')`);
    expect(repairBatch.indexOf('SELECT src.rowid')).toBeGreaterThan(repairBatch.indexOf(`VALUES('delete-all')`));
    expect(repairBatch.indexOf('CREATE TRIGGER')).toBeGreaterThan(repairBatch.indexOf('SELECT src.rowid'));
    // 记录已经在了，重复写只会污染签名判定
    expect(store.record).not.toHaveBeenCalled();
  });

  it('回填中断：一条 migration 都不落，下次整批重装（AC#7）', async () => {
    // 与 pg-tsvector 后端的 AC#7 用例对称。两套后端用的是同一个可恢复性模型，
    // 只是哨兵不同：PG 侧靠数据本身（`_fts IS NULL`），FTS5 侧靠「记录只在全部完成后才写」。
    // 因此这里要钉死的是：中断点落在批次里时，绝不能留下半条记录——留下了，
    // 下一次启动就会走 `already_installed`/`repaired` 分支，把只填了一半的索引当成就绪的。
    const plan = makePlan();
    const store = makeStore();
    const failing = {
      rawQuery: vi.fn(async (sql: string) => {
        if (sql.includes('CREATE VIRTUAL TABLE')) return { rowsAffected: 0, rows: [], columns: [] };
        throw new Error('worker terminated mid-backfill');
      })
    } as RuntimeSqlExecutor & { rawQuery: ReturnType<typeof vi.fn> };

    await expect(installFtsForEntity(plan, failing, store)).rejects.toThrow('worker terminated mid-backfill');
    expect(store.record).not.toHaveBeenCalled();

    // 第二次启动：迁移表里空空如也，于是走的是全新安装而不是修复，
    // reset 会把上一轮填进去的残留整体清掉，再从零回填。
    const retry = makeExecutor();
    const result = await installFtsForEntity(plan, retry, store);
    expect(result.status).toBe('installed');
    expect(store.recorded).toEqual([
      'fts5__public$article__v1__install__sig-v1',
      'fts5__public$article__v1__backfill__sig-v1'
    ]);
  });

  it('签名漂移：抛 SearchSchemaMismatchError 并带上存储/期望签名', async () => {
    const plan = makePlan({ signature: 'sig-v2' });
    const exec = makeExecutor();
    const store = makeStore([{ name: 'fts5__public$article__v1__install__sig-v1' }]);

    await expect(installFtsForEntity(plan, exec, store)).rejects.toSatisfy(err => {
      if (!(err instanceof SearchSchemaMismatchError)) return false;
      expect(err.table).toBe('article');
      expect(err.expected).toBe('sig-v2');
      expect(err.actual).toBe('sig-v1');
      return true;
    });

    // 不得有任何 DDL 或 migration 写入
    expect(exec.rawQuery).not.toHaveBeenCalled();
    expect(store.record).not.toHaveBeenCalled();
  });

  it('历史残留多个不同签名：即使当前签名命中其一，也抛 SearchSchemaMismatchError', async () => {
    // 场景：迁移表里同表并存 sig-v1 / sig-v2（外部干预或旧版本残留）。
    // 真实 _fts_* 表结构无法确定，任何"任意历史命中即放行"都可能让查询在运行期才炸。
    const plan = makePlan({ signature: 'sig-v1' });
    const exec = makeExecutor();
    const store = makeStore([
      { name: 'fts5__public$article__v1__install__sig-v1' },
      { name: 'fts5__public$article__v1__install__sig-v2' }
    ]);

    await expect(installFtsForEntity(plan, exec, store)).rejects.toThrow(SearchSchemaMismatchError);
    expect(exec.rawQuery).not.toHaveBeenCalled();
    expect(store.record).not.toHaveBeenCalled();
  });

  it('buildBackfillSql: stringArray 字段走 json_each + group_concat', () => {
    const plan = makePlan();
    const sql = buildBackfillSql(plan);
    expect(sql).toContain('INSERT INTO "_fts_public$article"(rowid, "title", "tags")');
    // 不再使用 INSERT OR IGNORE：去重由 reset SQL 保证
    expect(sql).not.toContain('INSERT OR IGNORE');
    // 写入 FTS 前统一套 rxdb_fts_bigram：必须与 trigger 的 valueWrapper 完全一致，
    // 否则 backfill 的存量与 trigger 的增量分词方式不同，查询只能命中其中一半
    expect(sql).toContain('SELECT src.rowid, rxdb_fts_bigram(src."title"),');
    expect(sql).toContain(
      'rxdb_fts_bigram(COALESCE((SELECT group_concat(value, char(10)) FROM json_each(src."tags")), \'\'))'
    );
    expect(sql).toContain('FROM "public$article" AS src');
  });

  it('buildBackfillSql: 纯标量字段直接写 src.<col>', () => {
    const plan = makePlan({
      fields: [
        { name: 'title', isArray: false },
        { name: 'body', isArray: false }
      ],
      signature: 'sig-scalar'
    });
    const sql = buildBackfillSql(plan);
    expect(sql).not.toContain('json_each');
    expect(sql).toContain(
      'SELECT src.rowid, rxdb_fts_bigram(src."title"), rxdb_fts_bigram(src."body") FROM "public$article" AS src'
    );
  });
});
