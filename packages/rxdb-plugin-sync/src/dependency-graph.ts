/**
 * @fileoverview 实体依赖图构建与分析
 *
 * 基于 EntityMetadata 的外键（关系与实体级复合外键）构建依赖图，用于：
 * - Pull: 父实体 -> 子实体（确保外键引用的数据已存在）
 * - Push: 子实体 -> 父实体（确保外键约束不被违反）
 *
 * 外键可以成环（例如双向一对一，US-038）：图照常建好，环上的仓库共用一份 {@link DependencyCycle}，
 * 排序把环当作一个单元，推拉按环调度。
 */

import { RelationKind, type RepositoryIdentifier, repositoryKey, RxDBError } from '@aiao/rxdb';

/** 依赖图读到的一条关系 */
interface DependencyGraphEntityRelation {
  kind: RelationKind;
  mappedEntity: string;
  mappedNamespace?: string;
  /** 外键是否可空：可空的外键能先写空、再补写，用来断环 */
  nullable?: boolean;
}

/** 依赖图读到的一条实体级外键 */
interface DependencyGraphForeignKey {
  mappedEntity: string;
  mappedNamespace?: string;
  name?: string;
  /** 本侧参与外键的属性 */
  properties?: readonly string[];
}

/**
 * 依赖图读到的实体元数据
 *
 * @remarks
 * 两处都取**合并后**的视图（`EntityMetadata` 上的同名字段）：
 * - `relationMap` 含继承链上的关系。`relations` 只装本类自己声明的那几条，关系声明在父类上时子类的是空的；
 * - `foreignKeys` 是实体级复合外键，同样是一条指向被引用实体的外键。
 */
interface DependencyGraphEntityMetadata {
  name: string;
  namespace: string;
  relationMap: ReadonlyMap<string, DependencyGraphEntityRelation>;
  foreignKeys: readonly DependencyGraphForeignKey[];
  /** 声明的属性：判复合外键里普通属性的可空性 */
  propertyMap?: ReadonlyMap<string, { nullable?: boolean }>;
}

export type { RepositoryIdentifier };

/**
 * 依赖图上的一条外键：`from` 的 `properties` 指向 `to`
 *
 * @remarks
 * 关系外键（多对一、一对一）的属性是 `<关系名>Id`；实体级复合外键是它的全部属性。复合外键按 `MATCH SIMPLE`
 * 判可空：任一属性为空就不检查，所以只要有一个属性可空，这条外键就能先写空、再补写。
 */
export interface DependencyForeignKey {
  /** 持有外键的仓库 */
  readonly from: RepositoryIdentifier;
  /** 被引用的仓库 */
  readonly to: RepositoryIdentifier;
  /** 关系名或复合外键名 */
  readonly name: string;
  /** 本侧参与外键的属性 */
  readonly properties: readonly string[];
  /** 能不能先写空 */
  readonly nullable: boolean;
  /** 先写空时置空的那些属性：`properties` 里可空的那几个 */
  readonly nullableProperties: readonly string[];
}

/**
 * 外键成的环（强连通分量，US-038）
 *
 * @remarks
 * 环上的仓库共用同一个对象。断得开时，断环边上的属性推送时先写空、同一个请求里再补写；排序按去掉断环边之后的图
 * 父在前排成员。断不开（环上全是非空外键，排不出写入顺序）时 `breakEdges` 为 `null`，环上的仓库有待推变更就失败。
 */
export interface DependencyCycle {
  /** 环上的仓库：断得开时按断环之后父在前排列，断不开时按仓库键排序 */
  readonly members: readonly RepositoryIdentifier[];
  /** 断开环的外键；断不开时为 `null` */
  readonly breakEdges: readonly DependencyForeignKey[] | null;
  /** 断不开时的一条环路（仓库键，首尾相同），从最小的仓库键出发；断得开时为空 */
  readonly path: readonly string[];
}

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

  /**
   * 本仓库的外键（指向 `dependsOn` 里的仓库），同一对之间可以有多条
   *
   * @remarks
   * {@link buildDependencyGraph} 总会给出；手写的图可以省略，省略时环上的边一律按非空处理（断不开）。
   */
  foreignKeys?: DependencyForeignKey[];

  /** 所在的环；不在环上时没有（自引用的树不算环） */
  cycle?: DependencyCycle;
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
    const foreignKeys = foreignKeyEdges(entity);
    graph.set(`${entity.namespace}:${entity.name}`, {
      repository: { namespace: entity.namespace, entity: entity.name },
      dependsOn: dedupeTargets(foreignKeys),
      requiredBy: [],
      foreignKeys
    });
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

  // 外键成环：环上的仓库共用一份环的信息（US-038），排序与推拉按它调度，不再整体抛错
  for (const cycle of findDependencyCycles(graph)) {
    for (const member of cycle.members) graph.get(repositoryKey(member))!.cycle = cycle;
  }

  return graph;
}

