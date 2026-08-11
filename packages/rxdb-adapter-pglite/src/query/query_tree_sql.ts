import { assertTreeLevel, EntityMetadata, EntityRelationManyToOneMetadata, FindTreeOptions } from '@aiao/rxdb';
import type { SetOptional } from 'type-fest';
import { getTableNameByMetadata, quoteIdentifier } from '../pglite.utils.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import type { FieldAlias } from './json_accessor.js';
import { buildRuleGroupPG, GenerateSqlResult } from './query_sql.js';
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
 * 生成树查询 SQL (使用 PostgreSQL 的递归 CTE)
 */
export const generate_tree_sql = (
  adapter: RxDBAdapterPGlite,
  metadata: EntityMetadata,
  options: TreeOptions
): GenerateSqlResult => {
  const { isCount, isFindDescendants, entityId, where: rule_group } = options;
  validateEncryptedQuery(
    metadata,
    { where: rule_group },
    (name, namespace) => adapter.rxdb.schemaManager.getEntityMetadata(name, namespace ?? metadata.namespace),
    field => (field.startsWith('children.') ? field.slice('children.'.length) : field)
  );
  // `== null` 而非 `!entityId`：整数主键 `0`（以及 `''`）是合法 id，
  // truthy 判断会把它当成「没传 entityId」，整条查询退化成根节点查询。
  // 与 sqlite-core 的 `query_tree_sql.ts` 同口径（PGL-005）
  const isFindRoot = entityId == null;
  const table_name = getTableNameByMetadata(metadata);
  const parentRelation = metadata.relationMap.get('parent') as EntityRelationManyToOneMetadata | undefined;
  const parentColumnName = parentRelation?.columnName ?? 'parentId';

  let children_where = '';
  // level 按 FindTreeOptions 契约解析：未设置 → 0（仅当前节点），显式 level=N → c.level < N。
  // assertTreeLevel 保证插值进来的一定是 0..100 的整数（这里无法参数化：它在递归成员的比较式里）。
  const level_sql = `c.level < ${assertTreeLevel(options.level)}`;
  const children_where_conditions = [level_sql];
  const params: unknown[] = [];

  // 先添加 entityId 参数(如果需要)
  if (!isFindRoot) {
    params.push(entityId);
  }

  if (rule_group) {
    // 在树查询中,'children' 是 SQL 表别名,不是实体关系
    // 需要将 'children.fieldName' 映射为 'children."fieldName"'
    const fieldAliasMap = new Map<string, FieldAlias>();

    const collectFieldAliases = (rule: unknown): void => {
      if (typeof rule !== 'object' || rule === null) return;
      if ('rules' in rule && Array.isArray(rule.rules)) {
        rule.rules.forEach(collectFieldAliases);
        return;
      }
      if (!('field' in rule) || typeof rule.field !== 'string' || !rule.field.startsWith('children.')) return;

      const actualField = rule.field.substring('children.'.length);
      const property = metadata.propertyMap.get(actualField);
      const columnName = property?.columnName ?? actualField;
      fieldAliasMap.set(rule.field, { text: `children.${quoteIdentifier(columnName)}` });
    };

    collectFieldAliases(rule_group);

    const whereClause = buildRuleGroupPG(rule_group, params, fieldAliasMap, metadata);
    if (whereClause) {
      children_where_conditions.push(whereClause);
    }
  }

  const children_where_query = children_where_conditions.filter(Boolean).join(' AND ');
  if (children_where_query) {
    children_where = `WHERE ${children_where_query}`;
  }

  let select = '*';

  if (isCount) {
    if (isFindRoot) {
      select = 'count(*) AS count';
    } else {
      select = '(count(*) - 1) AS count';
    }
  } else if (options.hasChildren) {
    select = `__children.*, EXISTS(SELECT 1 FROM ${table_name} __sub WHERE __sub."${parentColumnName}" = __children.id) AS "hasChildren"`;
  }

  const where = isFindRoot ? `"${parentColumnName}" IS NULL` : `id = $1`;

  // PostgreSQL 使用双引号标识符,并且支持递归 CTE
  // 显式转换 id 为 UUID 类型以避免类型匹配错误
  const sql = `WITH RECURSIVE __children AS (
  SELECT *, 0 AS level
  FROM ${table_name}
  WHERE ${where}
  UNION ALL
  SELECT children.*, c.level + 1 AS level
  FROM ${table_name} children
  JOIN __children c ON ${
    // 不做 ::uuid 强转：连接的是同一张表的 id 与 parentId，类型天然一致。
    // 硬编码 uuid 会让整型主键（或 text 主键）的树实体在 JOIN 处直接报类型错误，100% 失败。
    isFindDescendants ? `children."${parentColumnName}" = c.id` : `children.id = c."${parentColumnName}"`
  }
  ${children_where}
)

SELECT ${select} FROM __children${isCount ? '' : ' ORDER BY level, id'};`;

  return {
    sql,
    params
  };
};

/**
 * 查询子孙节点
 */
export const generate_entity_find_descendants_sql = (
  adapter: RxDBAdapterPGlite,
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
  adapter: RxDBAdapterPGlite,
  metadata: EntityMetadata,
  options: FindTreeOptions
) => generate_tree_sql(adapter, metadata, { ...options, isFindDescendants: true, isCount: true });

/**
 * 查询祖先节点
 */
export const generate_entity_find_ancestors_sql = (
  adapter: RxDBAdapterPGlite,
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
  adapter: RxDBAdapterPGlite,
  metadata: EntityMetadata,
  options: FindTreeOptions
) => generate_tree_sql(adapter, metadata, { ...options, isFindDescendants: false, isCount: true });
