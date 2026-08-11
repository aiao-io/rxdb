import { KeyValuePropertyMetadata } from '@aiao/rxdb';

type GraphType = 'undirected-graph' | 'directed-graph';

/**
 * 实体元数据图形结构特性接口
 *
 * @remarks
 * 通过 `type` 和 `weight` 两个属性组合，支持 4 种标准图场景：
 *
 * 1. **无权无向图** - `{ type: 'undirected-graph', weight: false }`
 *    - 典型场景：社交网络好友关系、文件系统目录结构
 *
 * 2. **有权无向图** - `{ type: 'undirected-graph', weight: true }`
 *    - 典型场景：城市间距离、协作强度、相似度网络
 *
 * 3. **无权有向图** - `{ type: 'directed-graph', weight: false }`
 *    - 典型场景：关注关系、依赖关系、状态转换
 *
 * 4. **有权有向图** - `{ type: 'directed-graph', weight: true }`
 *    - 典型场景：路由网络、影响力传播、资金流向
 *
 * @example
 * ```typescript
 * // 场景 1：社交网络（无权无向图）
 * @GraphEntity({
 *   features: { graph: { type: 'undirected-graph' } }
 * })
 * class User { }
 *
 * // 场景 2：城市距离（有权无向图）
 * @GraphEntity({
 *   features: { graph: { type: 'undirected-graph', weight: true } }
 * })
 * class City { }
 *
 * // 场景 3：关注关系（无权有向图）
 * @GraphEntity({
 *   features: { graph: { type: 'directed-graph' } }
 * })
 * class Account { }
 *
 * // 场景 4：资金流向（有权有向图）
 * @GraphEntity({
 *   features: { graph: { type: 'directed-graph', weight: true } }
 * })
 * class Transaction { }
 * ```
 */
export interface EntityMetadataGraphFeatures {
  /**
   * 图形结构类型
   * - `undirected-graph` 无向图（边无方向性）
   * - `directed-graph` 有向图（边有明确方向）
   *
   * @default 'undirected-graph'
   */
  type?: GraphType;

  /**
   * 是否启用图权重
   * - `false` 所有边权重相同（拓扑结构）
   * - `true` 边可携带数值权重（距离、强度等）
   *
   * @default false
   */
  weight?: boolean;

  /**
   * 边属性结构定义
   * 定义边表中 properties 字段的结构（keyValue 类型）
   *
   * @remarks
   * - 用于生成边表的 properties 字段（keyValue 类型）
   * - 提供类型安全和自动校验
   * - 查询时可以通过 properties.{field} 访问
   *
   * @default undefined（不启用边属性）
   *
   * @example
   * ```typescript
   * // 定义边属性结构
   * features: {
   *   graph: {
   *     weight: true,
   *     properties: [
   *       { name: 'category', type: PropertyType.string },
   *       { name: 'strength', type: PropertyType.number },
   *       { name: 'since', type: PropertyType.date }
   *     ]
   *   }
   * }
   *
   * // 使用边属性
   * await Node.addEdge(nodeA, nodeB, 5, {
   *   category: 'business',
   *   strength: 8,
   *   since: new Date('2024-01-01')
   * });
   *
   * // 查询时过滤
   * findNeighbors({
   *   entityId: 'node1',
   *   edgeWhere: {
   *     properties: { category: 'business' }
   *   }
   * });
   * ```
   */
  properties?: KeyValuePropertyMetadata[];
}
