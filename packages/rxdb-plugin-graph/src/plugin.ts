/**
 * @fileoverview RxDB Graph 插件
 * 图数据库插件入口，提供 GraphRepository 注册和能力扩展
 *
 * @module rxdb-plugin-graph
 */

import { IRxDBPlugin, Plugin, RxDB, RxDBPluginBase } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { GraphRepository } from './GraphRepository.js';
import { graphEdgeEntityFactory } from './graph-edge-entity.factory.js';
import { EntityMetadataGraphFeatures } from './graph-metadata.interface.js';
import { merge_create } from './query/merge_create.js';
import { merge_remove } from './query/merge_remove.js';
import { merge_update } from './query/merge_update.js';

type RxDBPluginGraphOptions = object;

export class RxDBPluginGraph extends RxDBPluginBase implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  name: Uncapitalize<string> = 'graph';

  install(scope: LifecycleScope) {
    // 传 scope：断开连接时这条注册跟着一起撤销。改造前这里注册完就不再有人管，
    // 断连后 GraphRepository 仍挂在 rxdb 上，指向的却是一个已经拆掉的纪元。
    this.rxdb.repository(
      'GraphRepository',
      {
        entityGenerator: graphEdgeEntityFactory,
        class: GraphRepository,
        mergeOperations: {
          create: merge_create,
          update: merge_update,
          remove: merge_remove
        }
      },
      scope
    );
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
