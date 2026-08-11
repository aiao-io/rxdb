/**
 * @fileoverview Repository 生成器工具函数
 * 提供 ID 类型获取等辅助功能
 *
 * @module rxdb-client-generator/generators/utils
 */

import { EntityMetadata, PropertyType } from '@aiao/rxdb';

export type IdType = 'UUID' | 'string' | 'number' | 'bigint';

export const getIdType = (metadata: EntityMetadata): IdType => {
  const idProperty = metadata.propertyMap.get('id');
  if (!idProperty) return 'UUID';

  switch (idProperty.type) {
    case PropertyType.uuid:
      return 'UUID';
    case PropertyType.string:
      return 'string';
    case PropertyType.integer:
      return 'number';
    case PropertyType.bigint:
      return 'bigint';
    default:
      throw new TypeError(`Unsupported id property type: ${String(idProperty.type)}`);
  }
};
