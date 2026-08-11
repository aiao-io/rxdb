/**
 * @fileoverview 实体元数据工具函数
 * 提供基础实体和树形实体的元数据选项获取
 *
 * @module rxdb-client-generator/core/metadata-utils
 */

import {
  ENTITY_BASE_METADATA_OPTIONS,
  EntityMetadataOptions,
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS
} from '@aiao/rxdb';

export function getEntityMetadataOptions(className: string): EntityMetadataOptions[] | undefined {
  switch (className) {
    case 'EntityBase':
      return [ENTITY_BASE_METADATA_OPTIONS];
    default:
      return undefined;
  }
}

export function getTreeEntityMetadataOptions(className: string): EntityMetadataOptions[] | undefined {
  switch (className) {
    case 'TreeAdjacencyListEntityBase':
    case 'TreeEntityBase':
      return [TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS];
    default:
      return undefined;
  }
}
