import {
  type EntityMetadata,
  type EntityRelationManyToManyMetadata,
  type EntityRelationManyToOneMetadata,
  type EntityRelationMetadata,
  type EntityRelationOneToOneMetadata,
  getEntityMetadata,
  PropertyType,
  RelationKind
} from '@aiao/rxdb';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { getTableNameByMetadata, quoteIdentifier, RxdbAdapterPGliteError } from '../pglite.utils.js';
import { type FieldAlias, jsonAccessor } from './json_accessor.js';

export const MAIN_TABLE_ALIAS = '_' as const;

export interface JoinOptions {
  joinTableName: string;
  on: string;
}

export interface RelationPair {
  metadata: EntityMetadata;
  relation: EntityRelationMetadata;
}

export interface JoinContext {
  joinMap: Map<EntityMetadata, JoinOptions[]>;
  usedAliases: Set<string>;
  fieldAliasMap: Map<string, FieldAlias>;
  relationAliasMap: Map<string, string>;
}

const SAFE_JSON_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const visit_query_fields = (value: unknown, visit: (field: string) => void): void => {
  if (Array.isArray(value)) {
    value.forEach(item => visit_query_fields(item, visit));
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.field === 'string') visit(value.field);
  if (Array.isArray(value.rules)) visit_query_fields(value.rules, visit);
};

const assert_safe_json_path = (parts: string[]): void => {
  if (parts.some(part => !SAFE_JSON_PATH_SEGMENT.test(part))) {
    throw new RxdbAdapterPGliteError(`Invalid JSON path: ${parts.join('.')}`);
  }
};

/**
 * JSON 嵌套路径的字段表达式，同时给出 text 与 jsonb 两种形态。
 *
 * 取值逻辑与主查询路径共用 {@link jsonAccessor} —— 两边各写一份正是
 * 数值比较按字典序这个缺陷的来源（PGL-006）。
 */
const format_json_field = (columnSql: string, path: string[]): FieldAlias => {
  if (path.length === 0) return { text: columnSql };
  assert_safe_json_path(path);
  return {
    text: jsonAccessor(columnSql, path, 'text'),
    jsonb: jsonAccessor(columnSql, path, 'jsonb')
  };
};

/**
 * 将别名清理为 SQL 安全的标识符（去掉点号），同时保持可读性
 */
const sanitize_alias = (alias: string): string => alias.replaceAll('.', '_');

/**
 * 获取或创建稳定的关系别名
 */
export const get_or_create_relation_alias = (context: JoinContext, relationKey: string): string => {
  if (context.relationAliasMap.has(relationKey)) return context.relationAliasMap.get(relationKey)!;
  const base = relationKey.includes('_') ? relationKey : relationKey.split('_')[0];
  const alias = generate_unique_alias(context, sanitize_alias(base));
  context.relationAliasMap.set(relationKey, alias);
  return alias;
};

/**
 * 尝试将关系路径解析为一系列关系配对（RelationPair）
 */
export const try_resolve_relation_path = (
  adapter: RxDBAdapterPGlite,
  entityMetadata: EntityMetadata,
  parts: string[],
  cut: number
): { metaWalker?: EntityMetadata; relPairs: RelationPair[] } => {
  const relationPart = parts.slice(0, cut);
  let metaWalker: EntityMetadata | undefined = entityMetadata;
  const relPairs: RelationPair[] = [];

  for (const relName of relationPart) {
    if (!metaWalker?.relationMap.has(relName)) return { relPairs: [] };
    const rel = metaWalker.relationMap.get(relName)!;
    relPairs.push({ metadata: metaWalker, relation: rel });
    metaWalker = adapter.rxdb.schemaManager.getEntityMetadata(rel.mappedEntity, rel.mappedNamespace);
  }

  return { metaWalker, relPairs };
};

/**
 * 尝试在关系链上处理 JSON keyValue 字段（例如 orders.meta.xxx）
 *
 * @remarks
 * **已知限制**：当前实现假定点号仅用于表示嵌套路径。
 * 如果 keyValue 对象内部的键本身包含点（如 "version.major"），此方法将无法正确处理。
 * 详见 SQLite 适配器中 `_try_process_top_level_flatmap` 的文档说明。
 */
