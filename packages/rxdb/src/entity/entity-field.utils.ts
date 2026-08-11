/**
 * @packageDocumentation
 * 实体字段工具模块
 * 提供从实体元数据提取字段配置、字段类型转换等功能
 */
import {
  PropertyType,
  RelationKind,
  type EntityPropertyMetadata,
  type EntityRelationMetadata,
  type KeyValuePropertyMetadata
} from './metadata-options.interface.js';
import type { EntityMetadata } from './metadata.interface.js';

export type EntityFieldType = PropertyType | 'oneToOne' | 'manyToOne' | 'computed';

export interface KeyValueSchemaEntry {
  label?: string;
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'date';
  required?: boolean;
  nullable?: boolean;
}

export interface EntityFieldConfig {
  field: string;
  displayName: string;
  type: EntityFieldType;
  readonly?: boolean;
  nullable?: boolean;
  required?: boolean;
  unique?: boolean;
  enumValues?: readonly string[];
  keyValueSchema?: Record<string, KeyValueSchemaEntry>;
  relatedEntityName?: string;
  relatedNamespace?: string;
}

/** 将实体属性名或关系 ID 名转换为数据库列名。 */
export function getEntityColumnName(metadata: EntityMetadata, field: string): string | undefined {
  const property = metadata.propertyMap.get(field);
  if (property) return property.columnName;
  return metadata.foreignKeyRelationMap.get(field)?.columnName;
}

const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);

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

export function extractSystemFields(metadata: EntityMetadata): EntityFieldConfig[] {
  const fields: EntityFieldConfig[] = [{ field: 'id', displayName: 'ID', type: PropertyType.uuid, readonly: true }];

  if (metadata.propertyMap.has('createdAt')) {
    fields.push({ field: 'createdAt', displayName: '创建时间', type: PropertyType.date, readonly: true });
  }
  if (metadata.propertyMap.has('updatedAt')) {
    fields.push({ field: 'updatedAt', displayName: '更新时间', type: PropertyType.date, readonly: true });
  }
  if (metadata.propertyMap.has('createdBy')) {
    fields.push({ field: 'createdBy', displayName: '创建者', type: PropertyType.string, readonly: true });
  }
  if (metadata.propertyMap.has('updatedBy')) {
    fields.push({ field: 'updatedBy', displayName: '更新者', type: PropertyType.string, readonly: true });
  }

  return fields;
}
