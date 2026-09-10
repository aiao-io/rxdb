/**
 * @fileoverview 拓扑排序算法
 *
 * 提供两种排序方向：
 * - Pull（父->子）: 确保父实体先同步，外键引用的数据已存在
 * - Push（子->父）: 确保子实体先同步，避免外键约束错误
 */

import { RxDBError } from '../RxDBError.js';
import type { DependencyGraph, RepositoryIdentifier } from './dependency-graph.js';

/**
 * 排序方向
 */
export type SortDirection = 'pull' | 'push';

/**
 * 依赖图上的一条边。
 *
 * - `dependsOn`：本仓库**依赖**的仓库（父，外键指过去的那一端）
 * - `requiredBy`：**依赖本仓库**的仓库（子，外键指过来的那一端）
 */
export type DependencyEdge = 'dependsOn' | 'requiredBy';

/**
 * 排序方向沿依赖图上的哪条边展开。
 *
 * 这条对应关系是整个级联调度的枢纽，所以只在这里写一次：拓扑序沿哪条边建立，
 * 「谁排在我前面」就是哪条边，级联的依赖闸门也必须看同一条边。
 * 从前它以 `direction === 'pull' ? dep.dependsOn : dep.requiredBy` 的形式散在
 * {@link topologicalSort} 里，闸门那一侧则各写各的，于是 DELETE 相位的闸门看错了边。
 */
export function dependencyEdgeOf(direction: SortDirection): DependencyEdge {
  return direction === 'pull' ? 'dependsOn' : 'requiredBy';
}

/**
 * 本相位该按哪个方向排序。
 *
 * DELETE 子先父后、INSERT/UPDATE 父先子后，理由见 {@link topologicalSortForAction}。
 */
function sortDirectionForAction(action: SortActionKind): SortDirection {
  return action === 'DELETE' ? 'push' : 'pull';
}

/**
 * 本相位的依赖闸门该看哪条边 —— 也就是「本相位里谁排在我前面」。
 *
 * DELETE 相位子先父后，父被子阻断，看 `requiredBy`；
 * INSERT/UPDATE 相位父先子后，子被父阻断，看 `dependsOn`。
 *
 * 与 {@link topologicalSortForAction} 共用 {@link sortDirectionForAction}，
 * 保证「执行顺序」和「阻断关系」不可能各说各话。
 *
 * @param action - 本相位提交的变更类型
 * @returns 该相位下判定阻断所依据的依赖边
 */
export function dependencyEdgeForAction(action: SortActionKind): DependencyEdge {
  return dependencyEdgeOf(sortDirectionForAction(action));
}

/**
 * 拓扑排序
 *
 * @param graph - 依赖图
 * @param direction - 排序方向
 *   - 'pull': 父实体在前（User -> Todo -> Comment）
 *   - 'push': 子实体在前（Comment -> Todo -> User）
 * @returns 排序后的 repository 列表
 *
 * @example
 * ```ts
 * // Pull 顺序（父在前）
 * const pullOrder = topologicalSort(graph, 'pull');
 * // 返回: [User, Todo, Comment]
 *
 * // Push 顺序（子在前）
 * const pushOrder = topologicalSort(graph, 'push');
 * // 返回: [Comment, Todo, User]
 * ```
 */
