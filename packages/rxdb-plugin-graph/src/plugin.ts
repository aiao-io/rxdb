/**
 * @fileoverview RxDB Graph 插件
 * 图数据库插件入口，提供 GraphRepository 注册和能力扩展
 *
 * @module rxdb-plugin-graph
 */

import { IRxDBPlugin, Plugin, RxDB, RxDBPluginBase } from '@aiao/rxdb';
import { GraphRepository } from './GraphRepository.js';
import { graphEdgeEntityFactory } from './graph-edge-entity.factory.js';
import { EntityMetadataGraphFeatures } from './graph-metadata.interface.js';
import { merge_create } from './query/merge_create.js';
import { merge_remove } from './query/merge_remove.js';
import { merge_update } from './query/merge_update.js';

type RxDBPluginGraphOptions = object;

export class RxDBPluginGraph extends RxDBPluginBase implements IRxDBPlugin {
  name: Uncapitalize<string> = 'graph';

  install() {
    this.rxdb.repository('GraphRepository', {
      entityGenerator: graphEdgeEntityFactory,
      class: GraphRepository,
      mergeOperations: {
        create: merge_create,
        update: merge_update,
        remove: merge_remove
      }
    });
  }

  destroy() {
    // 注销
  }
}

declare module '@aiao/rxdb' {
  interface RxDB {
    graph: RxDBPluginGraph;
  }
  /**
   * 扩展 EntityMetadataFeatures，添加 graph 字段
   */
  interface EntityMetadataFeatures {
    /**
     * Graph 特性配置
     * 由 rxdb-plugin-graph 插件提供
     */
    graph?: EntityMetadataGraphFeatures;
  }
}

export const rxDBPluginGraph: Plugin<RxDBPluginGraphOptions> = (db: RxDB) => new RxDBPluginGraph(db);
