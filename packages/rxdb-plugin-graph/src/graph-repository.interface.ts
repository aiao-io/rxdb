/**
 * @fileoverview Graph 仓库接口
 * 图数据库仓库接口，提供图遍历和路径查询能力
 */

import { EntityStaticType, EntityType, IRepository, RuleGroup } from '@aiao/rxdb';

/**
 * 边属性值类型
 *
 * @remarks
 * Date 存储时序列化为 ISO 字符串，查询返回值为 ISO 字符串；
 * 过滤时可直接传 Date 对象（内部按 ISO 字符串匹配）
 */
export type GraphEdgePropertyValue = string | number | boolean | Date;

export type GraphEdgePropertiesRecord = Record<string, GraphEdgePropertyValue>;

/**
 * 图查询的节点过滤条件
 *
 * @remarks
 * 仅支持当前实体表的字段（简单键值匹配或 RuleGroup），**不支持关系字段**；
 * 需要关系过滤时请使用普通 find 查询
 */
export type GraphWhere<T extends EntityType> =
  RuleGroup<InstanceType<T>> | Partial<Record<Extract<keyof InstanceType<T>, string>, unknown>>;

/**
 * 边过滤条件基础接口(无权重、无属性)
 *
 * @remarks
 * 当前版本暂不支持复杂查询,仅支持简单的键值匹配
 * 复杂查询请直接使用 SQL 查询边表({EntityName}_edges)
 */
export type EdgeFilterOptions = object;

/**
 * 边过滤条件（带权重）
 */
export interface EdgeFilterOptionsWithWeight extends EdgeFilterOptions {
  /**
   * 权重范围过滤
   * @example { min: 1, max: 10 }
   */
  weight?: { min?: number; max?: number };
}

/**
 * 边过滤条件（带属性）
 */
export interface EdgeFilterOptionsWithProperties<EdgeProperties = GraphEdgePropertiesRecord> extends EdgeFilterOptions {
  /**
   * 边属性过滤（简单键值匹配）
   * @example { category: 'business', type: 'partner' }
   *
   * @remarks
   * 仅支持相等匹配，不支持范围/模糊查询
   */
  properties?: EdgeProperties;
}

/**
 * 边过滤条件（权重 + 属性）
 */
export interface EdgeFilterOptionsFull<EdgeProperties = GraphEdgePropertiesRecord>
  extends EdgeFilterOptionsWithWeight, EdgeFilterOptionsWithProperties<EdgeProperties> {}

/**
 * 边信息（基础）
 */
export interface EdgeInfo {
  sourceId: string;
  targetId: string;
  direction: 'in' | 'out';
}

/**
 * 边信息（带权重）
 */
export interface EdgeInfoWithWeight extends EdgeInfo {
  weight: number | null;
}

/**
 * 边信息（带属性）
 */
export interface EdgeInfoWithProperties<EdgeProperties = GraphEdgePropertiesRecord> extends EdgeInfo {
  properties: EdgeProperties | null;
}

/**
 * 边信息（权重 + 属性）
 */
export interface EdgeInfoFull<EdgeProperties = GraphEdgePropertiesRecord>
  extends EdgeInfoWithWeight, EdgeInfoWithProperties<EdgeProperties> {}

/**
 * 从过滤条件里取出边属性的类型。
 *
 * @remarks
 * 判别必须走 `keyof` 而不是 `extends`：`weight` / `properties` 都是**可选**属性，
 * `T extends EdgeFilterOptionsFull` 对任意对象类型都成立（包括 `EdgeFilterOptions = object`），
 * 用 `extends` 会让第一个分支恒命中、后面的分支永不可达。可选属性同样出现在 `keyof` 里，
 * 而 `keyof object` 是 `never`，因此 `'weight' extends keyof T` 才能真正区分。
 */
type EdgePropsOf<TFilter> =
  TFilter extends { properties?: infer TProperties } ? NonNullable<TProperties> : GraphEdgePropertiesRecord;

export type GraphEdgeProperties<TFilter extends EdgeFilterOptions> =
  'properties' extends keyof TFilter ? EdgePropsOf<TFilter> : never;

export type GraphEdgeInfoType<TFilter extends EdgeFilterOptions> =
  'weight' extends keyof TFilter ?
    'properties' extends keyof TFilter ?
      EdgeInfoFull<EdgePropsOf<TFilter>>
    : EdgeInfoWithWeight
  : 'properties' extends keyof TFilter ? EdgeInfoWithProperties<EdgePropsOf<TFilter>>
  : EdgeInfo;

/**
 * 图邻居查询结果（基础）
 */
export interface NeighborResult<T extends EntityType, EdgeInfoType = EdgeInfo> {
  /**
   * 邻居节点
   */
  node: InstanceType<T>;

  /**
   * 连接边信息
   */
  edge: EdgeInfoType;

  /**
   * 跳数（从起始节点的距离）
   * - 1: 直接邻居（1跳）
   * - 2: 2跳邻居
   * - 3: 3跳邻居
   */
  level: number;
}

