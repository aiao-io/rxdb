import { EntityType } from '../entity/entity.interface.js';
import { PropertyType, RelationKind } from '../entity/metadata-options.interface.js';
import { EntityMetadata } from '../entity/metadata.interface.js';
import { RuleGroup } from '../repository/query.interface.js';
import { tryGetEntityMetadata } from '../rxdb-utils.js';
import { RxDB } from '../RxDB.js';
import { RxDBError } from '../RxDBError.js';

interface DependencyRule {
  field: string;
  operator: string;
  where?: DependencyRuleGroup;
}

interface DependencyRuleGroup {
  combinator: 'and' | 'or';
  rules: Array<DependencyRuleGroup | DependencyRule>;
}

/**
 * 尝试解析关系路径，收集依赖的实体类型
 * @param rxdb RxDB 实例
 * @param entityMetadata 起始实体的元数据
 * @param parts 字段路径分割后的部分
 * @param cut 切分点（关系部分的长度）
 * @param relationEntityTypes 收集依赖实体类型的集合
 * @returns 是否成功解析为关系路径
 */
const try_resolve_relation_path = (
  rxdb: RxDB,
  entityMetadata: EntityMetadata,
  parts: string[],
  cut: number,
  relationEntityTypes: Set<EntityType>
): EntityMetadata | null => {
  let metaWalker: EntityMetadata | undefined = entityMetadata;

  for (let i = 0; i < cut; i++) {
    const rel = metaWalker?.relationMap.get(parts[i]);
    if (!rel) return null;

    const relatedEntityType = rxdb.schemaManager.getEntityType(rel.mappedEntity, rel.mappedNamespace);
    if (relatedEntityType) {
      relationEntityTypes.add(relatedEntityType);
    }

    if (rel.kind === RelationKind.MANY_TO_MANY && rel.junctionEntityType) {
      relationEntityTypes.add(rel.junctionEntityType);
    }

    metaWalker = rxdb.schemaManager.getEntityMetadata(rel.mappedEntity, rel.mappedNamespace);
  }

  return metaWalker ?? null;
};

/**
 * 处理带点号的字段（关系字段或 keyValue），收集依赖的实体类型
 * @param rxdb RxDB 实例
 * @param entityMetadata 当前实体的元数据
 * @param fieldValue 字段值（可能包含点号）
 * @param relationEntityTypes 收集依赖实体类型的集合
 */
const process_dotted_field = (
  rxdb: RxDB,
  entityMetadata: EntityMetadata,
  fieldValue: string,
  relationEntityTypes: Set<EntityType>
): void => {
  const parts = fieldValue.split('.');

  // 尝试解析为关系路径
  try {
    const result = rxdb.schemaManager.getFieldRelations(entityMetadata, fieldValue);

    // 如果是外键，不需要添加额外依赖（已经在主表中）
    if (result.isForeignKey) {
      return;
    }

    // 遍历关系链，收集所有涉及的实体类型
    result.relations.forEach(({ relation }) => {
      const relatedEntityType = rxdb.schemaManager.getEntityType(relation.mappedEntity, relation.mappedNamespace);
      if (relatedEntityType) {
        relationEntityTypes.add(relatedEntityType);
      }

      // 处理 MANY_TO_MANY 关系的中间表
      if (relation.kind === RelationKind.MANY_TO_MANY) {
        const junctionEntityType = relation.junctionEntityType;
        if (junctionEntityType) {
          relationEntityTypes.add(junctionEntityType);
        }
      }
    });

    return;
  } catch (e) {
    // 不是关系路径，尝试处理 keyValue
    if (e instanceof RxDBError === false) {
      console.warn('[entity_type_dependencies] Failed to resolve field relations:', fieldValue, e);
    }
  }

  // 处理顶层 keyValue 字段
  if (parts.length > 1) {
    const [first, ...rest] = parts;
    const topProp = entityMetadata.propertyMap.get(first);

    // 如果是 keyValue 类型，不需要额外依赖
    if (topProp && topProp.type === PropertyType.keyValue && rest.length > 0) {
      return;
    }
  }

  // 处理关系上的 keyValue 字段
  for (let cut = parts.length - 1; cut > 0; cut--) {
    const terminalMeta = try_resolve_relation_path(rxdb, entityMetadata, parts, cut, relationEntityTypes);
    if (!terminalMeta) continue;

    const relProp = terminalMeta.propertyMap.get(parts[cut]);
    if (relProp?.type === PropertyType.keyValue) {
      return;
    }
  }
};

