/**
 * @fileoverview 图实体装饰器
 * 提供将类标记为图结构实体的装饰器，支持不同的图结构模型
 */

import { Entity, EntityMetadataOptions } from '@aiao/rxdb';

/**
 * 图实体装饰器
 * 用于将类标记为图结构实体，并处理图特定的元数据, 生成 edges 表等
 */
export const GraphEntity = (metadataOptions: EntityMetadataOptions) => {
  const graph = metadataOptions.features?.graph ?? {};
  return Entity({
    ...metadataOptions,
    repository: metadataOptions.repository ?? 'GraphRepository',
    features: {
      ...metadataOptions.features,
      graph: {
        ...graph,
        type: graph.type ?? 'undirected-graph',
        weight: graph.weight ?? false
      }
    }
  });
};