export const try_process_relation_flatmap = (
  adapter: RxDBAdapterPGlite,
  context: JoinContext,
  entityMetadata: EntityMetadata,
  strValue: string,
  parts: string[]
): boolean => {
  for (let cut = parts.length - 1; cut > 0; cut--) {
    const propPart = parts.slice(cut);
    if (propPart.length === 0) continue;

    const { metaWalker, relPairs } = try_resolve_relation_path(adapter, entityMetadata, parts, cut);
    if (!metaWalker || relPairs.length === 0) continue;

    const propName = propPart[0];
    const nestedPath = propPart.slice(1);
    const relProp = metaWalker.propertyMap.get(propName);

    if (relProp && (relProp.type === PropertyType.keyValue || relProp.type === PropertyType.json)) {
      const joinTableName = parts.slice(0, cut).join('.');
      process_relation_joins(adapter, context, relPairs, joinTableName);

      const lastRel = relPairs[relPairs.length - 1].relation;
      const lastKey = get_relation_key(relPairs, joinTableName, lastRel);
      const alias = get_or_create_relation_alias(context, lastKey);
      const columnSql = `${quoteIdentifier(alias)}.${quoteIdentifier(relProp.columnName)}`;
      context.fieldAliasMap.set(strValue, format_json_field(columnSql, nestedPath));
      return true;
    }
  }

  return false;
};

/**
 * 处理一条关系链上的所有 JOIN
 */
export const process_relation_joins = (
  adapter: RxDBAdapterPGlite,
  context: JoinContext,
  relations: RelationPair[],
  joinTableName: string
): void => {
  relations.forEach(({ metadata, relation }, index) => {
    let mappedRelation = adapter.rxdb.schemaManager.findMappedRelation(metadata, relation);

    // 处理自引用关系（树结构）
    if (!mappedRelation) {
      // 自引用关系：mapped entity 应该是当前 entity 本身
      if (relation.kind === RelationKind.ONE_TO_MANY || relation.kind === RelationKind.MANY_TO_MANY) {
        const selfRelation = metadata.relationMap.get(relation.mappedProperty);
        if (selfRelation) {
          mappedRelation = { metadata, relation: selfRelation };
        }
      }
      // 对于 MANY_TO_ONE 和 ONE_TO_ONE，自引用时 metadata 和反向关系都是同一个
      else if (relation.kind === RelationKind.MANY_TO_ONE || relation.kind === RelationKind.ONE_TO_ONE) {
        // 自引用的反向查询：使用主实体的相同 metadata
        mappedRelation = { metadata, relation };
      }
    }

    if (!mappedRelation) throw new RxdbAdapterPGliteError('mappedRelation not found');

    const relationKey = get_relation_key(relations, joinTableName, relation);
    const uniqueAlias = get_or_create_relation_alias(context, relationKey);

    let prevAlias: string = MAIN_TABLE_ALIAS;
    if (index > 0) {
      const prevRelation = relations[index - 1];
      const prevRelationKey = get_relation_key(relations, joinTableName, prevRelation.relation);
      prevAlias = get_or_create_relation_alias(context, prevRelationKey);
    }

    switch (relation.kind) {
      case RelationKind.ONE_TO_MANY:
        handle_one_to_many_join(
          context,
          mappedRelation as { metadata: EntityMetadata; relation: EntityRelationManyToManyMetadata },
          uniqueAlias,
          prevAlias
        );
        break;
      case RelationKind.ONE_TO_ONE:
      case RelationKind.MANY_TO_ONE:
        handle_to_one_join(
          context,
          mappedRelation as {
            metadata: EntityMetadata;
            relation: EntityRelationManyToOneMetadata | EntityRelationOneToOneMetadata;
          },
          uniqueAlias,
          prevAlias,
          relation as EntityRelationManyToOneMetadata | EntityRelationOneToOneMetadata
        );
        break;
      case RelationKind.MANY_TO_MANY:
        handle_many_to_many_join(
          context,
          mappedRelation as { metadata: EntityMetadata; relation: EntityRelationManyToManyMetadata },
          uniqueAlias,
          prevAlias,
          relation
        );
        break;
    }
  });
};