/** 带资源截断状态的图查询数组。 */
export type GraphQueryResult<T> = T[] & {
  /** 真实结果超过本次 limit，或路径搜索触及内部资源上限时为 true。 */
  readonly truncated?: boolean;
};

/**
 * 图邻居查询选项（基础）
 */
export interface FindNeighborsOptions<
  T extends EntityType = EntityType,
  U = GraphWhere<T>,
  V extends EdgeFilterOptions = EdgeFilterOptions
> {
  /**
   * 起始节点 ID
   */
  entityId: EntityStaticType<T, 'idType'>;

  /**
   * 查询方向
   * - 'in': 入边邻居（指向当前节点的节点）
   * - 'out': 出边邻居（从当前节点指出的节点）
   * - 'both': 双向邻居（默认）
   * @default 'both'
   */
  direction?: 'in' | 'out' | 'both';

  /**
   * 最大跳数（不包含起始节点）
   * - 0: 不查询任何邻居（findNeighbors 返回空数组，countNeighbors 返回 0）
   * - 1: 仅直接邻居（1跳）
   * - 2: 1跳 + 2跳邻居
   * - 3: 1跳 + 2跳 + 3跳邻居
   *
   * @default 1
   * @minimum 0
   * @maximum 100
   *
   * @remarks
   * - **返回结果不包含起始节点本身**
   * - 当 level < 0 时，会被规范化为 1
   * - 当 level > 100 时，会被限制为 100（防止性能问题）
   * - 结果自动去重（同一节点通过不同路径到达时只返回最短路径）
   *
   * @example
   * ```typescript
   * // 查询直接好友（1跳）
   * findNeighbors({ entityId: 'user1', level: 1 })
   * // 返回: [{ node: friend1, edge: {...}, level: 1 }, ...]
   *
   * // 查询好友的好友（2度人脉，1跳+2跳）
   * findNeighbors({ entityId: 'user1', level: 2 })
   * // 返回: [
   * //   { node: friend1, edge: {...}, level: 1 },      // 1跳
   * //   { node: friendOfFriend, edge: {...}, level: 2 } // 2跳
   * // ]
   * ```
   */
  level?: number;

  /**
   * 节点过滤条件
   * 应用于邻居节点的属性
   */
  where?: U;

  /**
   * 边过滤条件
   * 应用于连接边的属性（权重、自定义属性等）
   *
   * @example
   * ```typescript
   * // 只查询高权重的邻居（需要启用 weight）
   * edgeWhere: { weight: { min: 5 } }
   *
   * // 只查询特定类别的关系
   * edgeWhere: { properties: { category: 'business' } }
   * ```
   */
  edgeWhere?: V;

  /**
   * findNeighbors 最多返回的节点数；countNeighbors 忽略此字段。
   * @default 1000
   * @maximum 10000
   */
  limit?: number;
}

/**
 * 图路径查询选项（基础）
 */
export interface FindPathsOptions<
  T extends EntityType = EntityType,
  U = GraphWhere<T>,
  V extends EdgeFilterOptions = EdgeFilterOptions
> {
  /**
   * 源节点 ID
   */
  fromId: EntityStaticType<T, 'idType'>;

  /**
   * 目标节点 ID
   */
  toId: EntityStaticType<T, 'idType'>;

  /**
   * 查询方向
   * - 'in': 入边路径
   * - 'out': 出边路径
   * - 'both': 双向路径（默认）
   * @default 'both'
   */
  direction?: 'in' | 'out' | 'both';

  /**
   * 最大搜索深度（防止过度搜索）
   * @default 10
   * @maximum 100
   *
   * @remarks
   * 路径搜索的复杂度随深度指数增长
   * 建议根据实际图的密度调整此值
   */
  maxDepth?: number;

  /**
   * 节点约束条件
   * 应用于路径上的所有中间节点
   */
  where?: U;

  /**
   * 边约束条件
   * 应用于路径上的所有边
   *
   * @example
   * ```typescript
   * // 只走高速公路
   * edgeWhere: { properties: { roadType: 'highway' } }
   *
   * // 避免拥堵路段（需要启用 weight）
   * edgeWhere: { weight: { max: 10 } }
   * ```
   */
  edgeWhere?: V;

  /**
   * 最多返回的路径数。
   * @default 1000
   * @maximum 10000
   */
  limit?: number;
}

/**
 * 图路径结果
 */
export interface GraphPath<T extends EntityType> {
  /**
   * 路径上的节点数组（按顺序）
   * 包括源节点和目标节点
   */
  nodes: InstanceType<T>[];

  /**
   * 路径上的边数组（按顺序）
   */
  edges: Array<{
    sourceId: string;
    targetId: string;
    weight?: number | null;
    properties?: GraphEdgePropertiesRecord | null;
  }>;

  /**
   * 路径长度（跳数）
   */
  length: number;

  /**
   * 总权重（如果启用了边权重）
   */
  totalWeight?: number;
}

