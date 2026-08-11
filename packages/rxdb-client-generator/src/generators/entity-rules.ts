/**
 * @fileoverview 实体查询规则生成器
 * 负责生成实体查询规则（RuleGroup）的 TypeScript 类型定义
 *
 * @module rxdb-client-generator/generators/entity-rules
 */

import {
  PropertyType,
  RelationKind,
  type EntityMetadata,
  type EntityPropertyMetadata,
  type EntityRelationManyToOneMetadata,
  type EntityRelationMetadata,
  type EntityRelationOneToOneMetadata
} from '@aiao/rxdb';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { getEntityPropertyTsType, getFlatMapInterfaceName } from '../core/RxDBClientGenerator.utils.js';

export interface RuleTypeData {
  rule: string;
  entity: string;
  key: string;
  valueType?: string;
  subRuleGroup?: string; // 用于 EXISTS 规则的子查询类型
}

interface PatchData {
  key: string;
  entity: string;
}

/**
 * PropertyType 到 RuleName 的映射配置
 */
const PROPERTY_TYPE_TO_RULE_MAP: ReadonlyMap<string, string> = new Map([
  [PropertyType.uuid, 'UUID'],
  [PropertyType.string, 'String'],
  [PropertyType.enum, 'String'],
  [PropertyType.number, 'Number'],
  [PropertyType.integer, 'Number'],
  [PropertyType.bigint, 'BigInt'],
  [PropertyType.binary, 'Binary'],
  [PropertyType.boolean, 'Boolean'],
  [PropertyType.date, 'Date'],
  [PropertyType.stringArray, 'StringArray'],
  [PropertyType.numberArray, 'NumberArray'],
  [PropertyType.keyValue, 'KeyValue']
]);

/**
 * 根据 PropertyType 获取对应的 RuleName
 */
const getPropertyRuleName = (type: PropertyType | string): string | null => {
  return PROPERTY_TYPE_TO_RULE_MAP.get(type) ?? null;
};

/**
 * 构建完整的属性键路径
 */
const buildPropertyKey = (patch: PatchData[], key: string, nestedKey?: string): string => {
  const patchPath = patch.length > 0 ? patch.map(d => d.key).join('.') + '.' : '';
  return nestedKey ? `${patchPath}${key}.${nestedKey}` : `${patchPath}${key}`;
};

/**
 * 获取属性的 valueType
 */
const getPropertyValueType = (
  property: EntityPropertyMetadata,
  metadata: EntityMetadata,
  patch: PatchData[]
): string | undefined => {
  let valueType: string | undefined;

  switch (property.type) {
    case PropertyType.stringArray:
      valueType = 'string';
      break;
    case PropertyType.numberArray:
      valueType = 'number';
      break;
    case PropertyType.keyValue:
      valueType = `Partial<${getFlatMapInterfaceName(property, metadata)}>`;
      break;
    default:
      if (patch.length > 0) {
        valueType = getEntityPropertyTsType(property, metadata);
      }
  }

  return valueType;
};

/**
 * 创建规则数据对象
 */
const createRuleData = (
  ruleName: string,
  entity: string,
  key: string,
  valueType?: string,
  subRuleGroup?: string
): RuleTypeData => ({
  rule: `${ruleName}Rules`,
  entity,
  key,
  valueType,
  subRuleGroup
});

/**
 * 处理嵌套的 keyValue 属性规则
 */
const processNestedKeyValueRules = (
  property: EntityPropertyMetadata,
  metadata: EntityMetadata,
  patch: PatchData[],
  key: string,
  result: RuleTypeData[]
): void => {
  if (property.type !== PropertyType.keyValue) return;

  property.properties.forEach(nestedProp => {
    const nestedRuleName = getPropertyRuleName(nestedProp.type);
    if (!nestedRuleName) return;

    const nestedKey = buildPropertyKey(patch, key, nestedProp.name);
    const nestedValueType = getEntityPropertyTsType(nestedProp, metadata);

    result.push(createRuleData(nestedRuleName, metadata.name, nestedKey, nestedValueType));
  });
};

/**
 * 处理实体属性规则
 * 注意：规则的 valueType 只反映属性本身的类型定义（是否 nullable），
 * 不因上游关系是否可空而附加 "| null"。
 */
const entity_property_rules = (metadata: EntityMetadata, patch: PatchData[] = []): RuleTypeData[] => {
  const result: RuleTypeData[] = [];

  Array.from(metadata.propertyMap.keys()).forEach(key => {
    const property = metadata.propertyMap.get(key)!;
    const ruleName = getPropertyRuleName(property.type);

    if (ruleName) {
      const valueType = getPropertyValueType(property, metadata, patch);
      const finalKey = buildPropertyKey(patch, key);
      result.push(createRuleData(ruleName, metadata.name, finalKey, valueType));
    }

    // 处理 keyValue 属性 (仅支持基本类型: string, number, boolean, Date)
    processNestedKeyValueRules(property, metadata, patch, key, result);
  });

  return result;
};

