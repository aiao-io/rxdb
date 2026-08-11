/**
 * @fileoverview Graph 仓库实现
 * 图数据库仓库，提供图遍历和路径查询能力
 */

import { deterministicStringify, EntityType, getEntityMetadata, Repository, RxDB } from '@aiao/rxdb';
import { firstValueFrom, map, Observable, of, switchMap } from 'rxjs';
import { GRAPH_QUERY_TYPES } from './constants.js';
import { createGraphQueryResult } from './graph-query-result.js';
import {
  EdgeFilterOptions,
  EdgeFilterOptionsFull,
  FindNeighborsOptions,
  FindPathsOptions,
  GraphEdgeInfoType,
  GraphEdgeProperties,
  GraphPath,
  GraphQueryResult,
  GraphWhere,
  IGraphRepository,
  NeighborResult
} from './graph-repository.interface.js';
import { IGraphEntity } from './graph.interface.js';
import { merge_create } from './query/merge_create.js';
import { merge_remove } from './query/merge_remove.js';
import { merge_update } from './query/merge_update.js';
import { normalizeNeighborsOptions, normalizePathsOptions } from './utils.js';

/**
 * 图结构实体仓库
 * 提供图查询能力：邻居节点查询、路径查询等
 */
export class GraphRepository<
  T extends EntityType & (new (...args: unknown[]) => IGraphEntity),
  U extends EdgeFilterOptions = EdgeFilterOptionsFull,
  V = GraphEdgeInfoType<U>,
  RepositoryType extends IGraphRepository<T, U, V> = IGraphRepository<T, U, V>
> extends Repository<T, RepositoryType> {
  protected static override _STATIC_METHODS = [
    ...super._STATIC_METHODS,
    'findNeighbors',
    'findNeighbors$',
    'countNeighbors',
    'countNeighbors$',
    'findPaths',
    'findPaths$',
    'addEdge',
    'removeEdge'
  ];

  constructor(rxdb: RxDB, EntityType: T) {
    super(rxdb, EntityType);
    GRAPH_QUERY_TYPES.forEach(type => {
      this.queryManager.registerMergeCreateFn(type, merge_create);
      this.queryManager.registerMergeUpdateFn(type, merge_update);
      this.queryManager.registerMergeRemoveFn(type, merge_remove);
    });
  }

  /**
   * 查询邻居节点
   *
   * @remarks
   * - 指定 entityId 时：根据 level 返回 N 跳邻居
   * - direction 控制查询方向（入边/出边/双向）
   * - level=0 时直接返回空数组（不查询邻居）
   *
   * @example
   * ```typescript
   * // 查询直接好友
   * const friends = await repo.findNeighbors({ entityId: 'alice-id', level: 1 });
   * ```
   */
  findNeighbors$(
    options: FindNeighborsOptions<T, GraphWhere<T>, U>
  ): Observable<GraphQueryResult<NeighborResult<T, V>>> {
    const normalized = normalizeNeighborsOptions(options, true);
    const runner = () => {
      if (normalized.level === 0) return of(createGraphQueryResult<NeighborResult<T, V>>([], false));
      return this.local$.pipe(
        switchMap(local => local.findNeighbors(normalized)),
        map(neighbors =>
          createGraphQueryResult(
            neighbors.map(neighbor => ({
              ...neighbor,
              node: this.createEntityRef(neighbor.node as never) as InstanceType<T>
            })),
            neighbors.truncated === true
          )
        )
      );
    };
    return this.createGraphTask({ type: 'findNeighbors', options: normalized }, runner);
  }

  findNeighbors(options: FindNeighborsOptions<T, GraphWhere<T>, U>): Promise<GraphQueryResult<NeighborResult<T, V>>> {
    return firstValueFrom(this.findNeighbors$(options));
  }

  /**
   * 查询邻居节点数量
   *
   * @remarks
   * - 指定 entityId 时：**不包含起始节点**，只统计邻居数量
   * - 统计规则与 findNeighbors 一致
   *
   * @example
   * ```typescript
   * // 统计好友数量
   * const friendCount = await repo.countNeighbors({ entityId: 'alice-id', level: 1 });
   * ```
   */
  countNeighbors$(options: FindNeighborsOptions<T, GraphWhere<T>, U>): Observable<number> {
    const normalized = normalizeNeighborsOptions(options, true);
    const runner = () => this.local$.pipe(switchMap(local => local.countNeighbors(normalized)));
    return this.createGraphTask({ type: 'countNeighbors', options: normalized }, runner);
  }

  countNeighbors(options: FindNeighborsOptions<T, GraphWhere<T>, U>): Promise<number> {
    return firstValueFrom(this.countNeighbors$(options));
  }

  /**
   * 查询两个节点之间的所有路径
   *
   * @remarks
   * - 返回所有非循环路径（节点不重复）
   * - 排序规则：首先按路径长度升序，长度相同时按总权重升序（权重越小优先）
   * - maxDepth 限制搜索深度，防止指数级爆炸
   *
   * @example
   * ```typescript
   * // 查询 Alice 到 Bob 的所有路径
   * const paths = await repo.findPaths({ fromId: 'alice-id', toId: 'bob-id', maxDepth: 5 });
   * ```
   */
  findPaths$(options: FindPathsOptions<T, GraphWhere<T>, U>): Observable<GraphQueryResult<GraphPath<T>>> {
    const normalized = normalizePathsOptions(options);
    const runner = () =>
      this.local$.pipe(
        switchMap(local => local.findPaths(normalized)),
        map(paths =>
          createGraphQueryResult(
            paths.map(path => ({
              ...path,
              nodes: path.nodes.map(node => this.createEntityRef(node as never) as InstanceType<T>)
            })),
            paths.truncated === true
          )
        )
      );
    return this.createGraphTask({ type: 'findPaths', options: normalized }, runner);
  }

  findPaths(options: FindPathsOptions<T, GraphWhere<T>, U>): Promise<GraphQueryResult<GraphPath<T>>> {
    return firstValueFrom(this.findPaths$(options));
  }

  /**
   * 添加边
   */
  async addEdge(
    from: InstanceType<T>,
    to: InstanceType<T>,
    weight?: number | null,
    properties?: GraphEdgeProperties<U> | null
  ): Promise<void> {
    return firstValueFrom(this.local$.pipe(switchMap(local => local.addEdge(from, to, weight, properties))));
  }

  /**
   * 移除边
   */
  async removeEdge(from: InstanceType<T>, to: InstanceType<T>): Promise<void> {
    return firstValueFrom(this.local$.pipe(switchMap(local => local.removeEdge(from, to))));
  }

  private getEdgeEntityType(): EntityType | undefined {
    const metadata = getEntityMetadata(this.EntityType);
    return this.rxdb.schemaManager.getEntityType(`${metadata.name}_edges`, metadata.namespace) ?? undefined;
  }

  private createGraphTask<RT>(
    options:
      | { type: 'findNeighbors'; options: FindNeighborsOptions<T> }
      | { type: 'countNeighbors'; options: FindNeighborsOptions<T> }
      | { type: 'findPaths'; options: FindPathsOptions<T> },
    runner: () => Observable<RT>
  ): Observable<RT> {
    const EdgeEntityType = this.getEdgeEntityType();
    return this.queryManager.createTask({
      options,
      runner,
      getFingerprint: result => [
        deterministicStringify(result),
        Array.isArray(result) && (result as { truncated?: boolean }).truncated === true
      ],
      relationEntityTypes: EdgeEntityType ? [EdgeEntityType] : [],
      autoCache: false
    }).result$;
  }
}
