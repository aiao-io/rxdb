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
  type FieldFormat,
  type FieldOptions,
  type KeyValuePropertyMetadata
} from '@aiao/rxdb';

/**
 * 实体字段类型
 * @remarks 兼容 PropertyType 枚举值及其字符串字面量形式，并包含关系字段（oneToOne / manyToOne）与计算字段（computed）的标识
 */
export type EntityFieldType =
  | PropertyType
  | `${PropertyType.bigint}`
  | `${PropertyType.binary}`
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
  /**
   * 字段语义标注（只影响展示与控件选择，不改变运行时值类型）
   * 仅在元数据声明 `format` 时输出该键
   */
  format?: FieldFormat;
  /**
   * 枚举/多选值的展示元数据（label / color / disabled），键是 `enum` 的子集
   * 仅在元数据声明 `options` 时输出该键
   */
  options?: FieldOptions;
  /**
   * 是否为加密列
   * 仅在元数据声明 `encrypted: true` 时输出该键
   */
  encrypted?: boolean;
}

const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);

/** 只在显式声明 `true` 时才把布尔标志读成 true。 */
const readFlag = (source: object, key: string): boolean => (source as Record<string, unknown>)[key] === true;

/**
 * 将属性元数据转换为字段配置
 */
function propertyToField(key: string, prop: EntityPropertyMetadata): EntityFieldConfig {
  const raw = prop as Record<string, unknown>;
  const field: EntityFieldConfig = {
    field: key,
    displayName: prop.displayName ?? key,
    type: prop.type as PropertyType,
    readonly: readFlag(prop, 'readonly'),
    nullable: prop.nullable,
    required: prop.required,
    unique: prop.unique,
    // 只在元数据声明过时才输出这些键，保证既有「全等断言」的字段形状不漂移
    ...(raw['format'] === undefined ? {} : { format: raw['format'] as FieldFormat }),
    ...(raw['options'] === undefined ? {} : { options: raw['options'] as FieldOptions }),
    ...(raw['encrypted'] === undefined ? {} : { encrypted: raw['encrypted'] as boolean })
  };
  if (prop.type === PropertyType.enum || prop.type === PropertyType.stringArray) {
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