/**
 * 处理外键规则
 */
const processForeignKeyRules = (
  generator: RxDBClientGenerator,
  metadata: EntityMetadata,
  result: RuleTypeData[],
  patch: PatchData[]
): void => {
  metadata.foreignKeyNames.forEach(key => {
    const relation = metadata.foreignKeyRelationMap.get(key) as
      EntityRelationOneToOneMetadata | EntityRelationManyToOneMetadata;

    if (!relation) return;

    const rel = generator.getMetadata(relation.mappedEntity, relation.mappedNamespace);
    const relIdProperty = rel?.propertyMap.get('id');
    const relIdType = relIdProperty?.type;
    const ruleName = relIdType ? getPropertyRuleName(relIdType) || 'UUID' : 'UUID';
    const valueType =
      patch.length > 0 && relIdProperty && rel ? getEntityPropertyTsType(relIdProperty, rel) : undefined;

    // 规则类型不携带关系可空性的 null，值类型只反映基础 id 类型
    result.push(createRuleData(ruleName, metadata.name, buildPropertyKey(patch, key), valueType));
  });
};

/**
 * 获取关系需要忽略的键
 */
const getRelationIgnoreKeys = (relation: EntityRelationMetadata): string[] => {
  switch (relation.kind) {
    case RelationKind.ONE_TO_MANY:
    case RelationKind.MANY_TO_MANY:
      return [relation.mappedProperty];
    default:
      return [];
  }
};

/**
 * 检查是否应该跳过关系处理
 */
const shouldSkipRelation = (
  patch: PatchData[],
  relationMetadata: EntityMetadata,
  firstMetadata: EntityMetadata,
  currentMetadata: EntityMetadata
): boolean => {
  // 检查是否已经处理过相同实体
  const hasSameEntity = patch.some(d => d.entity === currentMetadata.name);
  if (hasSameEntity) return true;

  // 检查是否回到了第一个实体（避免循环引用）
  if (patch.length > 0 && relationMetadata === firstMetadata) return true;

  return false;
};

/**
 * 处理关系规则（递归）
 */
const processRelationRules = (
  generator: RxDBClientGenerator,
  metadata: EntityMetadata,
  firstMetadata: EntityMetadata,
  ignoreKeys: string[],
  result: RuleTypeData[],
  patch: PatchData[]
): void => {
  Array.from(metadata.relationMap.keys())
    .filter(key => !ignoreKeys.includes(key))
    .forEach(key => {
      const relation = metadata.relationMap.get(key);
      if (!relation) {
        throw new Error('relation is empty');
      }

      const relationMetadata = generator.getMetadata(relation.mappedEntity, relation.mappedNamespace);
      if (!relationMetadata) {
        throw new Error(`generator_entity_rules: metadata "${relation.mappedEntity}" not found`);
      }

      // 检查是否应该跳过
      if (shouldSkipRelation(patch, relationMetadata, firstMetadata, metadata)) {
        return;
      }

      // 如果是顶层关系（patch 为空），生成 EXISTS 规则
      if (patch.length === 0) {
        const relationRuleGroupType = `${relationMetadata.name}RuleGroup`;
        result.push(createRuleData('RelationExists', metadata.name, key, undefined, relationRuleGroupType));
      }

      // 检查递归深度
      if (patch.length >= generator.config.relationQueryDeep) {
        return;
      }

      const needIgnoreKeys = getRelationIgnoreKeys(relation);
      const nextPatch = [...patch, { key, entity: metadata.name }];
      generateEntityRules(generator, relationMetadata, firstMetadata, needIgnoreKeys, result, nextPatch);
    });
};

export const generateEntityRules = (
  generator: RxDBClientGenerator,
  metadata: EntityMetadata,
  firstMetadata?: EntityMetadata,
  ignoreKeys: string[] = [],
  result: RuleTypeData[] = [],
  patch: PatchData[] = []
): RuleTypeData[] => {
  firstMetadata = firstMetadata ?? metadata;

  // 处理实体属性规则
  result.push(...entity_property_rules(metadata, patch));

  // 处理外键规则
  processForeignKeyRules(generator, metadata, result, patch);

  // 处理关系规则（递归）
  processRelationRules(generator, metadata, firstMetadata, ignoreKeys, result, patch);

  return result;
};
