import { EntityType } from '../entity/entity.interface.js';
import { EntityMetadata } from '../entity/metadata.interface.js';
import { FindAllOptions } from '../repository/query-options.interface.js';
import { RuleGroup } from '../repository/query.interface.js';
import { QueryTask } from '../repository/QueryTask.js';
import { tryGetEntityMetadata } from '../rxdb-utils.js';
import extractEntityTypeDependencies from './entity_type_dependencies.js';
import { isRule, isRuleGroup } from './query-matching.utils.js';

interface EntityChangeReference {
  entity: string;
  namespace: string;
}

/**
 * 取实体的全部关系（含继承自父类的）
 *
 * `metadata.relations` 只含**本类声明**的关系（与 `properties` / `indexes` 同语义），
 * 跨继承链的合并视图在 `relationMap`。查询依赖判定关心的是「这个实体有哪些关系」，
 * 因此必须用后者 —— 读前者会让「关系声明在父类、查询发自子类」的场景完全失联。
 *
 * 图实体只有 `relationMap` 没有 `relations`，这里一并兼容。
 */
function allRelations(metadata: EntityMetadata): Iterable<EntityMetadata['relations'][number]> {
  return metadata.relationMap?.values() ?? metadata.relations ?? [];
}

/**
 * 判断 `source` 是否存在指向 `target` 实体的关系（含继承）
 */
function hasRelationTo(source: EntityMetadata, target: EntityMetadata): boolean {
  for (const relation of allRelations(source)) {
    if (relation.mappedEntity === target.name && relation.mappedNamespace === target.namespace) return true;
  }
  return false;
}

/**
 * 检查关系实体是否与查询结果集相关
 *
 * 增强版：使用依赖提取器精确识别查询依赖的实体类型
 * 特别支持 EXISTS 操作符的依赖跟踪
 *
 * @param task 查询任务
 * @param relation_entity 关系实体（包含 entity 和 namespace）
 * @returns 如果关系实体与查询相关则返回 true
 */
export function isRelationEntityRelated<T extends EntityType>(
  task: QueryTask<T>,
  relation_entity: { entity: string; namespace: string }
): boolean {
  const { rxdb, entityType } = task;
  const query_metadata = tryGetEntityMetadata(entityType);

  if (!query_metadata) return false;
  const relation_metadata = rxdb.schemaManager.getEntityMetadata(relation_entity.entity, relation_entity.namespace);
  if (!relation_metadata) return false;

  // 如果查询有 where 条件，使用依赖提取器
  const where = (task.options as FindAllOptions<T>)?.where;
  if (where) {
    const dependencies = new Set<EntityType>();
    extractEntityTypeDependencies(rxdb, where, entityType, dependencies);

    // 检查关系实体类型是否在依赖集合中
    for (const depEntityType of dependencies) {
      const dep_metadata = tryGetEntityMetadata(depEntityType);
      if (
        dep_metadata &&
        dep_metadata.name === relation_entity.entity &&
        dep_metadata.namespace === relation_entity.namespace
      ) {
        return true;
      }
    }
  }

  // 🔄 保留原有逻辑：检查关系是否指向查询实体（向后兼容）
  return hasRelationTo(relation_metadata, query_metadata);
}

/**
 * 分离当前实体和关系实体
 *
 * 增强版：支持自引用关系的特殊处理
 * 当查询使用 EXISTS 且存在自引用关系时，同一实体可能同时是：
 * - current_entities：直接匹配查询条件的主实体
 * - relation_entities：作为其他实体的关联实体
 *
 * @param task 查询任务
 * @param changes 变更的实体列表
 * @returns 分离后的当前实体和关系实体
 */
export function separateEntities<T extends EntityType, CT extends EntityChangeReference>(
  task: QueryTask<T>,
  changes: CT[]
): {
  current_entities: CT[];
  relation_entities: CT[];
} {
  const query_metadata = tryGetEntityMetadata(task.entityType);

  if (!query_metadata) {
    return {
      current_entities: changes,
      relation_entities: []
    };
  }
  const current_entities: CT[] = [];
  const relation_entities: CT[] = [];

  // 预计算一次关系匹配所需上下文，避免每个 change 重复解析 where 依赖。
  const { rxdb, entityType } = task;
  const where = (task.options as FindAllOptions<T>)?.where;
  const dependencyKeys = new Set<string>();
  if (where) {
    const deps = new Set<EntityType>();
    extractEntityTypeDependencies(rxdb, where, entityType, deps);
    for (const dep of deps) {
      const meta = tryGetEntityMetadata(dep);
      if (meta) dependencyKeys.add(`${meta.namespace}:${meta.name}`);
    }
  }

  const isEntityRelated = (entity: string, namespace: string): boolean => {
    if (dependencyKeys.size > 0 && dependencyKeys.has(`${namespace}:${entity}`)) {
      return true;
    }
    const relation_metadata = rxdb.schemaManager.getEntityMetadata(entity, namespace);
    if (!relation_metadata) return false;
    return hasRelationTo(relation_metadata, query_metadata);
  };

  for (const e of changes) {
    const isCurrentEntityType = e.entity === query_metadata.name && e.namespace === query_metadata.namespace;
    const isRelatedEntity = isEntityRelated(e.entity, e.namespace);

    if (isCurrentEntityType) {
      current_entities.push(e);
      // 自引用场景：EXISTS 自引用时，同一实体也要进入 relation_entities
      // findByCursor 不需要此逻辑
      if (isRelatedEntity && task.type !== 'findByCursor') {
        relation_entities.push(e);
      }
    } else if (isRelatedEntity) {
      relation_entities.push(e);
    }
  }

  return { current_entities, relation_entities };
}

/**
 * 检测 where 条件是否使用了关系字段
 *
 * @param where where 条件对象
 * @param metadata 实体元数据
 * @returns 如果 where 条件使用了关系字段则返回 true
 */
export function whereUsesRelations<T>(where: RuleGroup<T>, metadata: EntityMetadata): boolean {
  // 用 relationMap（含继承，也兼容只有 relationMap 的图实体）
  const relationNames = new Set<string>();
  for (const relation of allRelations(metadata)) relationNames.add(relation.name);

  const hasRelationField = (rg: unknown): boolean => {
    if (!isRuleGroup(rg)) return false;
    for (const rule of rg.rules) {
      if (isRuleGroup(rule)) {
        if (hasRelationField(rule)) return true;
      } else if (isRule(rule)) {
        const field = rule.field;
        // 点号路径一定从根实体自身属性出发：只有第一段是关系名才说明这条路径
        // 穿过了关系（否则是 keyValue 嵌套字段，如 'settings.theme'，不算关系依赖）。
        const top = field.includes('.') ? field.split('.')[0] : field.split(':')[0];
        if (relationNames.has(top)) return true;
      }
    }
    return false;
  };

  return hasRelationField(where);
}
