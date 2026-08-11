/**
 * @fileoverview Supabase 数据转换工具
 */

import type { EntityMetadata, EntityPropertyMetadata, EntityType, KeyValuePropertyMetadata } from '@aiao/rxdb';
import { PropertyType } from '@aiao/rxdb';

/**
 * 将 Supabase 返回的值转换为 JS 类型
 * Supabase 的 timestamptz 返回字符串，需要转换为 Date
 */
function transform_value(value: unknown, property: EntityPropertyMetadata | KeyValuePropertyMetadata): unknown {
  if (value === null || value === undefined) return value;

  switch (property.type) {
    case PropertyType.date:
      return value instanceof Date ? value : new Date(value as string | number);

    case PropertyType.keyValue:
      if (typeof value === 'object' && property.properties) {
        const obj = value as Record<string, unknown>;
        const transformed: Record<string, unknown> = {};
        for (const nested of property.properties) {
          if (obj[nested.name] !== undefined) {
            transformed[nested.name] = transform_value(obj[nested.name], nested);
          }
        }
        return transformed;
      }
      return value;

    case PropertyType.boolean:
      return Boolean(value);

    case PropertyType.json:
    case PropertyType.stringArray:
    case PropertyType.numberArray:
    default:
      return value;
  }
}

/**
 * 将 Supabase 行数据转换为实体实例
 */
export function transform_row_to_entity<T extends EntityType>(
  EntityType: T,
  metadata: EntityMetadata,
  row: Record<string, unknown>
): InstanceType<T> {
  const entity = new EntityType() as InstanceType<T>;

  for (const key of Object.keys(row)) {
    const property = metadata.propertyMap.get(key);
    Object.defineProperty(entity, key, {
      value: property ? transform_value(row[key], property) : row[key],
      writable: true,
      enumerable: true,
      configurable: true
    });
  }

  return entity;
}
