import {
  EntityMetadata,
  EntityRelationManyToManyMetadata,
  EntityRelationManyToOneMetadata,
  EntityRelationMetadata,
  EntityRelationOneToOneMetadata,
  getEntityMetadata,
  OrderBy,
  PropertyType,
  RelationKind,
  RuleGroup
} from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import {
  get_primary_key_column,
  get_table_name_by_metadata,
  quote_sql_identifier,
  RxDBAdapterSqliteError
} from '../sqlite-core.utils.js';
import {
  format_qualified_identifier,
  format_table_alias,
  get_relation_key,
  MAIN_TABLE_ALIAS,
  RelationPair
} from './sql_alias.utils.js';

interface JoinOptions {
  joinTableName: string;
  on: string;
}

/**
 * JOIN 规划过程中的共享上下文：别名表、关系别名与字段别名映射。
 */
export interface JoinContext {
  /**
   * 查询根表的别名
   *
   * @remarks
   * 主查询是主表别名 `_`，EXISTS 子查询是 `child`，递归 CTE 的递归成员是 `children`。
   * 关系路径的第一跳挂到这个别名上，否则子查询里的 JOIN 会引用外层的表（SQLC-010）。
   */
  baseAlias: string;
  joinMap: Map<EntityMetadata, JoinOptions[]>;
  usedAliases: Set<string>;
  fieldAliasMap: Map<string, string>;
  relationAliasMap: Map<string, string>;
}

export const get_or_create_relation_alias = (context: JoinContext, relationKey: string): string => {
  const existing = context.relationAliasMap.get(relationKey);
  if (existing !== undefined) return existing;
  // 两个分支都还原为 relationKey，保留该参数是为了避免外部调用者意外传入空键
  const alias = _generate_unique_alias(context, relationKey);
  context.relationAliasMap.set(relationKey, alias);
  return alias;
};

export const try_resolve_relation_path = (
  adapter: RxDBAdapterSqliteBase,
  entityMetadata: EntityMetadata,
  parts: string[],
  cut: number
): { metaWalker?: EntityMetadata; relPairs: RelationPair[] } => {
  const relationPart = parts.slice(0, cut);
  let metaWalker: EntityMetadata | undefined = entityMetadata;
  const relPairs: RelationPair[] = [];

  for (const relName of relationPart) {
    if (!metaWalker?.relationMap.has(relName)) {
      return { relPairs: [] };
    }
    const rel = metaWalker.relationMap.get(relName)!;
    relPairs.push({ metadata: metaWalker, relation: rel });
    metaWalker = adapter.rxdb.schemaManager.getEntityMetadata(rel.mappedEntity, rel.mappedNamespace);
  }

  return { metaWalker, relPairs };
};

/**
 * 处理关系上的 keyValue 字段
 *
 * @remarks
 * **已知限制**：当前实现假定点号仅用于嵌套路径分隔。
 * 如果 keyValue 对象内部的键本身包含点号，此方法将无法正确工作。
 * 详见 query_sql.ts 中 `_try_process_top_level_flatmap` 的文档说明。
 */
export const try_process_relation_flatmap = (
  adapter: RxDBAdapterSqliteBase,
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
    const nested = propPart.slice(1).join('.');
    const relProp = metaWalker.propertyMap.get(propName);

    if (relProp && relProp.type === PropertyType.keyValue) {
      const joinTableName = parts.slice(0, cut).join('.');
      process_relation_joins(adapter, context, relPairs, joinTableName);

      const lastRel = relPairs[relPairs.length - 1].relation;
      const lastKey = get_relation_key(relPairs, joinTableName, lastRel);
      const alias = get_or_create_relation_alias(context, lastKey);
      const jsonPath = nested ? `$.${nested.replace(/'/g, "''")}` : '$';
      context.fieldAliasMap.set(
        strValue,
        `json_extract(${format_table_alias(alias)}.${quote_sql_identifier(relProp.columnName)}, '${jsonPath}')`
      );
      return true;
    }
  }

  return false;
};

