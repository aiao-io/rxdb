/**
 * @fileoverview 实体元数据工具函数
 * 提供内置基础实体的元数据选项获取
 *
 * @module rxdb-client-generator/core/metadata-utils
 */

import { ENTITY_BASE_METADATA_OPTIONS, EntityMetadataOptions } from '@aiao/rxdb';

export function getEntityMetadataOptions(className: string): EntityMetadataOptions[] | undefined {
  switch (className) {
    case 'EntityBase':
      return [ENTITY_BASE_METADATA_OPTIONS];
    default:
      return undefined;
  }
}
