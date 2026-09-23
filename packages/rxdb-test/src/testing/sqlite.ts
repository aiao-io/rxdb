import { ACTIVE_BRANCH_KEY } from '@aiao/rxdb';

type SqliteQueryRow = unknown[];

type SqliteExecuteResult = {
  results?: Array<{
    rows?: SqliteQueryRow[];
  }>;
};

type SqliteTransactionLike = {
  execute: (sql: string) => Promise<SqliteExecuteResult>;
};

type CacheCleaner = {
  cleanAllCache?: () => void | Promise<void>;
};

type CacheOwner = {
  rxdb?: {
    entityManager?: CacheCleaner;
  };
  cleanAllCache?: () => void | Promise<void>;
};

/**
 * {@link cleanupSqliteTestAdapter} 所需的最小适配器结构。
 *
 * @typeParam TTx - 适配器交给事务回调的句柄类型。默认只要求 {@link SqliteTransactionLike}
 * 那一个 `execute`；真实适配器交出的句柄成员更多（例如 `saveMany`），由**调用点推断**得到，
 * 于是 {@link SqliteCleanupOptions.restoreInitialRows} 拿到的是适配器自己那个句柄，
 * 不必在钩子里往回 cast。写死成最小结构就等于逼每个用得上更多成员的调用方各写一次断言。
 */
export type SqliteTestAdapterLike<TTx extends SqliteTransactionLike = SqliteTransactionLike> = CacheOwner & {
  /**
   * 第二个参数是 `transactionLog`：**true = 开启变更日志**（底层默认值），
   * 传 false 才是关闭。清库不应写变更日志，因此本工具固定传 false。
   * 早先此处形参名为 `skipLog`，与真实语义完全相反。
   */
  transaction: <T>(callback: (tx: TTx) => Promise<T>, transactionLog?: boolean) => Promise<T>;
};

/** {@link cleanupSqliteTestAdapter} 的选项。 */
export type SqliteCleanupOptions<TTx extends SqliteTransactionLike = SqliteTransactionLike> = {
  removeTriggersSql?: string | null;
  restoreTriggersSql?: string | null;
  resetToMainBranchSql?: () => string;
  insertMainBranchSql?: string;
  shouldDeleteTable?: (tableName: string) => boolean;
  /**
   * 补回「新库形态」里除 main 分支行以外的那半截：各系统能力贡献的初始行。
   *
   * @remarks
   * 新库形态由 `RxDB.createTables()` 定义 —— main 分支行**加上**
   * `systemContributions.flatMap(c => c.createInitialRows(...))`。逐表 DELETE 把后半截
   * 一并清掉了，不补回来，装了 `@aiao/rxdb-plugin-working-tree` 这类插件的库在清库后
   * 第一次 `createBranch()` 就会因为读不到工作树单例行直接抛错。
   *
   * 之所以是钩子而不是本工具自己做：**行的内容归贡献方定义**，本包不认识任何插件，
   * 也不该认识。调用方回头调同一个 `createInitialRows` 即可，行只有一个定义处。
   *
   * 之所以不能由调用方在本函数**返回后**自己写：那时触发器已经装回去了
   * （`resetToMainBranchSql` 就在干这事），补行会被记成一次用户编辑，清理动作自己
   * 在下一个用例的 undo 栈里留下一格。这个窗口只有事务内部拿得到，故必须是钩子。
   *
   * 调用时机卡在 main 分支行**之后**（那些行按分支挂靠，main 不在就是悬空外键）、
   * 触发器重装**之前**。抛错不吞：半残库（有 main、没有单例行）的症状会落到下一个
   * 用例头上，离原因隔着一整条用例。
   */
  restoreInitialRows?: (tx: TTx) => Promise<void>;
};

type SqliteTable = {
  name: string;
  sql: string | null;
};

/**
 * 清库后补回 main 分支的默认 INSERT。
 *
 * @remarks
 * `activeKey` 与 `activated` 必须同进同出：「至多一个 active」那一半靠 `rxdb_branch.activeKey`
 * 的可空唯一列实现，而可空唯一列只管得住非 NULL 的行。这里写 `activated = 1` 却不写哨兵值，
 * 补回来的 main 就从此刻起不受该约束管辖，且不报任何错。
 */
const DEFAULT_INSERT_MAIN_BRANCH_SQL = `INSERT INTO "rxdb$rxdb_branch" (id,activated,activeKey,fromChangeId,local,remote) VALUES ('main',1,'${ACTIVE_BRANCH_KEY}',NULL,1,0);`;

/**
 * 默认清哪些表。
 *
 * @remarks
 * 只放过 SQLite 自己的内部表（`sqlite_*`）。`rxdb$` 系统表**必须**清：
 * `rxdb$rxdb_change` 留着会把上一个测试的 undo/redo 历史带进下一个测试；
 * `rxdb$rxdb_branch` 清完由 {@link DEFAULT_INSERT_MAIN_BRANCH_SQL} 补回 main 分支。
 */
