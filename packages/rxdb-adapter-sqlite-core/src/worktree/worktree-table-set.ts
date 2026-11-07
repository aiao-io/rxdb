/**
 * @fileoverview SQLite 系可写检出位的表集原语（US-314 B1.5）：在调用方的事务里建一套表并播种，或整套删掉。
 *
 * @remarks
 * 播种按「建表 → 复制 → 对齐自增序列 → 叠增量 → 挂触发器」的顺序在一笔事务里做完：
 * - 成员表照主表集的定义建，先不挂变更触发器：复制与增量都不是谁的写，不能记进变更日志。
 *   不能借 `withTriggersDisabled`，它摘的是本实例挂着的那一套（此刻是主表集）的触发器。
 * - 复制用一条 `INSERT … SELECT`，值原样搬，加密列的信封逐字节不变，不需要密钥环。列以影子表自己的列清单为准，
 *   主表缺列直接报错。
 * - 主键是 `AUTOINCREMENT` 的表把主表的序列值抄过去：显式插入只会把影子表的序列抬到它自己的最大 id。
 *   之后两套表各自递增，跨套可能分出相同的 id（已知限制，B2 处理）。
 * - 增量是「主检出位所在分支 → 持有分支」，键只许落在成员实体上；与切分支同一份 SQL 生成，加密列走信封直通。
 *
 * 删除按目录找这套表（物理名以 `$<后缀>` 结尾），先摘掉它们的全部触发器，再按「引用别人的先删」把行删空，最后逐张 DROP：
 * `foreign_keys` 开着时，DROP 之前 SQLite 先隐式删行并执行外键动作。触发器还挂着的话，多对多中间表的级联删除会被记成
 * 持有分支上的删除；先 DROP 了被引用的表，再删引用它的表时级联撞上已经不在的表，整笔报 `no such table`。
 */

import type { EntityMetadata, WorktreeTableSetSeed } from '@aiao/rxdb';
import { getEntityMetadata, getEntityStorageMetadata, parseRxDBChangeKey, WorktreeTableSet } from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { build_set_sequence_statements, quote_sql_identifier, RxDBAdapterSqliteError } from '../sqlite-core.utils.js';
import {
  get_table_name_by_metadata,
  get_table_set_suffix_by_table_name,
  get_table_set_table_glob
} from '../table-name-resolver.js';
import { create_table_sql } from '../table/create_table_sql.js';
import { generate_table_set_trigger_sql } from '../table/trigger_sql.js';
import type { SqliteTransactionExecutor } from '../transaction/SqliteTransactionExecutor.js';
import { applySwitchActions } from '../version/execute_switch_actions.js';
import { convertSwitchResultToSql } from '../version/switch-result.utils.js';

/**
 * 表集的成员：配置里落在这套表里的实体。
 *
 * @param adapter - 适配器
 * @param tableSet - 影子表集
 * @returns 成员在本实例生效的存储元数据（含实例级存储声明 `entityStorage`），按配置顺序
 * @throws {@link RxDBAdapterSqliteError} 成员里有不记变更日志的实体时：没有触发器的成员表，写进去的东西进不了历史
 *
 * @remarks
 * 与主表建表（`create_tables_sql`）同一份元数据：实例级声明的生成列与高级索引在影子表上也各有一份，
 * 挂上检出位按生成列查才查得到。
 */
const memberMetadataOf = (adapter: RxDBAdapterSqliteBase, tableSet: WorktreeTableSet): EntityMetadata[] => {
  const members = adapter.rxdb.config.entities
    .filter(EntityType => tableSet.has(getEntityMetadata(EntityType)))
    .map(EntityType => getEntityStorageMetadata(adapter.rxdb, EntityType));
  const unlogged = members.filter(metadata => metadata.log === false);
  if (unlogged.length > 0) {
    const names = unlogged.map(metadata => `${metadata.namespace}.${metadata.name}`).join(', ');
    throw new RxDBAdapterSqliteError(`表集成员必须记变更日志：${names}`);
  }
  return members;
};

/**
 * 增量的每个键都得落在成员实体上：非成员按解析器落回主表名，叠上去就改写了主检出位的表。
 *
 * @param adapter - 适配器
 * @param tableSet - 影子表集
 * @param seed - 播种
 * @throws {@link RxDBAdapterSqliteError} 有键落在表集之外时
 */