/**
 * 解析关系的映射目标（含自引用与缺失反向关系的回退）
 *
 * @remarks
 * `findMappedRelation` 未命中有两种情况：目标实体缺少反向关系，或目标实体未注册（自引用）。
 * - ONE_TO_MANY / MANY_TO_MANY：JOIN 依赖反向关系列，回退到本实体上的反向关系（树结构自引用）。
 * - MANY_TO_ONE / ONE_TO_ONE：to-one JOIN 只需目标表 metadata（不依赖反向关系），
 *   因此优先解析真实目标实体（覆盖“目标已注册但无反向关系”），仅当目标不可解析且确为
 *   自引用时才回退到本实体，避免误把本表当作 JOIN 目标表。
 */
const _resolve_mapped_relation = (
  adapter: RxDBAdapterSqliteBase,
  metadata: EntityMetadata,
  relation: EntityRelationMetadata
): { metadata: EntityMetadata; relation: EntityRelationMetadata } | undefined => {
  const mapped = adapter.rxdb.schemaManager.findMappedRelation(metadata, relation);
  if (mapped) return mapped;

  if (relation.kind === RelationKind.ONE_TO_MANY || relation.kind === RelationKind.MANY_TO_MANY) {
    const selfRelation = metadata.relationMap.get(relation.mappedProperty);
    return selfRelation ? { metadata, relation: selfRelation } : undefined;
  }

  const mappedNamespace = relation.mappedNamespace ?? metadata.namespace;
  const targetMetadata = adapter.rxdb.schemaManager.getEntityMetadata(relation.mappedEntity, mappedNamespace);
  if (targetMetadata) return { metadata: targetMetadata, relation };
  if (relation.mappedEntity === metadata.name && mappedNamespace === metadata.namespace) {
    return { metadata, relation };
  }
  return undefined;
};

/**
 * 处理关系字段的 JOIN
 */
export const process_relation_joins = (
  adapter: RxDBAdapterSqliteBase,
  context: JoinContext,
  relations: RelationPair[],
  joinTableName: string
): void => {
  relations.forEach(({ metadata, relation }, index) => {
    const mappedRelation = _resolve_mapped_relation(adapter, metadata, relation);
    if (!mappedRelation) throw new RxDBAdapterSqliteError('mappedRelation not found');

    const relationKey = get_relation_key(relations, joinTableName, relation);
    const uniqueAlias = get_or_create_relation_alias(context, relationKey);

    let prevAlias: string = context.baseAlias;
    if (index > 0) {
      const prevRelation = relations[index - 1];
      const prevRelationKey = get_relation_key(relations, joinTableName, prevRelation.relation);
      prevAlias = get_or_create_relation_alias(context, prevRelationKey);
    }

    switch (relation.kind) {
      case RelationKind.ONE_TO_MANY:
        _handle_one_to_many_join(
          context,
          mappedRelation as { metadata: EntityMetadata; relation: EntityRelationManyToManyMetadata },
          uniqueAlias,
          prevAlias,
          metadata
        );
        break;
      case RelationKind.ONE_TO_ONE:
      case RelationKind.MANY_TO_ONE:
        _handle_to_one_join(
          context,
          mappedRelation as {
            metadata: EntityMetadata;
            relation: EntityRelationManyToOneMetadata | EntityRelationOneToOneMetadata;
          },
          uniqueAlias,
          prevAlias,
          relation
        );
        break;
      case RelationKind.MANY_TO_MANY:
        _handle_many_to_many_join(
          adapter,
          context,
          mappedRelation as { metadata: EntityMetadata; relation: EntityRelationManyToManyMetadata },
          uniqueAlias,
          prevAlias,
          relation,
          relationKey,
          metadata
        );
        break;
    }
  });
}; /**
 * 处理 ONE_TO_MANY 关系的 JOIN
 */
const _handle_one_to_many_join = (
  context: JoinContext,
  mappedRelation: { metadata: EntityMetadata; relation: EntityRelationManyToManyMetadata },
  uniqueAlias: string,
  prevAlias: string,
  sourceMetadata: EntityMetadata
): void => {
  const joinArray = _get_join_array(context, mappedRelation.metadata);
  // prevAlias 指向来源实体的表，主键物理列名可被 columnName 改写（SQLC-014）
  const joinOn = `${format_table_alias(uniqueAlias)}.${quote_sql_identifier(mappedRelation.relation.columnName)} = ${format_table_alias(prevAlias)}.${quote_sql_identifier(get_primary_key_column(sourceMetadata))}`;

  // 检查是否已存在相同的 JOIN
  const existingJoin = joinArray.find(j => j.joinTableName === uniqueAlias && j.on === joinOn);
  if (!existingJoin) {
    joinArray.push({
      joinTableName: uniqueAlias,
      on: joinOn
    });
  }
};