const handle_one_to_many_join = (
  context: JoinContext,
  mappedRelation: { metadata: EntityMetadata; relation: EntityRelationManyToManyMetadata },
  uniqueAlias: string,
  prevAlias: string
): void => {
  const joinArray = get_join_array(context, mappedRelation.metadata);
  // ONE_TO_MANY: 子表通过 mappedProperty + 'Id' 指向父表 id
  // 例如 Branch.changes -> Change.branchId = Branch.id
  // 使用反向的 mappedProperty 名称作为外键前缀
  const fkColumnName = mappedRelation.relation.columnName;
  const joinOn = `"${uniqueAlias}"."${fkColumnName}" = ${format_table_alias(prevAlias)}."id"`;

  // 检查是否已存在相同的 JOIN
  const existingJoin = joinArray.find(j => j.joinTableName === uniqueAlias && j.on === joinOn);
  if (!existingJoin) {
    joinArray.push({
      joinTableName: uniqueAlias,
      on: joinOn
    });
  }
};

const handle_to_one_join = (
  context: JoinContext,
  mappedRelation: {
    metadata: EntityMetadata;
    relation: EntityRelationManyToOneMetadata | EntityRelationOneToOneMetadata;
  },
  uniqueAlias: string,
  prevAlias: string,
  relation: EntityRelationManyToOneMetadata | EntityRelationOneToOneMetadata
): void => {
  const joinArray = get_join_array(context, mappedRelation.metadata);
  const joinOn = `"${uniqueAlias}"."id" = ${format_table_alias(prevAlias)}."${relation.columnName}"`;

  // 检查是否已存在相同的 JOIN
  const existingJoin = joinArray.find(j => j.joinTableName === uniqueAlias && j.on === joinOn);
  if (!existingJoin) {
    joinArray.push({
      joinTableName: uniqueAlias,
      on: joinOn
    });
  }
};

const handle_many_to_many_join = (
  context: JoinContext,
  mappedRelation: { metadata: EntityMetadata; relation: EntityRelationManyToManyMetadata },
  uniqueAlias: string,
  prevAlias: string,
  relation: EntityRelationManyToManyMetadata
): void => {
  // 连接（中间）表 / 关联表（junction table）
  const junctionEntityMetadata = getEntityMetadata(relation.junctionEntityType);
  const joinJunctionArray = get_join_array(context, junctionEntityMetadata);
  const joinJunctionJoinTableName = generate_unique_alias(context, sanitize_alias(`${relation.name}_m_n`));
  const junctionOn = `"${joinJunctionJoinTableName}"."${mappedRelation.relation.columnName}" = ${format_table_alias(prevAlias)}."id"`;

  // 检查中间表 JOIN 是否已存在
  const existingJunctionJoin = joinJunctionArray.find(
    j => j.joinTableName === joinJunctionJoinTableName && j.on === junctionOn
  );
  if (!existingJunctionJoin) {
    joinJunctionArray.push({
      joinTableName: joinJunctionJoinTableName,
      on: junctionOn
    });
  }

  const joinArray = get_join_array(context, mappedRelation.metadata);
  const mainOn = `"${uniqueAlias}"."id" = "${joinJunctionJoinTableName}"."${relation.columnName}"`;

  // 检查主表 JOIN 是否已存在
  const existingMainJoin = joinArray.find(j => j.joinTableName === uniqueAlias && j.on === mainOn);
  if (!existingMainJoin) {
    joinArray.push({
      joinTableName: uniqueAlias,
      on: mainOn
    });
  }
};

const get_join_array = (context: JoinContext, metadata: EntityMetadata): JoinOptions[] => {
  if (!context.joinMap.has(metadata)) context.joinMap.set(metadata, []);
  return context.joinMap.get(metadata)!;
};