const assertSeedWithinTableSet = (
  adapter: RxDBAdapterSqliteBase,
  tableSet: WorktreeTableSet,
  seed: WorktreeTableSetSeed
): void => {
  const { inserts, updates, deletes } = seed.actions;
  for (const key of [...inserts.keys(), ...updates.keys(), ...deletes.keys()]) {
    const [namespace, entity] = parseRxDBChangeKey(key);
    const metadata = adapter.rxdb.schemaManager.getEntityMetadata(entity, namespace);
    if (!metadata || !tableSet.has(metadata)) {
      throw new RxDBAdapterSqliteError(`播种的增量里有表集之外的实体 ${namespace}.${entity}：只许改这套表里的成员`);
    }
  }
};

/**
 * 一张表的列名，按定义顺序。
 *
 * @param executor - 调用方的事务
 * @param table - 未加引号的物理表名
 * @returns 列名
 */
const columnsOf = async (executor: SqliteTransactionExecutor, table: string): Promise<string[]> =>
  (await executor.query(`SELECT "name" FROM pragma_table_info(?)`, [table])).rows.map(row => String(row[0]));

/**
 * 把主表集一个成员的行原样复制进影子表，主表的自增序列一并抄过去。
 *
 * @param executor - 调用方的事务
 * @param metadata - 成员实体
 * @param tableSet - 影子表集
 * @throws {@link RxDBAdapterSqliteError} 影子表的列主表上没有时
 */
const copyMainRows = async (
  executor: SqliteTransactionExecutor,
  metadata: EntityMetadata,
  tableSet: WorktreeTableSet
): Promise<void> => {
  const mainTable = get_table_name_by_metadata(metadata, WorktreeTableSet.MAIN);
  const shadowTable = get_table_name_by_metadata(metadata, tableSet);
  const columns = await columnsOf(executor, shadowTable);
  const mainColumns = new Set(await columnsOf(executor, mainTable));
  const missing = columns.filter(column => !mainColumns.has(column));
  if (missing.length > 0) {
    throw new RxDBAdapterSqliteError(
      `主表 ${mainTable} 缺列 ${missing.join(', ')}：实体定义与库里的表对不上，播种不了`
    );
  }
  const list = columns.map(quote_sql_identifier).join(', ');
  await executor.execute(
    `INSERT INTO ${quote_sql_identifier(shadowTable)} (${list}) SELECT ${list} FROM ${quote_sql_identifier(mainTable)}`
  );

  const hasSequence = await executor.query(
    `SELECT 1 FROM sqlite_master WHERE "type" = 'table' AND "name" = 'sqlite_sequence' LIMIT 1`
  );
  if (hasSequence.rows.length === 0) return;
  const [sequence] = (await executor.query(`SELECT "seq" FROM sqlite_sequence WHERE "name" = ?`, [mainTable])).rows;
  if (!sequence) return;
  for (const statement of build_set_sequence_statements(shadowTable, Number(sequence[0]))) {
    await executor.execute(statement.sql, statement.params);
  }
};

/**
 * 在调用方的事务里建一套可写检出位的表并播种。
 *
 * @param adapter - 适配器
 * @param executor - 调用方的事务
 * @param tableSet - 要建的表集，不能是主表集
 * @param seed - 持有分支与要叠上的增量
 * @throws {@link RxDBAdapterSqliteError} 给的是主表集、成员里有不记变更日志的实体、增量落在表集之外，或主表缺列时
 */
export const createSeededTableSet = async (
  adapter: RxDBAdapterSqliteBase,
  executor: SqliteTransactionExecutor,
  tableSet: WorktreeTableSet,
  seed: WorktreeTableSetSeed
): Promise<void> => {
  if (tableSet.isMain) {
    throw new RxDBAdapterSqliteError('createWorktreeTableSet 只建可写检出位的表集，主表集随建库建表');
  }
  const members = memberMetadataOf(adapter, tableSet);
  assertSeedWithinTableSet(adapter, tableSet, seed);
  await executor.execute(members.map(metadata => create_table_sql(adapter, metadata, tableSet)).join('\n'));
  for (const metadata of members) await copyMainRows(executor, metadata, tableSet);
  const delta = await convertSwitchResultToSql(adapter, seed.actions, { envelopePassthrough: true, tableSet });
  await applySwitchActions(executor, delta);
  const triggers = generate_table_set_trigger_sql(adapter, tableSet, seed.branchId);
  if (triggers) await executor.execute(triggers);
};

/**
 * 删行的顺序：引用别人的表排在被引用的表前面，删父表时子表已经空了，级联与 `RESTRICT` 都碰不上。
 *
 * @param executor - 调用方的事务
 * @param tables - 这套表的物理名
 * @returns 同一批表名，子表在前；互相引用成环的按目录顺序
 */