const DEFAULT_SHOULD_DELETE_TABLE = (tableName: string) => !tableName.startsWith('sqlite_');

const getSqliteTables = (result: SqliteExecuteResult): SqliteTable[] => {
  const rows = result.results?.[0]?.rows ?? [];
  return rows.flatMap(row => {
    const [name, sql] = row;
    if (typeof name !== 'string' || name.length === 0) return [];
    return [{ name, sql: typeof sql === 'string' ? sql : null }];
  });
};

/**
 * SQLite 虚表自建的影子表后缀（FTS5 / FTS3-4 / RTree 三族的固定集合）。
 *
 * @remarks
 * RXT-005：早先的判定是「任意 `<虚表名>_` 前缀即影子表」，于是与虚表同前缀的**普通业务表**
 * （`search_audit`）和**第二张虚表**（`search_archive`）都被误判为影子表而跳过清理，
 * 上一个测试的数据原样活到下一个测试。影子表后缀由 SQLite 自己固定，必须精确匹配。
 */
const SHADOW_TABLE_SUFFIXES: ReadonlyArray<string> = [
  // FTS5
  'data',
  'idx',
  'content',
  'docsize',
  'config',
  // FTS3 / FTS4
  'segments',
  'segdir',
  'stat',
  // RTree
  'node',
  'rowid',
  'parent'
];

const isShadowTableOf = (name: string, virtualName: string): boolean => {
  if (!name.startsWith(`${virtualName}_`)) return false;
  return SHADOW_TABLE_SUFFIXES.includes(name.slice(virtualName.length + 1));
};

const getSqliteTableNames = (
  result: SqliteExecuteResult,
  shouldDeleteTable: (tableName: string) => boolean
): string[] => {
  const tables = getSqliteTables(result);
  const virtualTableNames = tables
    .filter(table => /^CREATE\s+VIRTUAL\s+TABLE\b/i.test(table.sql ?? ''))
    .map(table => table.name);

  return (
    tables
      .map(table => table.name)
      // 只跳过影子表（`<虚表>_data` / `_idx` / `_content` / ...）：它们由虚表自己维护，
      // 直接 DELETE 会损坏索引结构。虚表本身必须清 —— 否则调用方一旦传了 removeTriggersSql，
      // 基表 DELETE 不再触发 FTS 同步，索引里的旧行会原样留下，reset 后仍能搜到已删行。
      .filter(
        name =>
          virtualTableNames.includes(name) || !virtualTableNames.some(virtualName => isShadowTableOf(name, virtualName))
      )
      .filter(shouldDeleteTable)
  );
};

const quoteIdentifier = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

const cleanAdapterCaches = async (adapter: CacheOwner): Promise<void> => {
  await adapter.rxdb?.entityManager?.cleanAllCache?.();
  await adapter.cleanAllCache?.();
};

/**
 * 重置基于 SQLite 的测试适配器，默认不删除 SQLite、RxDB 系统或虚表存储。
 */
export const cleanupSqliteTestAdapter = async <TTx extends SqliteTransactionLike = SqliteTransactionLike>(
  adapter: SqliteTestAdapterLike<TTx>,
  options: SqliteCleanupOptions<TTx> = {}
) => {
  await cleanAdapterCaches(adapter);

  try {
    await adapter.transaction(async tx => {
      await tx.execute('PRAGMA defer_foreign_keys = ON;');

      const removeTriggersSql = options.removeTriggersSql?.trim();
      const restoreTriggersSql = options.restoreTriggersSql?.trim();
      let resetToMainBranch = false;
      if (removeTriggersSql) await tx.execute(removeTriggersSql);

      try {
        const tableNameResult = await tx.execute(`SELECT name, sql FROM sqlite_master WHERE type='table';`);
        const tableNames = getSqliteTableNames(
          tableNameResult,
          options.shouldDeleteTable ?? DEFAULT_SHOULD_DELETE_TABLE
        );
        const clearsBranchTable = tableNames.includes('rxdb$rxdb_branch');
        const resetToMainBranchSql = clearsBranchTable ? options.resetToMainBranchSql?.().trim() : undefined;
        if (clearsBranchTable && !resetToMainBranchSql) {
          throw new Error('resetToMainBranchSql is required when cleaning rxdb$rxdb_branch');
        }
        for (const tableName of tableNames) {
          await tx.execute(`DELETE FROM ${quoteIdentifier(tableName)};`);
        }

        const insertMainBranchSql = options.insertMainBranchSql?.trim();
        if (insertMainBranchSql) {
          await tx.execute(insertMainBranchSql);
        } else if (clearsBranchTable) {
          await tx.execute(DEFAULT_INSERT_MAIN_BRANCH_SQL);
        }
        await options.restoreInitialRows?.(tx);
        if (resetToMainBranchSql) {
          await tx.execute(resetToMainBranchSql);
          resetToMainBranch = true;
        }
      } finally {
        if (!resetToMainBranch && restoreTriggersSql) await tx.execute(restoreTriggersSql);
      }
    }, false);
  } finally {
    await cleanAdapterCaches(adapter);
  }
};
