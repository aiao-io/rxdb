import { getEntityMetadata, MAIN_BRANCH_ID, RxDBBranch, type EntityMetadata } from '@aiao/rxdb';
import type { Results } from '@electric-sql/pglite';

import { getTableNameByMetadata, quoteIdentifier, RxdbAdapterPGliteError } from '../pglite.utils.js';

/**
 * 能在**当前**事务连接上直发 SQL 的最小门面。
 *
 * @remarks
 * 只声明 `query` 而不收整个 `PGliteTransactionExecutor`：这里需要的全部能力就是「在当前事务上
 * 发一条 SELECT」，收窄到这一个方法让测试可以传最小替身。事务内的适配器门面
 * （`PGliteTransactionExecutor.adapter`）与 executor 自己都满足它。
 */
export type PGliteRowReader = {
  query<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<Results<T>>;
};

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
 * @throws {@link RxdbAdapterPGliteError} 元数据里没有这个属性时抛出
 */
function branchColumnName(metadata: EntityMetadata, propertyName: string): string {
  const property = metadata.propertyMap.get(propertyName);
  if (!property) {
    throw new RxdbAdapterPGliteError(`RxDBBranch metadata is missing the "${propertyName}" property.`);
  }
  return property.columnName;
}

/**
 * 解析分支表上 `id` 与 `activated` 两列的物理列名
 *
 * @param metadata - `RxDBBranch` 的实体元数据
 * @returns 两个物理列名
 * @throws {@link RxdbAdapterPGliteError} 任一属性在元数据里缺席时抛出
 *
 * @remarks
 * 这里**不给**默认列名。退回字面量 `'id'` / `'activated'` 的前提是「元数据已经装配坏了，但列名
 * 恰好还猜得中」——猜中了什么都没发生，猜不中就把 PG 的 `column does not exist` 带回来，于是
 * 「元数据装配坏了」被伪装成「SQL 写错了」，排查要从离病灶最远的那一端往回走。更要紧的是调用方
 * （{@link readCurrentBranchId}）正处在 `disableTriggers` 之后的重建路径上，这条路径上任何一次
 * 静默走偏的代价都是提交一个永久没有触发器的库。同包 `migrate_system_schema.ts` 对同一情形就是
 * 抛，措辞取齐。
 */
export function resolveBranchColumns(metadata: EntityMetadata): BranchColumnNames {
  return {
    idColumnName: branchColumnName(metadata, 'id'),
    activatedColumnName: branchColumnName(metadata, 'activated')
  };
}

/**
 * 读当前分支 id（`activated` 优先，否则 `main`），供重建触发器使用
 *
 * @param tx - 当前事务的直发门面
 * @returns 当前活跃分支 id
 * @throws {@link RxdbAdapterPGliteError} 元数据缺列（见 {@link resolveBranchColumns}）或读不到任何分支时抛出，让事务回滚
 *
 * @remarks
 * **不能**走 `versionManager.getCurrentBranch()`：那一份的热路径用绑在**真实适配器**上的仓库
 * 去读，而适配器的 `query()` 会重新入队（`#queue` 并发度 1）。`pull-batch` 在外层
 * `adapter.transaction` 里调 `executor.mergeChanges(..., disableTriggers=true)` 时，槽位正被
 * 外层事务占着——再入队等于排在自己身后，永久挂起。这里经当前事务直发 SQL，与 sqlite 侧的
 * 同名函数（`with_triggers_disabled.ts`）同口径；两包是仅有的两处 `transaction()` 实现，
 * 语义分叉会让共享契约套件在其中一边悄悄失效。
 *
 * 读不到分支就无法重建触发器，此时必须抛让事务回滚，否则会提交一个永久没有触发器的库。
 */
export async function readCurrentBranchId(tx: PGliteRowReader): Promise<string> {
  const branchId = await readActiveBranchId(tx);
  if (branchId === undefined) {
    throw new RxdbAdapterPGliteError('currentBranch is undefined! Cannot rebuild triggers after disableTriggers.');
  }
  return branchId;
}