const deleteOrderOf = async (executor: SqliteTransactionExecutor, tables: readonly string[]): Promise<string[]> => {
  const members = new Set(tables);
  const children = new Map<string, Set<string>>();
  for (const table of tables) {
    const { rows } = await executor.query(`SELECT DISTINCT "table" FROM pragma_foreign_key_list(?)`, [table]);
    for (const parent of rows.map(row => String(row[0])).filter(name => name !== table && members.has(name))) {
      children.set(parent, (children.get(parent) ?? new Set()).add(table));
    }
  }
  const order: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const unreferenced = [...remaining].find(
      table => ![...(children.get(table) ?? [])].some(child => remaining.has(child))
    );
    const next = unreferenced ?? [...remaining][0];
    order.push(next);
    remaining.delete(next);
  }
  return order;
};

/**
 * 在调用方的事务里删掉一套可写检出位的表：按目录找，摘触发器、删空、再删表。
 *
 * @param executor - 调用方的事务
 * @param tableSet - 要删的表集，不能是主表集
 * @param excludedTables - 当前配置的主表集对象，删除时必须排除
 * @throws {@link RxDBAdapterSqliteError} 给的是主表集时
 *
 * @remarks
 * 按目录找而不是按配置：建到一半就中断的、成员已经从配置里移除的表也删得掉，删除因此可重入。
 * 分支表上的持有键不归这里放，关闭检出位的流程在同一笔事务里自己放。
 */
export const dropTableSet = async (
  executor: SqliteTransactionExecutor,
  tableSet: WorktreeTableSet,
  excludedTables: ReadonlySet<string>
): Promise<void> => {
  if (tableSet.isMain) throw new RxDBAdapterSqliteError('dropWorktreeTableSet 不删主表集');
  const tables = (
    await executor.query(`SELECT "name" FROM sqlite_master WHERE "type" = 'table' AND "name" GLOB ?`, [
      get_table_set_table_glob(tableSet)
    ])
  ).rows
    .map(row => String(row[0]))
    .filter(name => !excludedTables.has(name));
  if (tables.length === 0) return;
  const triggers = (
    await executor.query(
      `SELECT "name" FROM sqlite_master WHERE "type" = 'trigger' AND "tbl_name" IN (${tables.map(() => '?').join(', ')})`,
      tables
    )
  ).rows.map(row => String(row[0]));
  for (const trigger of triggers) await executor.execute(`DROP TRIGGER IF EXISTS ${quote_sql_identifier(trigger)}`);
  const order = await deleteOrderOf(executor, tables);
  for (const table of order) await executor.execute(`DELETE FROM ${quote_sql_identifier(table)}`);
  for (const table of order) await executor.execute(`DROP TABLE IF EXISTS ${quote_sql_identifier(table)}`);
};

/**
 * 按目录列出现存的可写检出位表集（US-314 B2.6）：表名末尾是 `$<后缀>` 的表各属于哪一套。
 *
 * @param adapter - 适配器（取配置里的实体，排除它们的主表）
 * @param executor - 调用方的事务
 * @returns 表集后缀，排好序、不重复
 *
 * @remarks
 * 孤儿回收要知道哪些表集还在，包括登记行已经没了的。插件建在影子表上的对象（FTS5 虚拟表 `_fts_<物理表名>`）名字同样
 * 以后缀结尾，认成同一套；虚拟表的内部表（`…_data` 这类）不以后缀结尾，不算。配置里实体的主表名恰好以 `$wt_…`
 * 结尾时排除：照它删表集，删的就是主表。
 */
export const listTableSetSuffixes = async (
  adapter: RxDBAdapterSqliteBase,
  executor: SqliteTransactionExecutor
): Promise<string[]> => {
  const mainTables = new Set(
    adapter.rxdb.config.entities.map(EntityType =>
      get_table_name_by_metadata(getEntityMetadata(EntityType), WorktreeTableSet.MAIN)
    )
  );
  const { rows } = await executor.query(`SELECT "name" FROM sqlite_master WHERE "type" = 'table'`);
  const suffixes = new Set<string>();
  for (const name of rows.map(row => String(row[0]))) {
    const suffix = mainTables.has(name) ? undefined : get_table_set_suffix_by_table_name(name);
    if (suffix !== undefined) suffixes.add(suffix);
  }
  return [...suffixes].sort();
};
