import { getEntityMetadata, MAIN_BRANCH_ID, RxDBBranch, type EntityMetadata } from '@aiao/rxdb';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import { get_table_name_by_metadata, quote_sql_identifier, RxDBAdapterSqliteError } from '../sqlite-core.utils.js';
import type { SqliteTransactionExecutor } from '../transaction/SqliteTransactionExecutor.js';

/**
 * 一次直发查询的结果里，本模块要用到的两格。
 */
export interface BranchQueryResult {
  /** 结果集的列名，顺序即 {@link BranchQueryResult.rows} 里每行的下标顺序 */
  readonly columns: readonly string[];

  /** 结果行，按列下标取值 */
  readonly rows: readonly (readonly unknown[])[];
}

/**
 * 能在**当前**事务连接上直发一条 SELECT 的最小门面。
 *
 * @remarks
 * 收成一个函数而不是收整个执行器：本包有两种事务门面形状
 * （`SqliteTransactionExecutor.query()` 返回扁平结果，`SqlExecutor.execute()` 把结果包在
 * `results[0]` 里），两边都能用三行 lambda 适配到这一个形状，于是「读当前分支」的判定逻辑
 * 只需要存在一份。
 */
export type SqliteBranchRowReader = (sql: string, params: SQLiteCompatibleType[]) => Promise<BranchQueryResult>;

/**
 * 分支表上这次查询要用到的两个物理列名。
 */
export interface BranchColumnNames {
  /** `RxDBBranch.id` 的物理列名 */
  readonly idColumnName: string;

  /** `RxDBBranch.activated` 的物理列名 */
  readonly activatedColumnName: string;
}

/**
 * 从实体元数据里取一个属性的物理列名
 *
 * @param metadata - `RxDBBranch` 的实体元数据
 * @param propertyName - 要取列名的属性名
 * @returns 该属性的物理列名
 * @throws {@link RxDBAdapterSqliteError} 元数据里没有这个属性时抛出
 */
const branchColumnName = (metadata: EntityMetadata, propertyName: string): string => {
  const property = metadata.propertyMap?.get(propertyName);
  if (!property) {
    throw new RxDBAdapterSqliteError(`RxDBBranch metadata is missing the "${propertyName}" property.`);
  }
  return property.columnName;
};

/**
 * 解析分支表上 `id` 与 `activated` 两列的物理列名
 *
 * @param metadata - `RxDBBranch` 的实体元数据
 * @returns 两个物理列名
 * @throws {@link RxDBAdapterSqliteError} 任一属性在元数据里缺席时抛出
 *
 * @remarks
 * 这里**不给**默认列名。退回字面量 `'id'` / `'activated'` 的前提是「元数据已经装配坏了，但列名
 * 恰好还猜得中」——猜中了什么都没发生，猜不中就把 SQLite 的 `no such column` 带回来，于是
 * 「元数据装配坏了」被伪装成「SQL 写错了」，排查要从离病灶最远的那一端往回走。更要紧的是
 * {@link readCurrentBranchId} 的调用方之一正处在 `disableTriggers` 之后的重建路径上，
 * 那条路径上任何一次静默走偏的代价都是提交一个永久没有触发器的库。pglite 侧同名函数
 * （`read_current_branch_id.ts` 的 `resolveBranchColumns`）对同一情形就是抛，措辞取齐。
 */
export const resolveBranchColumns = (metadata: EntityMetadata): BranchColumnNames => ({
  idColumnName: branchColumnName(metadata, 'id'),
  activatedColumnName: branchColumnName(metadata, 'activated')
});

/**
 * 在给定事务内读出当前激活的分支 id
 *
 * @param read - 直发当前事务的最小读门面
 * @returns 当前分支 id
 * @throws {@link RxDBAdapterSqliteError} 元数据缺列（见 {@link resolveBranchColumns}），或既没有激活分支也没有 `main` 时
 *
 * @remarks
 * 语义对齐 `VersionManager.getCurrentBranch()`：先取 `activated` 的分支，没有则回退 `main`。
 *
 * 必须经当前事务读，且读点必须落在使用它的那个事务内部——分支 id 一旦在事务外采样，
 * 采样与使用之间的任何一次真实分支切换都会让调用方拿着过期 id 重建触发器 / 改写 `activated`。
 *
 * 直发 SQL 而不经仓库：仓库的 `addQueryCache` 要做实体水合（需要 entityManager），
 * 而这里只要一个 id。少一层依赖，也让适配器单测不必搭出完整的 RxDB。
 *
 * **全包只此一份。** 此前 `with_triggers_disabled.ts` 另写了一份逐行近似的实现，两份的
 * 列名解析、结果取值与报错文案各自漂移过一轮——判定同一件事的代码分成两份时，修好的那次
 * 修复只会落在其中一份上（`?? 'id'` 兜底当年就只在 pglite 侧被删掉）。
 */
export const readCurrentBranchId = async (read: SqliteBranchRowReader): Promise<string> => {
  const metadata = getEntityMetadata(RxDBBranch);
  const table = quote_sql_identifier(get_table_name_by_metadata(metadata));
  const { idColumnName, activatedColumnName } = resolveBranchColumns(metadata);
  const idColumn = quote_sql_identifier(idColumnName);
  const activatedColumn = quote_sql_identifier(activatedColumnName);

  const readId = async (whereSql: string, params: SQLiteCompatibleType[]): Promise<string | undefined> => {
    const { columns, rows } = await read(`SELECT ${idColumn} FROM ${table} WHERE ${whereSql} LIMIT 1;`, params);
    const row = rows[0];
    // 没有行时不检查列——部分驱动对「零行」结果集连 columns 都给空数组（见
    // with_triggers_disabled.ts 的适配层），这属于「没有这个答案」的正常分支，要让调用方
    // 照常回退到下一条查询（activated 查不到就查 main），不是「结果集缺列」的异常。
    if (!row) return undefined;
    const columnIndex = columns.indexOf(idColumnName);
    // 有行却找不到 id 列，是结果集形状不对——不能像原来那样 `Math.max(0, -1)` 钳成第 0 列
    // 静默返回别的列的值：那样会把一个查不出真实含义的字符串错认成分支 id 带出去，
    // 后续按它重建触发器 / 写 activated 都会悄悄写错分支，且没有任何报错可供排查。
    if (columnIndex < 0) {
      throw new RxDBAdapterSqliteError(`RxDBBranch query result is missing the "${idColumnName}" column.`);
    }
    const value = row[columnIndex];
    return typeof value === 'string' ? value : undefined;
  };

  const branchId = (await readId(`${activatedColumn} = ?`, [1])) ?? (await readId(`${idColumn} = ?`, [MAIN_BRANCH_ID]));
  // 读不到分支的调用方都在写路径上（重建触发器 / 切分支），此时必须让事务回滚：
  // 继续下去会提交一个永久没有触发器、或把投影写错分支的库。
  if (branchId === undefined) {
    throw new RxDBAdapterSqliteError('currentBranch is undefined! Cannot start transaction with logging.');
  }
  return branchId;
};

/**
 * {@link readCurrentBranchId} 的 `SqliteTransactionExecutor` 入口
 *
 * @param executor - 当前事务的执行器
 * @returns 当前分支 id
 * @throws {@link RxDBAdapterSqliteError} 见 {@link readCurrentBranchId}
 */
export const read_current_branch_id = (executor: SqliteTransactionExecutor): Promise<string> =>
  readCurrentBranchId((sql, params) => executor.query(sql, params));
