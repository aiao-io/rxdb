import { assertTreeLevel, EntityMetadata, EntityRelationManyToOneMetadata, FindTreeOptions } from '@aiao/rxdb';
import { SetOptional } from 'type-fest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType } from '../sqlite-core.interface.js';
import {
  get_primary_key_column,
  get_table_name_by_metadata,
  quote_sql_identifier,
  ROWID
} from '../sqlite-core.utils.js';
import { build_rule_group_join } from './join_sql.js';
import { buildRuleGroup, GenerateSqlResult } from './query_sql.js';
import { validateEncryptedQuery } from './validate-encrypted-query.js';

interface TreeOptions extends SetOptional<FindTreeOptions, 'entityId'> {
  /**
   * 是否是查询数量
   */
  isCount?: boolean;

  /**
   * 查询子孙节点
   */
  isFindDescendants?: boolean;

  /**
   * 是否查询子节点
   * 计算属性
   */
  hasChildren?: boolean;
}

/**
 * 递归 CTE 递归成员的表别名（`FROM <table> children`）
 */
const TREE_RECURSIVE_ALIAS = 'children';

/**
 * 递归成员里不可被关系别名占用的固定别名
 *
 * @remarks
 * 关系名恰好撞上这些别名时，JOIN 规划会生成同名别名把递归成员表 / 递归表 / hasChildren 子查询遮住。
 */
const TREE_RESERVED_ALIASES = [TREE_RECURSIVE_ALIAS, 'c', '__children', '__sub'] as const;

/**
 * 构建递归成员 where 条件的字段别名映射
 *
 * @remarks
 * 递归 CTE 的递归成员以 `children` 作为表别名，此处不存在主表别名 `_`。
 * 若不映射，裸字段（如 `title`）会被 `build_rule` 生成为 `_."title"`，
 * 在递归成员中触发 “no such column: _” 运行时错误。
 * 因此将每个属性名与外键名映射到 `"children"."<columnName>"`，把裸字段绑定到递归成员表别名。
 *
 * `children.<字段>` 同样映射到递归成员自身列：这是既有的公开约定（指「递归成员自己的那一列」，
 * 而非 children 关系上的字段）。此前它靠「递归成员别名恰好也叫 children」的巧合成立，现在
 * 显式写进映射，JOIN 规划命中后会跳过，不会把它当关系路径去 JOIN 自引用表（SQLC-010）。
 */
const build_tree_field_alias_map = (metadata: EntityMetadata): Map<string, string> => {
  const fieldAliasMap = new Map<string, string>();
  const bind = (name: string, columnName: string): void => {
    const sql = `${quote_sql_identifier(TREE_RECURSIVE_ALIAS)}.${quote_sql_identifier(columnName)}`;
    fieldAliasMap.set(name, sql);
    fieldAliasMap.set(`${TREE_RECURSIVE_ALIAS}.${name}`, sql);
  };

  metadata.propertyMap.forEach(property => bind(property.name, property.columnName));

  const fkNames = metadata.foreignKeyNames ?? [];
  const fkColumnNames = metadata.foreignKeyColumnNames ?? fkNames;
  fkNames.forEach((fkName, index) => bind(fkName, fkColumnNames[index] ?? fkName));

  return fieldAliasMap;
};

/**
 * 生成树查询
 */
