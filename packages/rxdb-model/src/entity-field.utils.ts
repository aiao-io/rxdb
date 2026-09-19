/**
 * RxDB Model 实体字段工具模块
 * 提供实体字段值的解析、格式化、验证等功能
 * @module entity-field.utils
 */
import type { EntityMetadata } from '@aiao/rxdb';
import {
  PropertyType,
  RelationKind,
  type EntityPropertyMetadata,
  type EntityRelationMetadata,
  type KeyValuePropertyMetadata
} from '@aiao/rxdb';

/**
 * 实体字段类型
 * @remarks 兼容 PropertyType 枚举值及其字符串字面量形式，并包含关系字段（oneToOne / manyToOne）与计算字段（computed）的标识
 */
export type EntityFieldType =
  | PropertyType
  | `${PropertyType.boolean}`
  | `${PropertyType.date}`
  | `${PropertyType.enum}`
  | `${PropertyType.integer}`
  | `${PropertyType.number}`
  | `${PropertyType.string}`
  | `${PropertyType.uuid}`
  | `${PropertyType.numberArray}`
  | `${PropertyType.stringArray}`
  | `${PropertyType.keyValue}`
  | `${PropertyType.json}`
  | 'oneToOne'
  | 'manyToOne'
  | 'computed';

/**
 * 键值类型字段中单个键的 Schema 配置
 */
export interface KeyValueSchemaEntry {
  /** 键的显示名称 */
  label?: string;
  /** 值的类型 */
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'date';
  /** 是否必填 */
  required?: boolean;
  /** 是否可为空 */
  nullable?: boolean;
}

/**
 * 实体字段配置
 */
export interface EntityFieldConfig {
  /** 字段名 */
  field: string;
  /** 显示名称 */
  displayName: string;
  /** 字段类型 */
  type: EntityFieldType;
  /** 是否只读 */
  readonly?: boolean;
  /** 是否可为空 */
  nullable?: boolean;
  /** 是否必填 */
  required?: boolean;
  /** 是否唯一 */
  unique?: boolean;
  /** 枚举类型的可选值 */
  enumValues?: readonly string[];
  /** 键值类型字段的 Schema */
  keyValueSchema?: Record<string, KeyValueSchemaEntry>;
  /** 关系字段关联的实体名 */
  relatedEntityName?: string;
  /** 关系字段关联实体的命名空间 */
  relatedNamespace?: string;
}

const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);

/**
 * 将属性元数据转换为字段配置
 */
function propertyToField(key: string, prop: EntityPropertyMetadata): EntityFieldConfig {
  const field: EntityFieldConfig = {
    field: key,
    displayName: prop.displayName ?? key,
    type: prop.type as PropertyType,
    readonly: (prop as Record<string, unknown>)['readonly'] === true,
    nullable: prop.nullable,
    required: prop.required,
    unique: prop.unique
  };
  if (prop.type === PropertyType.enum) {
    field.enumValues = (prop as { enum: readonly string[] }).enum;
  }
  if (prop.type === PropertyType.keyValue) {
    const kvProp = prop as { properties: KeyValuePropertyMetadata[] };
    field.keyValueSchema = Object.fromEntries(
      kvProp.properties.map(p => [
        p.name,
        {
          label: p.displayName,
          type: p.type as KeyValueSchemaEntry['type'],
          required: p.required,
          nullable: p.nullable
        }
      ])
    );
  }
  return field;
}

/**
 * 将关系元数据转换为字段配置
 */
function relationToField(fkField: string, relation: EntityRelationMetadata): EntityFieldConfig {
  return {
    field: fkField,
    displayName: relation.displayName ?? fkField,
    type: relation.kind === RelationKind.ONE_TO_ONE ? 'oneToOne' : 'manyToOne',
    nullable: (relation as Record<string, unknown>)['nullable'] === true,
    relatedEntityName: relation.mappedEntity,
    relatedNamespace: relation.mappedNamespace
  };
}

/**
 * 从实体元数据中提取全部业务字段配置
 * @remarks 跳过系统字段，依次收集普通属性、计算属性与关系字段
 * @param metadata - 实体元数据
 * @returns 字段配置列表
 */
export function extractEntityFields(metadata: EntityMetadata): EntityFieldConfig[] {
  const fields: EntityFieldConfig[] = [];

  metadata.propertyMap.forEach((prop, key) => {
    if (SYSTEM_FIELDS.has(key)) return;
    fields.push(propertyToField(key, prop));
  });

  metadata.computedPropertyMap.forEach((prop, key) => {
    fields.push({
      field: key,
      displayName: prop.displayName ?? key,
      type: 'computed',
      readonly: true
    });
  });

  metadata.foreignKeyRelationMap.forEach((relation, fkField) => {
    fields.push(relationToField(fkField, relation));
  });

  return fields;
}

const SYSTEM_FIELD_CONFIGS: ReadonlyArray<Omit<EntityFieldConfig, 'readonly'>> = [
  { field: 'createdAt', displayName: '创建时间', type: PropertyType.date },
  { field: 'updatedAt', displayName: '更新时间', type: PropertyType.date },
  { field: 'createdBy', displayName: '创建者', type: PropertyType.string },
  { field: 'updatedBy', displayName: '更新者', type: PropertyType.string }
];

/**
 * 从实体元数据中提取系统字段配置
 * @remarks 始终包含只读的 id 字段，并按元数据中实际存在的属性补充时间戳与审计字段
 * @param metadata - 实体元数据
 * @returns 系统字段配置列表
 */
export function extractSystemFields(metadata: EntityMetadata): EntityFieldConfig[] {
  const fields: EntityFieldConfig[] = [{ field: 'id', displayName: 'ID', type: PropertyType.uuid, readonly: true }];
  for (const cfg of SYSTEM_FIELD_CONFIGS) {
    if (metadata.propertyMap.has(cfg.field)) {
      fields.push({ ...cfg, readonly: true });
    }
  }
  return fields;
}
