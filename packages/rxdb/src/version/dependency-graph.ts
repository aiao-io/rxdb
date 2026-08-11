/**
 * @fileoverview 实体依赖图构建与分析
 *
 * 基于 EntityMetadata 的 relations 构建依赖图，用于：
 * - Pull: 父实体 -> 子实体（确保外键引用的数据已存在）
 * - Push: 子实体 -> 父实体（确保外键约束不被违反）
 */

import { RelationKind } from '../entity/metadata-options.interface.js';
import { RxDBError } from '../RxDBError.js';
// 唯一定义收敛到 `VersionManager.interface.ts`。
import type { RepositoryIdentifier } from './VersionManager.interface.js';

interface DependencyGraphEntityRelation {
  kind: RelationKind;
  mappedEntity: string;
  mappedNamespace?: string;
}

interface DependencyGraphEntityMetadata {
  name: string;
  namespace: string;
  relations?: readonly DependencyGraphEntityRelation[];
}

export type { RepositoryIdentifier };

/**
 * Repository 依赖关系
 */
export interface RepositoryDependency {
  /**
   * 当前 repository
   */
  repository: RepositoryIdentifier;

  /**
   * 依赖的 repository（外键指向的实体）
   * Pull 时必须先同步这些实体
   */
  dependsOn: RepositoryIdentifier[];

  /**
   * 被依赖的 repository（指向当前实体的外键）
   * Push 时必须等待这些实体同步完成
   */
  requiredBy: RepositoryIdentifier[];
}

/**
 * 依赖图
 * 键：`{namespace}:{entity}`。
 */
export type DependencyGraph = Map<string, RepositoryDependency>;

/**
 * 构建依赖图
 *
 * @param entities - 实体元数据数组
 * @returns 依赖图
 *
 * @example
 * ```ts
 * const entities = entityManager.getEntities();
 * const graph = buildDependencyGraph(entities);
 *
 * // 查询 Todo 的依赖
 * const todoDep = graph.get('public:Todo');
 * console.log(todoDep.dependsOn); // [{ namespace: 'public', entity: 'User' }]
 * ```
 */
export function buildDependencyGraph(entities: readonly DependencyGraphEntityMetadata[]): DependencyGraph {
  const graph: DependencyGraph = new Map();

  // 第一遍：创建所有节点，分析直接依赖
  for (const entity of entities) {
    const key = `${entity.namespace}:${entity.name}`;
    const dep: RepositoryDependency = {
      repository: { namespace: entity.namespace, entity: entity.name },
      dependsOn: [],
      requiredBy: []
    };

    // 分析关系，找出外键依赖
    if (entity.relations) {
      for (const relation of entity.relations) {
        // MANY_TO_ONE 和 ONE_TO_ONE 关系中，外键存储在当前实体侧
        if (relation.kind === RelationKind.MANY_TO_ONE || relation.kind === RelationKind.ONE_TO_ONE) {
          const mappedEntity = relation.mappedEntity;
          const mappedNamespace = relation.mappedNamespace || entity.namespace;

          dep.dependsOn.push({
            namespace: mappedNamespace,
            entity: mappedEntity
          });
        }
      }
    }

    graph.set(key, dep);
  }

  // 第二遍：反向填充 requiredBy
  for (const dep of graph.values()) {
    for (const parent of dep.dependsOn) {
      const parentDep = graph.get(`${parent.namespace}:${parent.entity}`);
      if (parentDep) {
        parentDep.requiredBy.push(dep.repository);
      }
    }
  }

  // 检测循环依赖
  detectCycles(graph);

  return graph;
}

/**
 * 检测循环依赖
 *
 * 注意：自引用（self-reference）不算循环依赖，因为树形结构是合法的
 * 例如：RxDBBranch -> RxDBBranch (parent-child 关系)
 *
 * @param graph - 依赖图
 * @throws {RxDBError} 如果检测到循环依赖
 *
 * @example
 * ```ts
 * // 抛出错误示例：
 * // User -> Profile -> User (循环依赖)
 * detectCycles(graph); // 抛出 RxDBError
 *
 * // 允许的情况：
 * // RxDBBranch -> RxDBBranch (自引用，树形结构)
 * ```
 */