export const generate_tree_sql = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  options: TreeOptions
): GenerateSqlResult => {
  const { isCount, isFindDescendants, entityId, where: rule_group } = options;
  validateEncryptedQuery(
    metadata,
    { where: rule_group },
    (name, namespace) => adapter.rxdb.schemaManager.getEntityMetadata(name, namespace ?? metadata.namespace),
    field => (field.startsWith(`${TREE_RECURSIVE_ALIAS}.`) ? field.slice(TREE_RECURSIVE_ALIAS.length + 1) : field)
  );
  const isFindRoot = entityId == null;
  const table_name = get_table_name_by_metadata(metadata);

  // 获取 parent 关系的实际数据库列名
  const parentRelation = metadata.relationMap.get('parent')! as EntityRelationManyToOneMetadata;
  const parentColumnName = parentRelation.columnName;
  // 树是自引用的，递归 CTE 里的每一处主键引用都指向本实体，物理列名可被 columnName 改写（SQLC-014）
  const primaryKeyColumn = quote_sql_identifier(get_primary_key_column(metadata));

  let children_where = '';
  // level 按 FindTreeOptions 契约解析：未设置 → 0（仅当前节点），显式 level=N → c.__level < N。
  // assertTreeLevel 保证插值进来的一定是 0..100 的整数（这里无法参数化：它在递归成员的比较式里）。
  const level_sql = `c.__level < ${assertTreeLevel(options.level)}`;
  const ruleParams: SQLiteCompatibleType[] = [];
  let children_join = '';
  let children_rule_sql = '';
  if (rule_group) {
    // 递归成员 where 里的关系路径（`owner.name`）按本实体重新规划 JOIN，第一跳挂到递归成员
    // 别名 `children` 上；不这么做的话生成的列会落到不存在的表别名，SQLite 直接报 no such column（SQLC-010）
    const { joinSQL, fieldAliasMap } = build_rule_group_join(adapter, metadata, rule_group, undefined, {
      baseAlias: TREE_RECURSIVE_ALIAS,
      reservedAliases: TREE_RESERVED_ALIASES,
      fieldAliasMap: build_tree_field_alias_map(metadata)
    });
    children_join = joinSQL;
    children_rule_sql = buildRuleGroup(rule_group, fieldAliasMap, metadata, adapter, ruleParams);
  }
  const children_where_query = [level_sql, children_rule_sql].filter(Boolean).join(' AND ');
  if (children_where_query) children_where = `WHERE ${children_where_query}`;

  let select = '__children.*';
  if (isCount) {
    if (isFindRoot) {
      select = 'count(*)';
    } else {
      // 非根计数靠「减掉起点自己」得到后代/祖先数。起点不存在时 CTE 返回 0 行，
      // 裸 `count(*)-1` 会把 -1 交给调用方（SQLC-026）。
      // 契约取「节点不存在 ≡ 空集」而非抛错，因此用两参数的标量 max() 把下界钳在 0。
      select = 'max(count(*)-1, 0)';
    }
  } else {
    if (options.hasChildren) {
      select += `, EXISTS(SELECT 1 FROM ${quote_sql_identifier(table_name)} __sub WHERE __sub.${quote_sql_identifier(parentColumnName)} = __children.${primaryKeyColumn}) AS hasChildren`;
    }
  }

  const params: SQLiteCompatibleType[] = [];
  let where: string;
  if (isFindRoot) {
    where = `${quote_sql_identifier(parentColumnName)} is null`;
  } else {
    where = `${primaryKeyColumn} = ?`;
    params.push(entityId!);
  }
  params.push(...ruleParams);
  const sql = `WITH RECURSIVE __children AS (
  SELECT *,rowid as ${ROWID}, 0 AS __level
  FROM ${quote_sql_identifier(table_name)}
  WHERE ${where}
  UNION ALL
  SELECT ${children_join ? 'DISTINCT ' : ''}children.*,children.rowid as ${ROWID}, c.__level + 1 AS __level
  FROM ${quote_sql_identifier(table_name)} children
  JOIN __children c ON ${
    isFindDescendants ?
      `children.${quote_sql_identifier(parentColumnName)} = c.${primaryKeyColumn}`
    : `children.${primaryKeyColumn} = c.${quote_sql_identifier(parentColumnName)}`
  }${children_join}
  ${children_where}
)

SELECT ${select} FROM __children ORDER BY __level, ${primaryKeyColumn};`;
  return { sql, params };
};

/**
 * 查询子孙节点
 */
export const generate_entity_find_descendants_sql = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  options: FindTreeOptions
) =>
  generate_tree_sql(adapter, metadata, {
    ...options,
    isFindDescendants: true,
    hasChildren: metadata.features?.tree?.hasChildren
  });

/**
 * 查询子孙节点数量
 */
export const generate_entity_count_descendants_sql = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  options: FindTreeOptions
) => generate_tree_sql(adapter, metadata, { ...options, isFindDescendants: true, isCount: true });

/**
 * 查询祖先节点
 */
export const generate_entity_find_ancestors_sql = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  options: FindTreeOptions
) =>
  generate_tree_sql(adapter, metadata, {
    ...options,
    isFindDescendants: false,
    hasChildren: metadata.features?.tree?.hasChildren
  });

/**
 * 查询祖先节点数量
 */
export const generate_entity_count_ancestors_sql = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  options: FindTreeOptions
) => generate_tree_sql(adapter, metadata, { ...options, isFindDescendants: false, isCount: true });
