/**
 * @fileoverview PGlite 可写检出位的表集原语（US-314 B1.5）：在调用方的事务里建一套表并播种，或整套删掉。
 *
 * @remarks
 * 与 sqlite-core 的同名模块同一顺序：建表 → 复制 → 对齐自增序列 → 叠增量 → 挂触发器，全在调用方那一笔事务里。
 * - 影子表集落在 `<命名空间>$<后缀>` 这些 schema 里，建表语句自带 `CREATE SCHEMA`。生成器会顺手按根分支挂上变更触发器，
 *   复制之前先摘掉：复制与增量都不是谁的写，不能记进变更日志。
 * - 列以影子表自己的列清单（`information_schema.columns`）为准：主表上可能多出别的插件加的列（如全文检索的 `_fts`），不复制。
 * - 整数主键是 `serial`：显式插入完全不推进影子表的序列，不对齐的话检出位里第一次插入就撞主键。之后两套表各自递增，
 *   跨套可能分出相同的 id（已知限制，B2 处理）。
 * - 删除按目录找这套表的 schema（名字以 `$<后缀>` 结尾），整个 `DROP SCHEMA … CASCADE`：不逐行删，外键动作不触发，
 *   不会有级联删除记进变更日志。
 */

import type { EntityMetadata, EntityType, WorktreeTableSetSeed } from '@aiao/rxdb';
import { getEntityMetadata, parseRxDBChangeKey, WorktreeTableSet } from '@aiao/rxdb';
import { quoteIdentifier, RxdbAdapterPGliteError } from '../pglite.utils.js';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import {
  getSchemaName,
  getTableNameByMetadata,
  getTableSetSchemaSuffix,
  getTableSetSuffixOfSchemaName
} from '../table-name-resolver.js';
import { create_tables_statements } from '../table/create_tables_sql.js';
import remove_all_triggers_sql from '../table/remove_trigger_sql.js';
import type { PGliteTransactionExecutor } from '../transaction/PGliteTransactionExecutor.js';
import { applySwitchActions } from '../version/execute_switch_actions.js';
import { executeSwitchStatements } from '../version/execute_switch_statements.js';
import { convertSwitchResultToSql } from '../version/switch-result.utils.js';
import { generateBranchTriggerSqlFor } from '../version/switch_branch.js';

/**
 * 表集的成员：配置里落在这套表里的实体。
 *
 * @param adapter - 适配器
 * @param tableSet - 影子表集
 * @returns 成员实体类，按配置顺序
 * @throws {@link RxdbAdapterPGliteError} 成员里有不记变更日志的实体时：没有触发器的成员表，写进去的东西进不了历史
 */
const membersOf = (adapter: RxDBAdapterPGlite, tableSet: WorktreeTableSet): EntityType[] => {
  const members = adapter.rxdb.config.entities.filter(EntityType => tableSet.has(getEntityMetadata(EntityType)));
  const unlogged = members.map(EntityType => getEntityMetadata(EntityType)).filter(metadata => metadata.log === false);
  if (unlogged.length > 0) {
    const names = unlogged.map(metadata => `${metadata.namespace}.${metadata.name}`).join(', ');
    throw new RxdbAdapterPGliteError(`表集成员必须记变更日志：${names}`);
  }
  return members;
};

/**
 * 增量的每个键都得落在成员实体上：非成员按解析器落回主表集的 schema，叠上去就改写了主检出位的表。
 *
 * @param adapter - 适配器
 * @param tableSet - 影子表集
 * @param seed - 播种
 * @throws {@link RxdbAdapterPGliteError} 有键落在表集之外时
 */
const assertSeedWithinTableSet = (
  adapter: RxDBAdapterPGlite,
  tableSet: WorktreeTableSet,
  seed: WorktreeTableSetSeed
): void => {
  const { inserts, updates, deletes } = seed.actions;
  for (const key of [...inserts.keys(), ...updates.keys(), ...deletes.keys()]) {
    const [namespace, entity] = parseRxDBChangeKey(key);
    const metadata = adapter.rxdb.schemaManager.getEntityMetadata(entity, namespace);
    if (!metadata || !tableSet.has(metadata)) {
      throw new RxdbAdapterPGliteError(`播种的增量里有表集之外的实体 ${namespace}.${entity}：只许改这套表里的成员`);
    }
  }
};

/**
 * 一张表的列名，按定义顺序。
 *
 * @param executor - 调用方的事务
 * @param metadata - 实体
 * @param tableSet - 表集
 * @returns 列名
 */
const columnsOf = async (
  executor: PGliteTransactionExecutor,
  metadata: EntityMetadata,
  tableSet: WorktreeTableSet
): Promise<string[]> =>
  (
    await executor.queryRaw<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
      [getSchemaName(metadata, tableSet), metadata.tableName]
    )
  ).rows.map(row => row.column_name);