/**
 * 根据查询条件计算实体依赖
 *
 * 此函数会分析查询条件中的所有字段，识别涉及的关系和实体类型：
 * - 直接字段：无额外依赖
 * - 外键字段（如 userId）：无额外依赖
 * - 关系字段（如 user.name）：添加关联实体类型
 * - MANY_TO_MANY 关系：额外添加中间表实体类型
 * - keyValue 字段：无额外依赖
 * - EXISTS/NOT EXISTS 操作符：添加关联实体及其子查询依赖
 *
 * @param rxdb RxDB 实例
 * @param where 查询条件
 * @param EntityType 主查询的实体类型
 * @param relationEntityTypes 用于收集依赖实体类型的集合
 */
const extractEntityTypeDependencies = <T extends object>(
  rxdb: RxDB,
  where: RuleGroup<T>,
  EntityType: EntityType,
  relationEntityTypes: Set<EntityType>
) => {
  // 添加主查询实体类型
  relationEntityTypes.add(EntityType);

  // 这里只在 EXISTS/NOT EXISTS 分支里解引用 relationMap，其余规则根本不看元数据：
  // 依赖提取会被子查询递归喂进任意实体类型，用 fail-fast 的 getEntityMetadata
  // 等于让「某个实体没有元数据」这种可探测状态炸在依赖分析里。
  const metadata = tryGetEntityMetadata(EntityType);

  // 遍历规则组中的所有规则
  const processRules = (ruleGroup: DependencyRuleGroup) => {
    if (!ruleGroup.rules) return;

    for (const rule of ruleGroup.rules) {
      // 处理嵌套的 RuleGroup
      if ('combinator' in rule) {
        processRules(rule);
        continue;
      }

      const { field, operator } = rule;

      // 处理 EXISTS/NOT EXISTS 操作符
      if (operator === 'exists' || operator === 'notExists') {
        // EXISTS 操作符的 field 是关系字段名
        const relation = metadata?.relationMap.get(field);
        if (relation) {
          // 添加关联实体类型
          const relatedEntityType = rxdb.schemaManager.getEntityType(relation.mappedEntity, relation.mappedNamespace);
          if (relatedEntityType) {
            relationEntityTypes.add(relatedEntityType);
          }

          // 处理 MANY_TO_MANY 关系的中间表
          if (relation.kind === RelationKind.MANY_TO_MANY) {
            const junctionEntityType = relation.junctionEntityType;
            if (junctionEntityType) {
              relationEntityTypes.add(junctionEntityType);
            }
          }

          // 处理子查询的 where 条件
          if (rule.where) {
            const relationMetadata = rxdb.schemaManager.getEntityMetadata(
              relation.mappedEntity,
              relation.mappedNamespace
            );
            if (relationMetadata) {
              // 递归处理子查询的依赖
              const subRelationEntityTypes = new Set<EntityType>();
              const relatedEntityType = rxdb.schemaManager.getEntityType(
                relation.mappedEntity,
                relation.mappedNamespace
              );
              if (relatedEntityType) {
                // 使用递归调用处理子查询依赖
                extractEntityTypeDependencies(
                  rxdb,
                  rule.where as unknown as RuleGroup<Record<string, unknown>>,
                  relatedEntityType,
                  subRelationEntityTypes
                );
                // 合并子查询的依赖
                subRelationEntityTypes.forEach(et => relationEntityTypes.add(et));
              }
            }
          }
        }
        continue;
      }

      // 处理带点号的字段（关系字段）；元数据缺失时按下面那条「无法解析就忽略」的既有契约走
      if (metadata && field && field.includes('.')) {
        try {
          process_dotted_field(rxdb, metadata, field, relationEntityTypes);
        } catch (e) {
          // 契约（有意降级，被 spec 锁定）：无法解析的点号字段**忽略后继续**，不抛。
          //
          // 代价：该字段引用的关联实体类型不会进入依赖集，`QueryTask` 也就不会为它
          // 累加 `depEntityTypeMap` → 关联实体变更**可能不触发本查询刷新**（stale result）。
          // 安全网：`query-relation.utils.ts` 的反向 relation 检查能救回部分自引用/反向边，
          // 但覆盖不到纯正向路径。
          //
          // `RxDBError` 表示「这本来就不是关系路径」，属正常流程，静默不 warn。
          if (e instanceof RxDBError === false) {
            console.warn('[entity_type_dependencies] Failed to resolve dotted field:', field, e);
          }
        }
      }
    }
  };

  processRules(where as unknown as DependencyRuleGroup);
};

export default extractEntityTypeDependencies;
