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

/**
 * {@link cleanupSqliteTestAdapter} 所需的最小适配器结构。
 */
export type SqliteTestAdapterLike = {
  rxdb?: {
    entityManager?: CacheCleaner;
  };
  cleanAllCache?: () => void | Promise<void>;
  /**
   * 第二个参数是 `transactionLog`：**true = 开启变更日志**（底层默认值），
   * 传 false 才是关闭。清库不应写变更日志，因此本工具固定传 false。
   * 早先此处形参名为 `skipLog`，与真实语义完全相反。
   */
  transaction: <T>(callback: (tx: SqliteTransactionLike) => Promise<T>, transactionLog?: boolean) => Promise<T>;
};

/** {@link cleanupSqliteTestAdapter} 的选项。 */
export type SqliteCleanupOptions = {
  removeTriggersSql?: string | null;
  restoreTriggersSql?: string | null;
  resetToMainBranchSql?: () => string;
  insertMainBranchSql?: string;
  shouldDeleteTable?: (tableName: string) => boolean;
};

type SqliteTable = {
  name: string;
  sql: string | null;
};

const DEFAULT_INSERT_MAIN_BRANCH_SQL = `INSERT INTO "rxdb$rxdb_branch" (id,activated,fromChangeId,local,remote) VALUES ('main',1,NULL,1,0);`;

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

const cleanAdapterCaches = async (adapter: SqliteTestAdapterLike): Promise<void> => {
  await adapter.rxdb?.entityManager?.cleanAllCache?.();
  await adapter.cleanAllCache?.();
};

/**
 * 重置基于 SQLite 的测试适配器，默认不删除 SQLite、RxDB 系统或虚表存储。
 */
export const cleanupSqliteTestAdapter = async (adapter: SqliteTestAdapterLike, options: SqliteCleanupOptions = {}) => {
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