/**
 * 图结构仓库接口（基础）
 */
export interface IGraphRepository<
  T extends EntityType,
  V extends EdgeFilterOptions = EdgeFilterOptionsFull,
  EdgeInfoType = GraphEdgeInfoType<V>
> extends IRepository<T> {
  /**
   * 查询邻居节点（带边信息）
   *
   * @returns 邻居节点数组，每个元素包含节点和边信息
   *
   * @remarks
   * - 返回结果**不包含起始节点**（遍历携带 visited path，存在环/回边时也不会回流）
   * - 结果按节点去重：同一节点通过不同路径到达时只保留最小 level；
   *   同一最短层级存在多条边时，返回 weight 最小的边（无权图按边端点 id 稳定选取）
   * - 默认按 level 升序、weight 升序、节点 id 升序排序
   *
   * @example
   * ```typescript
   * // 查询直接好友
   * const neighbors = await User.findNeighbors({
   *   entityId: 'user1',
   *   level: 1
   * });
   * // neighbors[0].node => 邻居节点
   * // neighbors[0].edge => { sourceId, targetId, direction, weight, properties }
   * // neighbors[0].level => 1
   *
   * // 查询高权重的商业伙伴（2度人脉）
   * const partners = await User.findNeighbors({
   *   entityId: 'user1',
   *   level: 2,
   *   edgeWhere: {
   *     weight: { min: 5 },
   *     properties: { category: 'business' }
   *   }
   * });
   * ```
   */
  findNeighbors(
    options: FindNeighborsOptions<T, GraphWhere<T>, V>
  ): Promise<GraphQueryResult<NeighborResult<T, EdgeInfoType>>>;

  /**
   * 统计邻居节点数量
   *
   * @returns 邻居数量（不包含起始节点）
   *
   * @remarks
   * 统计规则与 findNeighbors 一致，但性能更高（无需返回完整节点数据）
   *
   * @example
   * ```typescript
   * // 统计好友数量
   * const count = await User.countNeighbors({
   *   entityId: 'user1',
   *   level: 1
   * });
   * ```
   */
  countNeighbors(options: FindNeighborsOptions<T, GraphWhere<T>, V>): Promise<number>;

  /**
   * 查询两个节点之间的所有路径
   *
   * @returns 路径数组，按长度和权重排序
   *
   * @remarks
   * - 返回所有非循环路径（节点不重复）
   * - `fromId === toId` 时返回的是**真实环路**（如 `A→B→A`），不含 0 长度的退化路径；
   *   起点自身不构成一条路径，因此该场景下每条结果的 `length` 都 ≥ 1
   * - 排序规则：首先按路径长度升序，长度相同时按总权重升序（权重越小优先）
   * - maxDepth 限制搜索深度，防止指数级爆炸
   * - 边数组包含完整的边信息（方向、权重、属性）
   *
   * @example
   * ```typescript
   * // 查找城市间的最短路径
   * const paths = await City.findPaths({
   *   fromId: 'beijing',
   *   toId: 'shanghai',
   *   maxDepth: 5,
   *   edgeWhere: { properties: { roadType: 'highway' } }
   * });
   * // paths[0] => 最短路径
   * // paths[0].nodes => [北京, 天津, 上海]
   * // paths[0].edges => [{ sourceId, targetId, weight, properties }, ...]
   * // paths[0].length => 2（经过2条边）
   * // paths[0].totalWeight => 500（总权重）
   * ```
   */
  findPaths(options: FindPathsOptions<T, GraphWhere<T>, V>): Promise<GraphQueryResult<GraphPath<T>>>;

  /**
   * 添加边
   *
   * @param from 起始节点
   * @param to 目标节点
   * @param weight 边权重（需要在元数据中启用 features.graph.weight）
   * @param properties 边属性（需要在元数据中启用 features.graph.properties）
   *
   * @example
   * ```typescript
   * await User.addEdge(userA, userB, 8, {
   *   category: 'colleague',
   *   since: '2024-01-01'
   * });
   * ```
   */
  addEdge(
    from: InstanceType<T>,
    to: InstanceType<T>,
    weight?: number | null,
    properties?: GraphEdgeProperties<V> | null
  ): Promise<void>;

  /**
   * 移除边
   *
   * @param from 起始节点
   * @param to 目标节点
   *
   * @remarks
   * 对于无向图，会同时删除双向边
   */
  removeEdge(from: InstanceType<T>, to: InstanceType<T>): Promise<void>;
}

declare module '@aiao/rxdb' {
  interface RepositoryQueryExtensions<T extends EntityType> {
    graphFindNeighbors: {
      type: 'findNeighbors';
      options: FindNeighborsOptions<T>;
    };
    graphCountNeighbors: {
      type: 'countNeighbors';
      options: FindNeighborsOptions<T>;
    };
    graphFindPaths: {
      type: 'findPaths';
      options: FindPathsOptions<T>;
    };
  }
}