/**
 * 处理 ONE_TO_ONE 和 MANY_TO_ONE 关系的 JOIN
 */
const _handle_to_one_join = (
  context: JoinContext,
  mappedRelation: {
    metadata: EntityMetadata;
    relation: EntityRelationManyToOneMetadata | EntityRelationOneToOneMetadata;
  },
  uniqueAlias: string,
  prevAlias: string,
  relation: EntityRelationManyToOneMetadata | EntityRelationOneToOneMetadata
): void => {
  const joinArray = _get_join_array(context, mappedRelation.metadata);
  // uniqueAlias 指向目标实体的表，主键物理列名可被 columnName 改写（SQLC-014）
  const joinOn = `${format_table_alias(uniqueAlias)}.${quote_sql_identifier(get_primary_key_column(mappedRelation.metadata))} = ${format_table_alias(prevAlias)}.${quote_sql_identifier(relation.columnName)}`;

  // 检查是否已存在相同的 JOIN
  const existingJoin = joinArray.find(j => j.joinTableName === uniqueAlias && j.on === joinOn);
  if (!existingJoin) {
    joinArray.push({
      joinTableName: uniqueAlias,
      on: joinOn
    });
  }
};

/**
 * 处理 MANY_TO_MANY 关系的 JOIN
 */
const _handle_many_to_many_join = (
  adapter: RxDBAdapterSqliteBase,
  context: JoinContext,
  mappedRelation: { metadata: EntityMetadata; relation: EntityRelationManyToManyMetadata },
  uniqueAlias: string,
  prevAlias: string,
  relation: EntityRelationManyToManyMetadata,
  relationKey: string,
  sourceMetadata: EntityMetadata
): void => {
  // 添加中间表
  const junctionEntityMetadata = getEntityMetadata(relation.junctionEntityType);
  const joinJunctionArray = _get_join_array(context, junctionEntityMetadata);
  // 中间表别名按 relationKey 缓存复用（与目标表别名一致），避免同一 MANY_TO_MANY 关系
  // 被多个查询条件引用时反复生成新别名（categories_m_n → categories_m_n_1）导致去重失效、累积重复 JOIN。
  const joinJunctionJoinTableName = get_or_create_relation_alias(context, `${relationKey}_m_n`);
  // prevAlias 指向来源实体的表，主键物理列名可被 columnName 改写（SQLC-014）
  const junctionOn = `${format_table_alias(joinJunctionJoinTableName)}.${quote_sql_identifier(mappedRelation.relation.columnName)} = ${format_table_alias(prevAlias)}.${quote_sql_identifier(get_primary_key_column(sourceMetadata))}`;

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

  const joinArray = _get_join_array(context, mappedRelation.metadata);
  // uniqueAlias 指向目标实体的表，主键物理列名可被 columnName 改写（SQLC-014）
  const mainOn = `${format_table_alias(uniqueAlias)}.${quote_sql_identifier(get_primary_key_column(mappedRelation.metadata))} = ${format_table_alias(joinJunctionJoinTableName)}.${quote_sql_identifier(relation.columnName)}`;

  // 检查主表 JOIN 是否已存在
  const existingMainJoin = joinArray.find(j => j.joinTableName === uniqueAlias && j.on === mainOn);
  if (!existingMainJoin) {
    joinArray.push({
      joinTableName: uniqueAlias,
      on: mainOn
    });
  }
};

/**
 * 获取或创建 JOIN 数组
 */
const _get_join_array = (context: JoinContext, metadata: EntityMetadata): JoinOptions[] => {
  if (!context.joinMap.has(metadata)) {
    context.joinMap.set(metadata, []);
  }
  return context.joinMap.get(metadata)!;
};

/**
 * 生成唯一别名
 */
const _generate_unique_alias = (context: JoinContext, baseAlias: string): string => {
  let alias = baseAlias;
  let counter = 1;
  while (context.usedAliases.has(alias)) {
    alias = `${baseAlias}_${counter}`;
    counter++;
  }
  context.usedAliases.add(alias);
  return alias;
};