const generate_unique_alias = (context: JoinContext, baseAlias: string): string => {
  let alias = baseAlias;
  let counter = 1;
  while (context.usedAliases.has(alias)) {
    alias = `${baseAlias}_${counter++}`;
  }
  context.usedAliases.add(alias);
  return alias;
};

export const get_relation_key = (
  relations: RelationPair[],
  joinTableName: string,
  relation: EntityRelationMetadata
): string => (relations.length === 1 ? relation.name : `${joinTableName}_${relation.name}`);

export const format_table_alias = (alias: string): string => (alias === MAIN_TABLE_ALIAS ? alias : `"${alias}"`);

/**
 * 根据规则组构建 JOIN SQL 以及字段别名映射表
 */
export const build_rule_group_join_pg = (
  adapter: RxDBAdapterPGlite,
  entityMetadata: EntityMetadata,
  ruleGroup: unknown
): { joinSQL: string; fieldAliasMap: Map<string, FieldAlias> } => {
  const context: JoinContext = {
    joinMap: new Map(),
    usedAliases: new Set(),
    fieldAliasMap: new Map(),
    relationAliasMap: new Map()
  };

  visit_query_fields(ruleGroup, field => {
    if (!field.includes('.')) return;
    process_dotted_field(adapter, context, entityMetadata, field);
  });

  const joinParts: string[] = [];
  for (const [meta, joinOptions] of context.joinMap.entries()) {
    const tableName = getTableNameByMetadata(meta);
    for (const j of joinOptions) {
      joinParts.push(` LEFT JOIN ${tableName} ${quoteIdentifier(j.joinTableName)} ON ${j.on}`);
    }
  }

  return { joinSQL: joinParts.join(''), fieldAliasMap: context.fieldAliasMap };
};

/**
 * 处理带点的字段：可能是关系路径，也可能是 keyValue 展开
 */
const process_dotted_field = (
  adapter: RxDBAdapterPGlite,
  context: JoinContext,
  entityMetadata: EntityMetadata,
  strValue: string
): void => {
  const parts = strValue.split('.');

  // 尝试作为关系路径解析
  try {
    const result = adapter.rxdb.schemaManager.getFieldRelations(entityMetadata, strValue);
    if (result.isForeignKey) {
      const index = entityMetadata.foreignKeyNames.indexOf(result.propertyName);
      const columnName = entityMetadata.foreignKeyColumnNames[index] ?? result.propertyName;
      context.fieldAliasMap.set(strValue, { text: `${MAIN_TABLE_ALIAS}.${quoteIdentifier(columnName)}` });
      return;
    }

    const joinTableName = strValue.replace(`.${result.propertyName}`, '');
    process_relation_joins(adapter, context, result.relations, joinTableName);

    const lastRelation = result.relations[result.relations.length - 1];
    const relationKey = get_relation_key(result.relations, joinTableName, lastRelation.relation);
    const uniqueAlias = get_or_create_relation_alias(context, relationKey);
    context.fieldAliasMap.set(strValue, {
      text: `${quoteIdentifier(uniqueAlias)}.${quoteIdentifier(result.property.columnName)}`
    });
    return;
  } catch {
    // 非关系路径，尝试按 keyValue 处理
  }

  // 尝试主表顶层 keyValue 属性
  // **已知限制**：当前实现假定点号仅用于嵌套路径分隔。
  // 若 keyValue 内部键名自身包含点（如 "version.major"），此方法无法正确处理。
  // 参见 SQLite 适配器 `_try_process_top_level_flatmap` 的文档。
  const [first, ...rest] = parts;
  const topProp = entityMetadata.propertyMap.get(first);
  if (topProp && (topProp.type === PropertyType.keyValue || topProp.type === PropertyType.json) && rest.length > 0) {
    const columnSql = `${MAIN_TABLE_ALIAS}.${quoteIdentifier(topProp.columnName)}`;
    context.fieldAliasMap.set(strValue, format_json_field(columnSql, rest));
    return;
  }

  // 尝试关系链上的 keyValue 展开
  try_process_relation_flatmap(adapter, context, entityMetadata, strValue, parts);
};
