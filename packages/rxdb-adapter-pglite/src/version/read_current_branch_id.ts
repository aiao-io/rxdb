import { getEntityMetadata, RxDBBranch, type EntityMetadata } from '@aiao/rxdb';
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

  const branchId = (await readId(`${activatedColumn} IS TRUE`)) ?? (await readId(`${idColumn} = $1::text`, ['main']));
  if (branchId === undefined) {
    throw new RxdbAdapterPGliteError('currentBranch is undefined! Cannot rebuild triggers after disableTriggers.');
  }
  return branchId;
}