export function detectCycles(graph: DependencyGraph): void {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(key: string): boolean {
    visited.add(key);
    recStack.add(key);
    path.push(key);

    const dep = graph.get(key);
    if (!dep) {
      // 悬挂依赖：回滚本次入栈再退出。漏掉回滚会把该 key 永久留在 recStack 里，
      // 后续任何真实路径再指向它都会被判成循环依赖（误报）。
      recStack.delete(key);
      path.pop();
      return false;
    }

    for (const parent of dep.dependsOn) {
      const parentKey = `${parent.namespace}:${parent.entity}`;

      // 跳过自引用（树形结构）
      if (parentKey === key) {
        continue;
      }

      if (!visited.has(parentKey)) {
        if (dfs(parentKey)) return true;
      } else if (recStack.has(parentKey)) {
        // 找到循环依赖
        const cycleStart = path.indexOf(parentKey);
        const cycle = [...path.slice(cycleStart), parentKey];
        throw new RxDBError(`Circular dependency detected: ${cycle.join(' -> ')}`);
      }
    }

    recStack.delete(key);
    path.pop();
    return false;
  }

  for (const key of graph.keys()) {
    if (!visited.has(key)) {
      dfs(key);
    }
  }
}

/**
 * 获取 repository 的所有依赖（包括间接依赖）
 *
 * 注意：自引用会被跳过，避免无限递归
 *
 * @param namespace - 命名空间
 * @param entity - 实体名称
 * @param graph - 依赖图
 * @returns 所有依赖的 repository（拓扑排序，父在前）
 *
 * @example
 * ```ts
 * // Comment -> Todo -> User
 * const deps = getAllDependencies('public', 'Comment', graph);
 * // 返回: [User, Todo, Comment]
 * ```
 */
export function getAllDependencies(namespace: string, entity: string, graph: DependencyGraph): RepositoryIdentifier[] {
  const key = `${namespace}:${entity}`;
  const dep = graph.get(key);
  if (!dep) {
    throw new RxDBError(`Repository ${key} not found in dependency graph`);
  }

  const result: RepositoryIdentifier[] = [];
  const visited = new Set<string>();

  function collect(currentKey: string): void {
    if (visited.has(currentKey)) return;
    visited.add(currentKey);

    const currentDep = graph.get(currentKey);
    if (!currentDep) return;

    // 先递归收集依赖的实体
    for (const parent of currentDep.dependsOn) {
      const parentKey = `${parent.namespace}:${parent.entity}`;

      // 跳过自引用（树形结构）
      if (parentKey === currentKey) {
        continue;
      }

      collect(parentKey);
    }

    // 再添加当前实体
    result.push(currentDep.repository);
  }

  collect(key);
  return result;
}

/**
 * 获取 repository 的所有被依赖方（包括间接被依赖）
 *
 * 注意：自引用会被跳过，避免无限递归
 *
 * @param namespace - 命名空间
 * @param entity - 实体名称
 * @param graph - 依赖图
 * @returns 所有被依赖的 repository（拓扑排序，子在前）
 *
 * @example
 * ```ts
 * // User <- Todo <- Comment
 * const requiredBy = getAllRequiredBy('public', 'User', graph);
 * // 返回: [Comment, Todo, User]
 * ```
 */
export function getAllRequiredBy(namespace: string, entity: string, graph: DependencyGraph): RepositoryIdentifier[] {
  const key = `${namespace}:${entity}`;
  const dep = graph.get(key);
  if (!dep) {
    throw new RxDBError(`Repository ${key} not found in dependency graph`);
  }

  const result: RepositoryIdentifier[] = [];
  const visited = new Set<string>();

  function collect(currentKey: string): void {
    if (visited.has(currentKey)) return;
    visited.add(currentKey);

    const currentDep = graph.get(currentKey);
    if (!currentDep) return;

    // 先递归收集被依赖的实体
    for (const child of currentDep.requiredBy) {
      const childKey = `${child.namespace}:${child.entity}`;

      // 跳过自引用（树形结构）
      if (childKey === currentKey) {
        continue;
      }

      collect(childKey);
    }

    // 再添加当前实体
    result.push(currentDep.repository);
  }

  collect(key);
  return result;
}

/**
 * 获取 repository 的直接父实体（一层依赖）
 *
 * @param namespace - 命名空间
 * @param entity - 实体名称
 * @param graph - 依赖图
 * @returns 直接父实体列表
 */
export function getDirectParents(namespace: string, entity: string, graph: DependencyGraph): RepositoryIdentifier[] {
  const key = `${namespace}:${entity}`;
  const dep = graph.get(key);
  if (!dep) {
    throw new RxDBError(`Repository ${key} not found in dependency graph`);
  }
  return dep.dependsOn;
}

/**
 * 获取 repository 的直接子实体（一层被依赖）
 *
 * @param namespace - 命名空间
 * @param entity - 实体名称
 * @param graph - 依赖图
 * @returns 直接子实体列表
 */
export function getDirectChildren(namespace: string, entity: string, graph: DependencyGraph): RepositoryIdentifier[] {
  const key = `${namespace}:${entity}`;
  const dep = graph.get(key);
  if (!dep) {
    throw new RxDBError(`Repository ${key} not found in dependency graph`);
  }
  return dep.requiredBy;
}