/**
 * 一张表某一列背后的 `serial` 序列。
 *
 * @param executor - 调用方的事务
 * @param metadata - 实体
 * @param set - 哪一套表
 * @param column - 列名
 * @returns 序列名（目录交回的、已按需加好引号）；不是 `serial` 列时为 `null`
 */
const serialSequenceOf = async (
  executor: PGliteTransactionExecutor,
  metadata: EntityMetadata,
  set: WorktreeTableSet,
  column: string
): Promise<string | null> => {
  const [row] = (
    await executor.queryRaw<{ seq: string | null }>(`SELECT pg_get_serial_sequence($1, $2) AS seq`, [
      getTableNameByMetadata(metadata, set),
      column
    ])
  ).rows;
  return row?.seq ?? null;
};

/**
 * 把影子表 `serial` 列的序列对齐到主表那一列的序列。
 *
 * @param executor - 调用方的事务
 * @param metadata - 成员实体
 * @param tableSet - 影子表集
 * @param columns - 影子表的列
 */
const alignSerialSequences = async (
  executor: PGliteTransactionExecutor,
  metadata: EntityMetadata,
  tableSet: WorktreeTableSet,
  columns: readonly string[]
): Promise<void> => {
  for (const column of columns) {
    const shadowSequence = await serialSequenceOf(executor, metadata, tableSet, column);
    if (shadowSequence === null) continue;
    const mainSequence = await serialSequenceOf(executor, metadata, WorktreeTableSet.MAIN, column);
    if (mainSequence === null) continue;
    // 序列名取自目录（`pg_get_serial_sequence` 交回的已按需加好引号），不是外部输入
    const [state] = (
      await executor.queryRaw<{ last_value: string | number; is_called: boolean }>(
        `SELECT last_value, is_called FROM ${mainSequence}`
      )
    ).rows;
    // last_value 是 int8，驱动可能交回 bigint 或字符串：统一按文本传，由 setval 的签名转回 bigint
    await executor.queryRaw(`SELECT setval($1::regclass, $2::bigint, $3::boolean)`, [
      shadowSequence,
      String(state.last_value),
      state.is_called
    ]);
  }
};

/**
 * 叠完增量之后，影子表 `serial` 列的序列要是还会发出表里已有的号，就推到列里的最大值之上。
 *
 * @param executor - 调用方的事务
 * @param metadata - 成员实体
 * @param tableSet - 影子表集
 *
 * @remarks
 * 增量带来的行可能用了比主表序列大的 id：别的检出位在自己的序列上发的号，随那条分支的变更进了增量。
 * 显式插入不推进序列，只对齐到主表的话，序列停在这些行下面，检出位里插到那个号就撞主键（US-314 B2.1）。
 * 只在会撞的时候才推：不会撞就保持与主表对齐，主表删掉的号照样不再发。SQLite 的 `AUTOINCREMENT` 插入时自己往前推，没有这个问题。
 */
const raiseSerialSequencesPastRows = async (
  executor: PGliteTransactionExecutor,
  metadata: EntityMetadata,
  tableSet: WorktreeTableSet
): Promise<void> => {
  const table = getTableNameByMetadata(metadata, tableSet);
  for (const column of await columnsOf(executor, metadata, tableSet)) {
    const sequence = await serialSequenceOf(executor, metadata, tableSet, column);
    if (sequence === null) continue;
    // int8 驱动可能交回 bigint 或字符串：一律转成文本再比、再交给 setval 的签名转回 bigint
    const [state] = (
      await executor.queryRaw<{ next: string; max: string | null }>(
        `SELECT (CASE WHEN is_called THEN last_value + 1 ELSE last_value END)::text AS "next",
                (SELECT MAX(${quoteIdentifier(column)}) FROM ${table})::text AS "max"
           FROM ${sequence}`
      )
    ).rows;
    if (state.max === null || BigInt(state.max) < BigInt(state.next)) continue;
    await executor.queryRaw(`SELECT setval($1::regclass, $2::bigint, true)`, [sequence, state.max]);
  }
};

/**
 * 把主表集一个成员的行原样复制进影子表，`serial` 序列一并对齐。
 *
 * @param executor - 调用方的事务
 * @param metadata - 成员实体
 * @param tableSet - 影子表集
 * @throws {@link RxdbAdapterPGliteError} 影子表的列主表上没有时
 */
const copyMainRows = async (
  executor: PGliteTransactionExecutor,
  metadata: EntityMetadata,
  tableSet: WorktreeTableSet
): Promise<void> => {
  const columns = await columnsOf(executor, metadata, tableSet);
  const mainColumns = new Set(await columnsOf(executor, metadata, WorktreeTableSet.MAIN));
  const missing = columns.filter(column => !mainColumns.has(column));
  const mainTable = getTableNameByMetadata(metadata, WorktreeTableSet.MAIN);
  if (missing.length > 0) {
    throw new RxdbAdapterPGliteError(
      `主表 ${mainTable} 缺列 ${missing.join(', ')}：实体定义与库里的表对不上，播种不了`
    );
  }
  const list = columns.map(quoteIdentifier).join(', ');
  await executor.queryRaw(
    `INSERT INTO ${getTableNameByMetadata(metadata, tableSet)} (${list}) SELECT ${list} FROM ${mainTable}`
  );
  await alignSerialSequences(executor, metadata, tableSet, columns);
};

