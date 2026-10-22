/**
 * @fileoverview 表名解析器（US-314 B1.1）：业务实体的物理表名、索引名与库级约束对象名只从这里出。
 *
 * @remarks
 * 可写检出位在同一个库里各有一套业务表（库内影子表）。物理名今天只来自实体元数据，没有改写口：
 * 漏改一处，就会静默写进别的检出位的表。所以全包只留这一个入口，表集参数必填、不给默认值；
 * `scripts/audit/table-name-resolver.mjs` 守着「本文件之外不推物理名」。
 *
 * - **主表集**（{@link WorktreeTableSet.MAIN}）：`<命名空间>$<表名>`，与引入检出位之前逐字相同，存量库零迁移。
 * - **影子表集**：有副本的实体加后缀 `<命名空间>$<表名>$<后缀>`；没有副本的实体（系统表、QueryCache、
 *   关掉变更日志的实体）照旧落主表集。
 * - **库级约束对象**：SQLite 的条件唯一索引（`uq_`）与区间排他触发器（`ex_`）名字全库唯一，名字只含逻辑表名，
 *   同库两套会撞名。影子表集换掉名字末尾的定义哈希，长度不变、仍在 63 字节内；违约消息里嵌的仍是约束的逻辑名。
 */

import {
  type EntityMetadata,
  type EntityPropertyMetadata,
  type EntityRelationMetadata,
  type EntityType,
  getEntityMetadata,
  hashConstraintDefinition,
  WorktreeTableSet
} from '@aiao/rxdb';

/** 约束名末尾的定义哈希：`_` 加 8 位小写十六进制（`storageConstraintName` 的格式） */
const CONSTRAINT_HASH_LENGTH = 8;

/**
 * 拼主表集的物理名：`<命名空间>$<逻辑名>`。
 *
 * @param name - 逻辑名
 * @param namespace - 命名空间
 * @returns 未加引号的物理名
 *
 * @remarks
 * 只拼字符串、不判表集。业务实体一律走 {@link get_table_name_by_metadata}；
 * 这里给的只是主表集那一套的名字。
 */
export const get_table_name = (name: string, namespace: string) => `${namespace}$${name}`;

/**
 * 把物理名拆回 `[命名空间, 其余部分]`：从第一个 `$` 处切开，没有 `$` 时命名空间为空串。
 *
 * @param tableName - 物理名
 * @returns `[命名空间, 其余部分]`
 */
export const get_table_name_info = (tableName: string): [string, string] => {
  const index = tableName.indexOf('$');
  if (index === -1) {
    return ['', tableName];
  }
  return [tableName.substring(0, index), tableName.substring(index + 1)];
};

/**
 * 物理名的公共拼法：主表集或没有副本时就是 {@link get_table_name}，否则再加 `$<后缀>`。
 *
 * @param metadata - 决定落哪一套表的实体
 * @param logicalName - 逻辑名（表名或附属表名）
 * @param tableSet - 表集
 * @returns 未加引号的物理名
 */
const physical_name = (metadata: EntityMetadata, logicalName: string, tableSet: WorktreeTableSet): string => {
  const base = get_table_name(logicalName, metadata.namespace);
  return tableSet.has(metadata) ? `${base}$${tableSet.suffix}` : base;
};

/**
 * 实体在给定表集里的物理表名。
 *
 * @param metadata - 实体元数据
 * @param tableSet - 表集
 * @returns 未加引号的物理表名
 */
export const get_table_name_by_metadata = (metadata: EntityMetadata, tableSet: WorktreeTableSet): string =>
  physical_name(metadata, metadata.tableName, tableSet);

/**
 * 从物理目录里找出该实体的影子表，供原始 SQL 门禁登记。
 *
 * @param metadata - 实体元数据
 * @param names - 已发现或正在建立的物理表名
 * @returns 后缀符合表集规则的影子表名
 */
export const get_worktree_table_names = (metadata: EntityMetadata, names: Iterable<string>): string[] => {
  const prefix = `${get_table_name_by_metadata(metadata, WorktreeTableSet.MAIN)}$`;
  return [...names].filter(
    name =>
      name.startsWith(prefix) && WorktreeTableSet.suffixOfHolderKey(`*worktree:${name.slice(prefix.length)}*`) !== null
  );
};

/**
 * 实体在给定表集里的物理表名。
 *
 * @param EntityType - 实体类型
 * @param tableSet - 表集
 * @returns 未加引号的物理表名
 */
export const get_table_name_by_entity_type = (EntityType: EntityType, tableSet: WorktreeTableSet): string =>
  get_table_name_by_metadata(getEntityMetadata(EntityType), tableSet);

/**
 * 一套影子表集在 `sqlite_master` 里的表名匹配式（GLOB）：物理名以 `$<后缀>` 结尾的表都属于它，附属表也在内。
 *
 * @param tableSet - 影子表集
 * @returns GLOB 匹配式
 *
 * @remarks
 * 删表集按目录找表（US-314 B1.5），覆盖建到一半的、成员已从配置里移除的表。后缀只含 `[a-z0-9_]`，
 * 在 GLOB 里没有要转义的字符；前面紧跟的 `$` 让一个后缀不会匹配到另一个以它结尾的后缀。
 */
export const get_table_set_table_glob = (tableSet: WorktreeTableSet): string => `*$${tableSet.suffix}`;

/**
 * 属于某个实体的附属表（如图插件的边表）在给定表集里的物理名：跟着所属实体落同一套。
 *
 * @param metadata - 所属实体的元数据
 * @param companionName - 附属表的逻辑名
 * @param tableSet - 表集
 * @returns 未加引号的物理表名
 */
export const get_companion_table_name = (
  metadata: EntityMetadata,
  companionName: string,
  tableSet: WorktreeTableSet
): string => physical_name(metadata, companionName, tableSet);

/**
 * 列（或关系列）索引名：`idx_<物理表名>_<属性名>`，跟着物理表名走，所以各套天然不撞。
 *
 * @param metadata - 实体元数据
 * @param property - 属性或关系元数据
 * @param tableSet - 表集
 * @returns 索引名
 */
export const getTableColumnIndexName = (
  metadata: EntityMetadata,
  property: EntityPropertyMetadata | EntityRelationMetadata,
  tableSet: WorktreeTableSet
): string => `idx_${get_table_name_by_metadata(metadata, tableSet)}_${property.name}`;

/**
 * 库级约束对象（条件唯一索引、区间排他约束）在给定表集里的对象名。
 *
 * @param constraintName - 核心给出的确定性约束名（`storageConstraintName`）
 * @param metadata - 约束所在实体的元数据
 * @param tableSet - 表集
 * @returns 主表集或没有副本时原样；否则换掉末尾的定义哈希
 *
 * @remarks
 * 只换哈希不加后缀：约束名本来就贴着 63 字节上限生成，加后缀会让本来合法的名字超长。
 * 区间排他的触发器名由 `exclusionTriggerNames` 在这个结果上派生。
 */
export const get_storage_object_name = (
  constraintName: string,
  metadata: EntityMetadata,
  tableSet: WorktreeTableSet
): string => {
  if (!tableSet.has(metadata)) return constraintName;
  const stem = constraintName.slice(0, -CONSTRAINT_HASH_LENGTH);
  return `${stem}${hashConstraintDefinition(`${constraintName}\u0000${tableSet.suffix}`)}`;
};
