/**
 * @fileoverview 定义图实体基类
 * 提供基于图数据结构的实现
 */

import { Entity, EntityBase, EntityMetadataOptions } from '@aiao/rxdb';
import { Observable } from 'rxjs';
import {
  EdgeFilterOptions,
  FindNeighborsOptions,
  FindPathsOptions,
  GraphEdgeInfoType,
  GraphEdgePropertiesRecord,
  GraphPath,
  GraphQueryResult,
  GraphWhere,
  NeighborResult
} from './graph-repository.interface.js';

export const GRAPH_ENTITY_BASE_OPTIONS: EntityMetadataOptions = {
  name: 'GraphEntityBase',
  abstract: true
} as const;

/**
 * 图实体装饰器配置
 * 定义了图结构所需的边关系和遍历能力
 */
@Entity(GRAPH_ENTITY_BASE_OPTIONS)
export abstract class GraphEntityBase extends EntityBase {
  /**
   * 查询邻居节点（带边信息）
   *
   * @param options - 邻居查询选项，包含起始节点、方向、跳数等
   * @returns 邻居结果 Promise
   *
   * @example
   * ```typescript
   * // 查询直接好友
   * User.findNeighbors$({ entityId: 'user1', level: 1 }).subscribe(neighbors => {
   *   neighbors.forEach(n => {
   *     console.log(n.node.name, n.edge.weight, n.level);
   *   });
   * });
   * ```
   */
  declare static findNeighbors: <T extends GraphEntityBase, U extends EdgeFilterOptions = EdgeFilterOptions>(
    this: new () => T,
    options: FindNeighborsOptions<new () => T, GraphWhere<new () => T>, U>
  ) => Promise<GraphQueryResult<NeighborResult<new () => T, GraphEdgeInfoType<U>>>>;

  /** 查询邻居节点的响应式版本。 */
  declare static findNeighbors$: <T extends GraphEntityBase, U extends EdgeFilterOptions = EdgeFilterOptions>(
    this: new () => T,
    options: FindNeighborsOptions<new () => T, GraphWhere<new () => T>, U>
  ) => Observable<GraphQueryResult<NeighborResult<new () => T, GraphEdgeInfoType<U>>>>;

  /**
   * 统计邻居节点数量
   *
   * @param options - 邻居查询选项
   * @returns 邻居数量 Promise
   *
   * @example
   * ```typescript
   * // 统计好友数量
   * User.countNeighbors$({ entityId: 'user1', level: 1 }).subscribe(count => {
   *   console.log(`好友数: ${count}`);
   * });
   * ```
   */
  declare static countNeighbors: <T extends GraphEntityBase, U extends EdgeFilterOptions = EdgeFilterOptions>(
    this: new () => T,
    options: FindNeighborsOptions<new () => T, GraphWhere<new () => T>, U>
  ) => Promise<number>;

  /** 统计邻居节点数量的响应式版本。 */
  declare static countNeighbors$: <T extends GraphEntityBase, U extends EdgeFilterOptions = EdgeFilterOptions>(
    this: new () => T,
    options: FindNeighborsOptions<new () => T, GraphWhere<new () => T>, U>
  ) => Observable<number>;

  /**
   * 查询两个节点之间的所有路径
   *
   * @param options - 路径查询选项，包含起点、终点、深度限制等
   * @returns 路径结果 Promise
   *
   * @example
   * ```typescript
   * // 查找城市间的路径
   * City.findPaths$({
   *   fromId: 'beijing',
   *   toId: 'shanghai',
   *   maxDepth: 5
   * }).subscribe(paths => {
   *   paths[0].nodes.forEach(city => console.log(city.name));
   *   console.log(`路径长度: ${paths[0].length}`);
   * });
   * ```
   */
  declare static findPaths: <T extends GraphEntityBase, U extends EdgeFilterOptions = EdgeFilterOptions>(
    this: new () => T,
    options: FindPathsOptions<new () => T, GraphWhere<new () => T>, U>
  ) => Promise<GraphQueryResult<GraphPath<new () => T>>>;

  /** 查询路径的响应式版本。 */
  declare static findPaths$: <T extends GraphEntityBase, U extends EdgeFilterOptions = EdgeFilterOptions>(
    this: new () => T,
    options: FindPathsOptions<new () => T, GraphWhere<new () => T>, U>
  ) => Observable<GraphQueryResult<GraphPath<new () => T>>>;

  /**
   * 添加边
   *
   * @param from - 起始节点
   * @param to - 目标节点
   * @param weight - 边权重（可选）
   * @param properties - 边属性（可选）
   *
   * @example
   * ```typescript
   * const userA = new User();
   * const userB = new User();
   * await User.addEdge(userA, userB, 8, { category: 'colleague' });
   * ```
   */
  declare static addEdge: <T extends GraphEntityBase>(
    this: new () => T,
    from: T,
    to: T,
    weight?: number | null,
    properties?: GraphEdgePropertiesRecord | null
  ) => Promise<void>;

  /**
   * 移除边
   *
   * @param from - 起始节点
   * @param to - 目标节点
   *
   * @example
   * ```typescript
   * await User.removeEdge(userA, userB);
   * ```
   */
  declare static removeEdge: <T extends GraphEntityBase>(this: new () => T, from: T, to: T) => Promise<void>;
}