/** 外键落在本侧的关系：多对一与一对一（一对一两侧都声明时两侧各有一列外键） */
const holdsForeignKey = (relation: DependencyGraphEntityRelation): boolean =>
  relation.kind === RelationKind.MANY_TO_ONE || relation.kind === RelationKind.ONE_TO_ONE;

/**
 * 实体的外键：关系里外键落在本侧的那几种，加上实体级复合外键
 *
 * @param entity - 实体元数据
 * @returns 按声明顺序的外键，关系在前
 */
function foreignKeyEdges(entity: DependencyGraphEntityMetadata): DependencyForeignKey[] {
  const from = { namespace: entity.namespace, entity: entity.name };
  const edge = (
    target: { mappedEntity: string; mappedNamespace?: string },
    name: string,
    properties: readonly string[],
    nullableProperties: readonly string[]
  ): DependencyForeignKey => ({
    from,
    to: { namespace: target.mappedNamespace || entity.namespace, entity: target.mappedEntity },
    name,
    properties,
    nullable: nullableProperties.length > 0,
    nullableProperties
  });

  const edges: DependencyForeignKey[] = [];
  for (const [name, relation] of entity.relationMap) {
    if (!holdsForeignKey(relation)) continue;
    const property = `${name}Id`;
    edges.push(edge(relation, name, [property], relation.nullable === true ? [property] : []));
  }
  for (const [index, foreignKey] of entity.foreignKeys.entries()) {
    const properties = foreignKey.properties ?? [];
    const nullableProperties = properties.filter(property => isNullableProperty(entity, property));
    edges.push(edge(foreignKey, foreignKey.name ?? `foreignKey${index}`, properties, nullableProperties));
  }
  return edges;
}

/** 本侧一个属性可不可空：主键不可空；关系外键看关系的 `nullable`；其余看属性声明 */
function isNullableProperty(entity: DependencyGraphEntityMetadata, property: string): boolean {
  if (property === 'id') return false;
  for (const [name, relation] of entity.relationMap) {
    if (holdsForeignKey(relation) && `${name}Id` === property) return relation.nullable === true;
  }
  return entity.propertyMap?.get(property)?.nullable === true;
}

/** 外键指向的仓库，同一个只记一次，按首次出现的顺序 */
function dedupeTargets(edges: readonly DependencyForeignKey[]): RepositoryIdentifier[] {
  const targets = new Map<string, RepositoryIdentifier>();
  for (const { to } of edges) targets.set(repositoryKey(to), to);
  return [...targets.values()];
}

/**
 * 找出依赖图里外键成的环（US-038）
 *
 * @param graph - 依赖图（`dependsOn` 是边；自引用与指向图外的悬挂依赖不算）
 * @returns 每个两个及以上仓库的强连通分量一份环的信息，按首个成员在图里的顺序
 *
 * @remarks
 * Tarjan 求强连通分量。断环边确定性地选：先只保留非空外键，这时还有环就是断不开；否则把可空外键按
 * （持有方的仓库键，属性）排序逐条加回，加回会成环的就是断环边。shop 夹具的 `User.idCard` ↔ `IdCard.owner`
 * 断的是 `User` 的两条外键（关系与复合外键共用可空的 `idCardId`），成员 `[User, IdCard]`。
 */
export function findDependencyCycles(graph: DependencyGraph): DependencyCycle[] {
  return stronglyConnectedComponents(graph)
    .filter(component => component.length > 1)
    .map(component => analyzeCycle(graph, component));
}

/** Tarjan：强连通分量，成员按访问顺序 */
function stronglyConnectedComponents(graph: DependencyGraph): string[][] {
  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const connect = (key: string): void => {
    index.set(key, index.size);
    lowLink.set(key, index.get(key)!);
    stack.push(key);
    onStack.add(key);
    for (const next of dependencyKeys(graph, key)) {
      if (!index.has(next)) {
        connect(next);
        lowLink.set(key, Math.min(lowLink.get(key)!, lowLink.get(next)!));
      } else if (onStack.has(next)) {
        lowLink.set(key, Math.min(lowLink.get(key)!, index.get(next)!));
      }
    }
    if (lowLink.get(key) !== index.get(key)) return;
    const component: string[] = [];
    for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
      onStack.delete(member);
      component.unshift(member);
      if (member === key) break;
    }
    components.push(component);
  };

  for (const key of graph.keys()) if (!index.has(key)) connect(key);
  return components;
}

/** 一个仓库指向的、在图里的其他仓库 */
function dependencyKeys(graph: DependencyGraph, key: string): string[] {
  return graph
    .get(key)!
    .dependsOn.map(repositoryKey)
    .filter(next => next !== key && graph.has(next));
}

