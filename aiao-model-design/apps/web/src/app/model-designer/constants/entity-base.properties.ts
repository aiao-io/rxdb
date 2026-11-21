import type { EntityPropertyMetadataOptions, EntityRelationMetadataOptions } from '@aiao/rxdb';
import { ENTITY_BASE_METADATA_OPTIONS } from '@aiao/rxdb';
import { TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS } from '@aiao/rxdb-plugin-tree';
import type { ExtendsOption } from './options';

/**
 * 继承属性定义
 * 表示从基类（EntityBase 或 TreeEntityBase）继承的属性信息
 */
export interface InheritedPropertyDef {
  /** 属性名称 */
  readonly name: string;
  /** 属性类型 */
  readonly type: string;
  /** UI 显示名称 */
  readonly displayName: string;
  /** 来源基类 */
  readonly source: ExtendsOption;
  /** 类别：属性、计算属性或关系 */
  readonly category: 'property' | 'computed' | 'relation';
}

/**
 * 从 EntityPropertyMetadataOptions 提取属性信息
 */
function extractPropertyDef(
  prop: EntityPropertyMetadataOptions,
  source: ExtendsOption,
  category: 'property' | 'computed' = 'property'
): InheritedPropertyDef {
  const typeMap: Record<string, string> = {
    uuid: 'uuid',
    string: 'string',
    number: 'number',
    integer: 'integer',
    boolean: 'boolean',
    date: 'date',
    stringArray: 'stringArray',
    numberArray: 'numberArray',
    keyValue: 'keyValue',
    json: 'json'
  };

  return {
    name: prop.name,
    type: typeMap[prop.type] || prop.type,
    displayName: prop.displayName || prop.name,
    source,
    category
  };
}

/**
 * 从关系元数据中提取属性信息（如 parentId）
 */
function extractRelationDef(
  relation: EntityRelationMetadataOptions,
  source: ExtendsOption
): InheritedPropertyDef | null {
  if (!('columnName' in relation) || !relation.columnName) {
    return null;
  }

  return {
    name: relation.columnName,
    type: 'uuid',
    displayName: relation.displayName || relation.name,
    source,
    category: 'property'
  };
}

/**
 * 从关系元数据中提取关系定义
 */
function extractRelationInfo(relation: EntityRelationMetadataOptions, source: ExtendsOption): InheritedPropertyDef {
  const kindMap: Record<string, string> = {
    '1:1': 'OneToOne',
    '1:m': 'OneToMany',
    'm:1': 'ManyToOne',
    'm:n': 'ManyToMany'
  };

  return {
    name: relation.name,
    type: kindMap[relation.kind] || relation.kind,
    displayName: relation.displayName || relation.name,
    source,
    category: 'relation'
  };
}

/**
 * 从元数据选项中提取属性定义数组
 */
function getPropertiesFromMetadata(
  metadata: typeof ENTITY_BASE_METADATA_OPTIONS,
  source: ExtendsOption
): readonly InheritedPropertyDef[] {
  const properties: InheritedPropertyDef[] = [];

  // 从 properties 提取
  if (metadata.properties) {
    properties.push(...metadata.properties.map(prop => extractPropertyDef(prop, source)));
  }

  // 从 computedProperties 提取
  if (metadata.computedProperties) {
    properties.push(...metadata.computedProperties.map(prop => extractPropertyDef(prop, source, 'computed')));
  }

  // 从 relations 提取 parentId 等存储字段
  if (metadata.relations) {
    for (const relation of metadata.relations) {
      const columnProp = extractRelationDef(relation, source);
      if (columnProp) {
        properties.push(columnProp);
      }
      // 同时添加关系本身
      properties.push(extractRelationInfo(relation, source));
    }
  }

  return properties;
}

const ENTITY_BASE_PROPERTIES: readonly InheritedPropertyDef[] = getPropertiesFromMetadata(
  ENTITY_BASE_METADATA_OPTIONS,
  'EntityBase'
);

const TREE_ENTITY_EXTRA_PROPERTIES: readonly InheritedPropertyDef[] = getPropertiesFromMetadata(
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS,
  'TreeEntityBase'
);

/**
 * 获取指定基类的继承属性列表
 * @param extendsBase 基类选项
 * @returns 继承属性数组
 */
export function getInheritedProperties(extendsBase: string): readonly InheritedPropertyDef[] {
  switch (extendsBase) {
    case 'TreeEntityBase':
      return [...ENTITY_BASE_PROPERTIES, ...TREE_ENTITY_EXTRA_PROPERTIES];
    case 'EntityBase':
    default:
      return ENTITY_BASE_PROPERTIES;
  }
}

const ALL_INHERITED_NAMES = new Set([
  ...ENTITY_BASE_PROPERTIES.map(p => p.name),
  ...TREE_ENTITY_EXTRA_PROPERTIES.map(p => p.name)
]);

/**
 * 获取指定基类对应的 Repository 类型
 * @param extendsBase 基类选项
 * @returns Repository 类型字符串
 */
export function getRepositoryType(extendsBase: string): string {
  return extendsBase === 'TreeEntityBase' ? 'TreeRepository' : 'Repository';
}

/**
 * 检查属性名是否为继承属性
 * @param propertyName 属性名称
 * @returns 是否为继承属性
 */
export function isInheritedProperty(propertyName: string): boolean {
  return ALL_INHERITED_NAMES.has(propertyName);
}
