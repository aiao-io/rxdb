/**
 * @fileoverview 图边实体工厂
 * 根据图实体元数据动态生成边表实体类
 *
 * @module rxdb-plugin-graph/graph-edge-entity-factory
 */

import { Entity, EntityBase, EntityMetadata } from '@aiao/rxdb';
import generate_graph_edge_entity from './graph_edge_entity.js';

export const graphEdgeEntityFactory = (metadata: EntityMetadata) => {
  const edge_metadataOptions = generate_graph_edge_entity(metadata);
  @Entity(edge_metadataOptions)
  class EdgeClass extends EntityBase {}
  return EdgeClass;
};