export function topologicalSort(graph: DependencyGraph, direction: SortDirection): RepositoryIdentifier[] {
  // Pull: 使用 dependsOn（父实体先）
  // Push: 使用 requiredBy（子实体先）
  const result: RepositoryIdentifier[] = [];
  const visited = new Set<string>();
  const tempMarked = new Set<string>();

  function visit(key: string): void {
    if (visited.has(key)) return;

    if (tempMarked.has(key)) {
      throw new RxDBError(`Circular dependency detected at ${key}`);
    }

    tempMarked.add(key);

    const dep = graph.get(key);
    if (!dep) {
      throw new RxDBError(`Repository ${key} not found in dependency graph`);
    }

    // 根据方向选择遍历的邻居（边的选择集中在 dependencyEdgeOf，闸门那一侧读同一份）
    const neighbors = dep[dependencyEdgeOf(direction)];

    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.namespace}:${neighbor.entity}`;
      // 跳过自引用（树形结构）
      if (neighborKey === key) continue;
      // 跳过悬挂依赖：关系可以指向没被注册进 config.entities 的实体（跨 namespace
      // 部分注册、按需加载模块）。buildDependencyGraph 反向填充 requiredBy 时同样
      // 是宽容的，这里不跳过就会让整个 pull/push 链路因一条无关关系而不可用。
      if (!graph.has(neighborKey)) continue;
      visit(neighborKey);
    }

    tempMarked.delete(key);
    visited.add(key);

    // Pull: 父实体先访问，后添加 -> 父在前
    // Push: 子实体先访问，后添加 -> 子在前
    result.push(dep.repository);
  }

  // 遍历所有节点
  for (const key of graph.keys()) {
    visit(key);
  }

  return result;
}

/**
 * 拓扑排序（Pull 方向）
 *
 * 确保父实体在前，适用于 Pull 同步
 *
 * @param graph - 依赖图
 * @returns 排序后的 repository 列表
 */
export function topologicalSortForPull(graph: DependencyGraph): RepositoryIdentifier[] {
  return topologicalSort(graph, 'pull');
}

/**
 * 拓扑排序（Push 方向）
 *
 * 确保子实体在前，适用于 Push 同步
 *
 * @param graph - 依赖图
 * @returns 排序后的 repository 列表
 */
export function topologicalSortForPush(graph: DependencyGraph): RepositoryIdentifier[] {
  return topologicalSort(graph, 'push');
}

/**
 * 变更类型：决定安全的提交顺序
 */
export type SortActionKind = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * 按变更类型选排序方向
 *
 * 同一张依赖图，INSERT 和 DELETE 需要的顺序**正好相反**，「push 就是子→父」这个说法
 * 只对 DELETE 成立：
 *
 * - `INSERT` / `UPDATE` → **父先**。子行的外键指向父行，父行不先落库就是悬空引用，FK 失败。
 * - `DELETE` → **子先**。父行还被子行引用着，先删父同样 FK 失败。
 *
 * 所以一次级联推送不可能靠单一顺序扫完，必须分相位：DELETE 走一遍子→父，
 * INSERT/UPDATE 再走一遍父→子。
 *
 * @param graph - 依赖图
 * @param action - 本相位要提交的变更类型
 * @returns 该类型下安全的提交顺序
 *
 * @example
 * ```ts
 * topologicalSortForAction(graph, 'INSERT'); // [User, Todo, Comment]
 * topologicalSortForAction(graph, 'DELETE'); // [Comment, Todo, User]
 * ```
 */
export function topologicalSortForAction(graph: DependencyGraph, action: SortActionKind): RepositoryIdentifier[] {
  return topologicalSort(graph, sortDirectionForAction(action));
}

/**
 * 过滤并排序指定的 repository 列表
 *
 * 从依赖图中只选择指定的 repositories，并按拓扑顺序排序
 *
 * @param graph - 完整依赖图
 * @param repositories - 要排序的 repository 列表
 * @param direction - 排序方向
 * @returns 排序后的 repository 列表
 *
 * @example
 * ```ts
 * // 只同步 Todo 和 Comment
 * const filtered = filterAndSort(
 *   graph,
 *   [
 *     { namespace: 'public', entity: 'Todo' },
 *     { namespace: 'public', entity: 'Comment' }
 *   ],
 *   'pull'
 * );
 * // 返回: [Todo, Comment]（按依赖顺序）
 * ```
 */
export function filterAndSort(
  graph: DependencyGraph,
  repositories: RepositoryIdentifier[],
  direction: SortDirection
): RepositoryIdentifier[] {
  // 创建子图，只包含指定的 repositories
  const subGraph: DependencyGraph = new Map();
  const keys = new Set(repositories.map(r => `${r.namespace}:${r.entity}`));

  for (const key of keys) {
    const dep = graph.get(key);
    if (!dep) {
      throw new RxDBError(`Repository ${key} not found in dependency graph`);
    }

    // 过滤依赖，只保留在 keys 中的
    const filteredDependsOn = dep.dependsOn.filter(parent => {
      const parentKey = `${parent.namespace}:${parent.entity}`;
      return keys.has(parentKey);
    });

    const filteredRequiredBy = dep.requiredBy.filter(child => {
      const childKey = `${child.namespace}:${child.entity}`;
      return keys.has(childKey);
    });

    subGraph.set(key, {
      repository: dep.repository,
      dependsOn: filteredDependsOn,
      requiredBy: filteredRequiredBy
    });
  }

  return topologicalSort(subGraph, direction);
}