/**
 * 在调用方的事务里建一套可写检出位的表并播种。
 *
 * @param adapter - 适配器
 * @param executor - 调用方的事务
 * @param tableSet - 要建的表集，不能是主表集
 * @param seed - 持有分支与要叠上的增量
 * @throws {@link RxdbAdapterPGliteError} 给的是主表集、成员里有不记变更日志的实体、增量落在表集之外，或主表缺列时
 */
export const createSeededTableSet = async (
  adapter: RxDBAdapterPGlite,
  executor: PGliteTransactionExecutor,
  tableSet: WorktreeTableSet,
  seed: WorktreeTableSetSeed
): Promise<void> => {
  if (tableSet.isMain) {
    throw new RxdbAdapterPGliteError('createWorktreeTableSet 只建可写检出位的表集，主表集随建库建表');
  }
  const members = membersOf(adapter, tableSet);
  assertSeedWithinTableSet(adapter, tableSet, seed);
  for (const statement of await create_tables_statements(adapter, tableSet, members)) {
    await executor.queryRaw(statement);
  }
  // 必须用 executor 的门面：从适配器本身发出去的查询会重新入队，排在这笔事务后面（同 createTables）
  const sink = executor.adapter;
  await executeSwitchStatements(sink, remove_all_triggers_sql(adapter, tableSet));
  for (const EntityType of members) await copyMainRows(executor, getEntityMetadata(EntityType), tableSet);
  const delta = await convertSwitchResultToSql(adapter, seed.actions, { envelopePassthrough: true, tableSet });
  await applySwitchActions(sink, delta);
  for (const EntityType of members)
    await raiseSerialSequencesPastRows(executor, getEntityMetadata(EntityType), tableSet);
  await executeSwitchStatements(sink, generateBranchTriggerSqlFor(adapter, tableSet, seed.branchId, members));
};

/**
 * 在调用方的事务里删掉一套可写检出位的表：按目录找这套表的 schema，整个删掉。
 *
 * @param executor - 调用方的事务
 * @param tableSet - 要删的表集，不能是主表集
 * @throws {@link RxdbAdapterPGliteError} 给的是主表集时
 *
 * @remarks
 * 按目录找而不是按配置：建到一半就中断的、成员已经从配置里移除的也删得掉，删除因此可重入。
 * 分支表上的持有键不归这里放，关闭检出位的流程在同一笔事务里自己放。
 */
export const dropTableSet = async (executor: PGliteTransactionExecutor, tableSet: WorktreeTableSet): Promise<void> => {
  if (tableSet.isMain) throw new RxdbAdapterPGliteError('dropWorktreeTableSet 不删主表集');
  // 在 JS 里按后缀筛：`LIKE` 会把 `wt_` 的下划线当通配符，`length($1)` 又推不出参数类型；pg_namespace 很小
  const suffix = getTableSetSchemaSuffix(tableSet);
  const schemas = (await executor.queryRaw<{ nspname: string }>(`SELECT nspname FROM pg_namespace`)).rows
    .map(row => row.nspname)
    .filter(schema => schema.endsWith(suffix));
  for (const schema of schemas) {
    await executor.queryRaw(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
  }
};

/**
 * 按目录列出现存的可写检出位表集（US-314 B2.6）：名字末尾是 `$<后缀>` 的 schema 各属于哪一套。
 *
 * @param adapter - 适配器（取配置里的实体，排除它们的命名空间）
 * @param executor - 调用方的事务
 * @returns 表集后缀，排好序、不重复
 *
 * @remarks
 * 孤儿回收要知道哪些表集还在，包括登记行已经没了的。配置里实体的命名空间恰好以 `$wt_…` 结尾时排除：
 * 照它删表集，删的就是主表集的 schema。
 */
export const listTableSetSuffixes = async (
  adapter: RxDBAdapterPGlite,
  executor: PGliteTransactionExecutor
): Promise<string[]> => {
  const namespaces = new Set<string>(
    adapter.rxdb.config.entities.map(EntityType => getEntityMetadata(EntityType).namespace)
  );
  const schemas = (await executor.queryRaw<{ nspname: string }>(`SELECT nspname FROM pg_namespace`)).rows.map(
    row => row.nspname
  );
  const suffixes = new Set<string>();
  for (const schema of schemas) {
    const suffix = namespaces.has(schema) ? undefined : getTableSetSuffixOfSchemaName(schema);
    if (suffix !== undefined) suffixes.add(suffix);
  }
  return [...suffixes].sort();
};