/**
 * JOIN 规划选项
 *
 * @remarks
 * 缺省值对应主查询；EXISTS 子查询与递归 CTE 的递归成员通过这三个字段改写规划上下文（SQLC-010）。
 */
export interface RuleGroupJoinOptions {
  /**
   * 查询根表别名，缺省为主表别名 `_`
   */
  baseAlias?: string;

  /**
   * 已被占用、不能被关系别名复用的表别名
   *
   * @remarks
   * 子查询里 `child` / `junction`、递归 CTE 里 `children` / `c` / `__children` 都是固定别名，
   * 一旦关系名与之同名，`_generate_unique_alias` 会生成同名别名把原表遮住。
   */
  reservedAliases?: readonly string[];

  /**
   * 预置字段别名映射
   *
   * @remarks
   * 命中的字段直接使用给定 SQL，跳过关系解析。子查询用它把裸字段与外键名绑定到子查询根表；
   * 树递归成员用它保住 `children.<字段>` ≡「递归成员自身列」这条既有约定。
   */
  fieldAliasMap?: ReadonlyMap<string, string>;
}

/**
 * 处理顶层 keyValue 字段
 *
 * @remarks
 * **已知限制**：当前实现假定点号仅用于嵌套路径分隔。
 * 如果 keyValue 对象内部的键本身包含点号（如 `"version.major"`），
 * 此方法将无法正确工作。
 *
 * 例如：
 * - 数据：`{ "version.major": 1 }`
 * - 查询字段：`keyValue.version.major`
 * - 当前生成：`$.version.major` (错误，查找嵌套对象)
 * - 应该生成：`$."version.major"` (正确，查找带点号的键)
 *
 * 要支持带点号的键，需要更复杂的路径解析逻辑，
 * 可能需要参考 keyValue 属性的 schema 来区分嵌套路径和带点号的键。
 */
