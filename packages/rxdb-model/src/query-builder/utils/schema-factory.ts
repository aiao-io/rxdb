/**
 * @fileoverview Schema 工厂函数
 * 提供便捷的工厂方法从 RxDB 实体创建 SchemaParser 实例并解析字段
 */

import type { EntityMetadata } from '@aiao/rxdb';
import type { FieldMetadata } from '../models/query-builder-state.js';
import { createSchemaParser, type SchemaParserOptions } from '../services/schema-parser.service.js';

/**
 * 从 EntityMetadata 创建字段元数据
 *
 * 这是一个便捷的工厂函数，封装了 SchemaParser 的创建和解析过程
 *
 * @param metadata - RxDB 实体元数据
 * @param options - 解析器选项
 * @returns 字段元数据数组
 *
 * @example
 * ```typescript
 * // 基础用法
 * const fields = createSchemaFromEntity(userMetadata);
 *
 * // 包含外键
 * const fieldsWithFK = createSchemaFromEntity(userMetadata, {
 *   includeForeignKeys: true
 * });
 *
 * // 包含计算属性
 * const fieldsWithComputed = createSchemaFromEntity(userMetadata, {
 *   includeComputedProperties: true
 * });
 *
 * // 自定义过滤器
 * const onlyStringFields = createSchemaFromEntity(userMetadata, {
 *   fieldFilter: (field) => field.type === 'string'
 * });
 * ```
 */
export function createSchemaFromEntity(metadata: EntityMetadata, options?: SchemaParserOptions): FieldMetadata[] {
  const parser = createSchemaParser(options);
  return parser.parse(metadata);
}

/**
 * 从多个 EntityMetadata 批量创建字段元数据
 *
 * @param metadataMap - 实体名称到元数据的映射
 * @param options - 解析器选项
 * @returns 实体名称到字段数组的映射
 *
 * @example
 * ```typescript
 * const entities = new Map([
 *   ['User', userMetadata],
 *   ['Post', postMetadata],
 *   ['Comment', commentMetadata]
 * ]);
 *
 * const schemas = createSchemaFromEntities(entities, {
 *   includeForeignKeys: true
 * });
 *
 * // 使用结果
 * const userFields = schemas.get('User');
 * const postFields = schemas.get('Post');
 * ```
 */
export function createSchemaFromEntities(
  metadataMap: Map<string, EntityMetadata>,
  options?: SchemaParserOptions
): Map<string, FieldMetadata[]> {
  const parser = createSchemaParser(options);
  return parser.parseMany(metadataMap);
}