/**
 * 读分支表里的当前分支（`activated` 优先，否则 id 为根分支的那行），一行都读不到时返回 `undefined`
 *
 * @param tx - 当前事务的直发门面
 * @returns 当前分支 id；分支表里没有可用行时为 `undefined`
 * @throws {@link RxdbAdapterPGliteError} 元数据缺列时抛出（见 {@link resolveBranchColumns}）
 *
 * @remarks
 * 「读不到」算不算错由**调用方**判，所以这一层不抛：{@link readCurrentBranchId} 站在
 * `disableTriggers` 之后的重建路径上，读不到就会提交一个永久没有触发器的库，必须抛；
 * {@link readBranchIdForNewTables} 站在建表路径上，读不到时触发器已经按根分支生成好了，
 * 抛只会把一条本来能跑完的建库/升级路径堵死在建表上。
 */
async function readActiveBranchId(tx: PGliteRowReader): Promise<string | undefined> {
  const metadata = getEntityMetadata(RxDBBranch);
  const table = getTableNameByMetadata(metadata);
  const { idColumnName, activatedColumnName } = resolveBranchColumns(metadata);
  const idColumn = quoteIdentifier(idColumnName);
  const activatedColumn = quoteIdentifier(activatedColumnName);

  const readId = async (whereSql: string, params?: unknown[]): Promise<string | undefined> => {
    const result = await tx.query<Record<string, unknown>>(
      `SELECT ${idColumn} FROM ${table} WHERE ${whereSql} LIMIT 1`,
      params
    );
    const value = result.rows[0]?.[idColumnName];
    return typeof value === 'string' ? value : undefined;
  };

  return (await readId(`${activatedColumn} IS TRUE`)) ?? (await readId(`${idColumn} = $1::text`, [MAIN_BRANCH_ID]));
}

/**
 * 读「这一批刚建出来的表，变更触发器该挂到哪条分支上」
 *
 * @param tx - 当前事务的直发门面（建表语句必须已经在这个事务里跑完）
 * @returns 库此刻停在的分支 id；库里还答不出这个问题时是根分支
 * @throws {@link RxdbAdapterPGliteError} 元数据缺列时抛出（见 {@link resolveBranchColumns}）
 *
 * @remarks
 * **必须排在建表语句之后**：`create_tables_statements` 的阶段顺序是「建表 → 触发器 → 初始行」，
 * 新库那条路径上 `rxdb_branch` 和它的根分支行都是本次调用写出来的，跑完之前读只能读到空表。
 *
 * 三种「读不到」都归根分支，而且都不是兜底——它们问的都不是「出错了怎么办」，
 * 而是「库里此刻有没有这个答案」：
 * - 分支表还不存在（旧库升级中、或本次就在建它）：库里还没有「分支」这个概念。
 *   `to_regclass` 探测不可省——直接 SELECT 一张不存在的表是报错，不是空结果集；
 * - 分支表在但是空的（`#ensureSystemTables` 刚把它建出来，初始行还没写）；
 * - 有行但没有 active（零 active 的库）：根分支就是恢复目标，与 {@link readCurrentBranchId}
 *   同口径（见 {@link MAIN_BRANCH_ID}）。
 *
 * 反过来，读得到就**必须**用：PG 侧没有 sqlite 那样的每事务自愈
 * （`RxDBAdapterSqliteBase.#run_transaction` 每开一次默认事务都重挂一遍），
 * 触发器只在建表 / `switch_branch` / 系统迁移三处重建。一张在 `feature` 上补建出来的表若把
 * 触发器钉在根分支，它的变更会一直记在根分支名下直到下一次切分支，而那批已经记错的行不会被追回。
 */
export async function readBranchIdForNewTables(tx: PGliteRowReader): Promise<string> {
  const table = getTableNameByMetadata(getEntityMetadata(RxDBBranch));
  const probe = await tx.query<{ present: boolean }>(`SELECT to_regclass($1::text) IS NOT NULL AS present`, [table]);
  if (probe.rows[0]?.present !== true) return MAIN_BRANCH_ID;
  return (await readActiveBranchId(tx)) ?? MAIN_BRANCH_ID;
}