/** 一个强连通分量的断环边、成员顺序与（断不开时的）环路 */
function analyzeCycle(graph: DependencyGraph, component: readonly string[]): DependencyCycle {
  const memberSet = new Set(component);
  const edges = component.flatMap(key =>
    cycleEdgesOf(graph, key).filter(edge => {
      const to = repositoryKey(edge.to);
      return to !== key && memberSet.has(to);
    })
  );
  const kept = edges.filter(edge => !edge.nullable);
  const sortedKeys = [...component].sort();
  const fixedPath = findCyclePath(sortedKeys, kept);
  if (fixedPath) {
    return { members: sortedKeys.map(key => graph.get(key)!.repository), breakEdges: null, path: fixedPath };
  }

  const breakEdges: DependencyForeignKey[] = [];
  const nullable = edges
    .filter(edge => edge.nullable)
    .sort((a, b) => compareText(repositoryKey(a.from), repositoryKey(b.from)) || compareText(a.properties.join(','), b.properties.join(',')));
  for (const edge of nullable) {
    if (reaches(kept, repositoryKey(edge.to), repositoryKey(edge.from))) breakEdges.push(edge);
    else kept.push(edge);
  }
  return { members: parentsFirst(component, kept).map(key => graph.get(key)!.repository), breakEdges, path: [] };
}

/**
 * 环上一个仓库的外键边
 *
 * @remarks
 * 手写的图没有 `foreignKeys`：按 `dependsOn` 补出非空边，这样的环断不开。
 */
function cycleEdgesOf(graph: DependencyGraph, key: string): readonly DependencyForeignKey[] {
  const dependency = graph.get(key)!;
  return (
    dependency.foreignKeys ??
    dependency.dependsOn.map(to => ({
      from: dependency.repository,
      to,
      name: repositoryKey(to),
      properties: [],
      nullable: false,
      nullableProperties: []
    }))
  );
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** 沿 `edges`（from → to）从 `start` 能不能走到 `target` */
function reaches(edges: readonly DependencyForeignKey[], start: string, target: string): boolean {
  const seen = new Set<string>();
  const pending = [start];
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    if (key === target) return true;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const edge of edges) if (repositoryKey(edge.from) === key) pending.push(repositoryKey(edge.to));
  }
  return false;
}

/** 只沿 `edges` 找一条环路：从最小的仓库键出发深度优先，找不到为 `undefined` */
function findCyclePath(sortedKeys: readonly string[], edges: readonly DependencyForeignKey[]): string[] | undefined {
  const next = (key: string) =>
    edges
      .filter(edge => repositoryKey(edge.from) === key)
      .map(edge => repositoryKey(edge.to))
      .sort();
  const done = new Set<string>();
  const walk = (key: string, path: string[]): string[] | undefined => {
    const start = path.indexOf(key);
    if (start !== -1) return [...path.slice(start), key];
    if (done.has(key)) return undefined;
    for (const target of next(key)) {
      const found = walk(target, [...path, key]);
      if (found) return found;
    }
    done.add(key);
    return undefined;
  };
  for (const key of sortedKeys) {
    const found = walk(key, []);
    if (found) return found;
  }
  return undefined;
}

/** 按 `edges`（from 依赖 to）排出父在前的顺序，遇到并列按分量里的原顺序 */
function parentsFirst(component: readonly string[], edges: readonly DependencyForeignKey[]): string[] {
  const order: string[] = [];
  const visit = (key: string): void => {
    if (order.includes(key)) return;
    for (const edge of edges) {
      if (repositoryKey(edge.from) === key) visit(repositoryKey(edge.to));
    }
    order.push(key);
  };
  for (const key of component) visit(key);
  return order;
}

/**
 * 取一组仓库所在的连通分量：沿 `dependsOn` 与 `requiredBy` 双向闭包
 *
 * @param graph - 依赖图
 * @param seeds - 起点仓库的键（`namespace:entity`），必须都在图里
 * @returns 起点及与它们连通的全部仓库的键；未注册的悬挂依赖不进结果
 *
 * @remarks
 * 单仓推送要推整个分量，只补父仓不够：一次提交会把每个仓库的水位线推过它的全部待推变更，
 * 带进来的父仓若有待推删除，它的其他子仓必须先删。
 *
 * @example
 * ```ts
 * // User ← Post → Category
 * collectConnectedRepositories(graph, ['public:Category']); // Set { 'public:Category', 'public:Post', 'public:User' }
 * ```
 */
export function collectConnectedRepositories(graph: DependencyGraph, seeds: Iterable<string>): Set<string> {
  const component = new Set<string>();
  const pending = [...seeds];
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    const dep = graph.get(key);
    if (!dep || component.has(key)) continue;
    component.add(key);
    for (const neighbor of [...dep.dependsOn, ...dep.requiredBy]) pending.push(repositoryKey(neighbor));
  }
  return component;
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