const _try_process_top_level_flatmap = (
  context: JoinContext,
  entityMetadata: EntityMetadata,
  strValue: string,
  parts: string[]
): boolean => {
  if (parts.length <= 1) return false;

  const [first, ...rest] = parts;
  const topProp = entityMetadata.propertyMap.get(first);

  if (topProp && topProp.type === PropertyType.keyValue && rest.length > 0) {
    const jsonPath = rest.join('.').replace(/'/g, "''");
    context.fieldAliasMap.set(
      strValue,
      `json_extract(${format_qualified_identifier(context.baseAlias, topProp.columnName)}, '$.${jsonPath}')`
    );
    return true;
  }

  return false;
};

/**
 * 处理带点号的字段（关系字段或 keyValue）
 */
const _process_dotted_field = (
  adapter: RxDBAdapterSqliteBase,
  context: JoinContext,
  entityMetadata: EntityMetadata,
  strValue: string,
  obj: Record<string, unknown>
): void => {
  const parts = strValue.split('.');

  // 尝试解析为关系路径
  try {
    const result = adapter.rxdb.schemaManager.getFieldRelations(entityMetadata, strValue);

    // 如果是外键，直接查询当前表
    if (result.isForeignKey) {
      // result.propertyName 是 JS 名称（例如 'departmentId'），需要解析为列名。
      obj['field'] = result.propertyName;
      return;
    }

    // 生成关系 JOIN
    const joinTableName = strValue.replace(`.${result.propertyName}`, '');
    process_relation_joins(adapter, context, result.relations, joinTableName);

    // 记录字段名到表别名的映射
    const lastRelation = result.relations[result.relations.length - 1];
    const relationKey = get_relation_key(result.relations, joinTableName, lastRelation.relation);
    const uniqueAlias = get_or_create_relation_alias(context, relationKey);
    context.fieldAliasMap.set(strValue, format_qualified_identifier(uniqueAlias, result.property.columnName));
    return;
  } catch {
    // 不是关系路径，尝试处理 keyValue
  }

  // 1) 尝试处理顶层 keyValue
  if (_try_process_top_level_flatmap(context, entityMetadata, strValue, parts)) {
    return;
  }

  // 2) 尝试处理关系上的 keyValue
  try_process_relation_flatmap(adapter, context, entityMetadata, strValue, parts);
};

/**
 * 规划单个 `field` 持有者（规则或排序项）上的点号路径
 */
const _plan_field = (
  adapter: RxDBAdapterSqliteBase,
  context: JoinContext,
  entityMetadata: EntityMetadata,
  holder: Record<string, unknown>
): void => {
  const field = holder['field'];
  if (typeof field !== 'string' || !field.includes('.')) return;
  // 预置映射优先：树递归成员的 `children.<列>` 按约定指向递归成员自身列，不能当关系路径解析
  if (context.fieldAliasMap.has(field)) return;
  _process_dotted_field(adapter, context, entityMetadata, field, holder);
};

/**
 * 按规则树结构规划 JOIN
 *
 * @remarks
 * 这里刻意不用 `traverseObjectKeys` 做无差别深度遍历：EXISTS / NOT EXISTS 的 `where` 属于
 * **子查询根实体**，按外层实体解析会生成挂到错表上的 JOIN，甚至把子查询里的外键路径
 * 就地改写成外层实体的列名（`_process_dotted_field` 是原地修改 `field` 的）。
 * 子查询的 JOIN 由 `build_rule` 在编译 EXISTS 时自行规划（SQLC-010）。
 */
const _plan_rule_group_fields = (
  adapter: RxDBAdapterSqliteBase,
  context: JoinContext,
  entityMetadata: EntityMetadata,
  ruleGroup: RuleGroup
): void => {
  for (const item of ruleGroup?.rules ?? []) {
    if ('combinator' in item) {
      _plan_rule_group_fields(adapter, context, entityMetadata, item);
      continue;
    }
    const rule = item as unknown as Record<string, unknown>;
    if (rule['operator'] === 'exists' || rule['operator'] === 'notExists') continue;
    _plan_field(adapter, context, entityMetadata, rule);
  }
};

/**
 * 计算查询需要的 JOIN 字符串
 *
 * @remarks
 * where 与 orderBy 必须共享同一个 JoinContext（SQLC-025）：两侧引用同一关系时才会复用同一个表别名，
 * 否则同一张表被 LEFT JOIN 两次，行数翻倍。orderBy 传入后由返回的 `orderBy` 字段取回归一化结果 ——
 * `_process_dotted_field` 会就地把外键路径改写成本表列名（`owner.id` → `ownerId`），
 * 这里先浅拷贝再遍历，避免污染调用方传入的 orderBy 数组。
 *
 * @param adapter 适配器
 * @param entityMetadata 要查询的 Entity 的 metadata
 * @param ruleGroup 查询条件
 * @param orderBy 排序条件，其中的点号字段同样参与 JOIN 规划
 * @param options 子查询 / 递归成员场景下的规划上下文改写
 * @returns JOIN SQL、字段别名映射，以及外键归一化后的 orderBy
 */
export const build_rule_group_join = (
  adapter: RxDBAdapterSqliteBase,
  entityMetadata: EntityMetadata,
  ruleGroup: RuleGroup,
  orderBy?: OrderBy[],
  options?: RuleGroupJoinOptions
) => {
  const baseAlias = options?.baseAlias ?? MAIN_TABLE_ALIAS;
  const context: JoinContext = {
    baseAlias,
    joinMap: new Map(),
    usedAliases: new Set([baseAlias, ...(options?.reservedAliases ?? [])]),
    fieldAliasMap: new Map(options?.fieldAliasMap),
    relationAliasMap: new Map()
  };

  const normalizedOrderBy = orderBy?.map(o => ({ ...o }));

  // 遍历规则组与排序条件中的所有字段
  _plan_rule_group_fields(adapter, context, entityMetadata, ruleGroup);
  normalizedOrderBy?.forEach(o =>
    _plan_field(adapter, context, entityMetadata, o as unknown as Record<string, unknown>)
  );

  // 生成查询 JOIN
  const joinParts: string[] = [];
  for (const [metadata, joinOptions] of context.joinMap.entries()) {
    const tableName = get_table_name_by_metadata(metadata);
    for (const joinOption of joinOptions) {
      joinParts.push(
        ` LEFT JOIN ${quote_sql_identifier(tableName)} ${quote_sql_identifier(joinOption.joinTableName)} ON ${joinOption.on}`
      );
    }
  }

  return { joinSQL: joinParts.join(''), fieldAliasMap: context.fieldAliasMap, orderBy: normalizedOrderBy };
};
