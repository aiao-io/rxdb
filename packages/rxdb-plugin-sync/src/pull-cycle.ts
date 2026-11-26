/**
 * @fileoverview 外键成环时的拉取（US-038）
 *
 * 环上的行互相引用：一轮拉取在一个本地事务里落库，提交时才检查外键（本地外键都是延迟检查的）。
 * 一页如果在环中间截断，引用的另一半要么在本页、要么在本地，否则提交撞外键——这里续拉补齐。
 */
import { type RemoteChange, type RepositoryIdentifier, repositoryKey } from '@aiao/rxdb';
import type { DependencyCycle, DependencyForeignKey, DependencyGraph } from './dependency-graph.js';

/** {@link closeCycleReferences} 需要的远端与本地读 */
export interface CycleClosureSource {
  /** 续拉一页：这个仓库 `sinceId` 之后的变更，按 id 升序 */
  fetchAfter(repository: RepositoryIdentifier, sinceId: number): Promise<RemoteChange[]>;
  /** 本地已有哪些行 */
  existingIds(repository: RepositoryIdentifier, ids: readonly string[]): Promise<ReadonlySet<string>>;
}

/** 环上仓库之间的单属性外键（关系外键）：复合外键与它共用那一列，不另算 */
function cycleEdges(graph: DependencyGraph): DependencyForeignKey[] {
  const edges: DependencyForeignKey[] = [];
  for (const node of graph.values()) {
    const cycle = node.cycle;
    if (!cycle) continue;
    const members = new Set(cycle.members.map(repositoryKey));
    for (const edge of node.foreignKeys ?? []) {
      if (edge.properties.length === 1 && members.has(repositoryKey(edge.to))) edges.push(edge);
    }
  }
  return edges;
}

const rowKey = (namespace: string, entity: string, id: string): string => `${namespace}:${entity}:${id}`;

/**
 * 这一轮拉到的行最后的样子：每行最后一次写下的外键值，删掉的行标为删除
 *
 * @returns 行键 → 外键属性 → 值；删除的行没有值、`deleted` 为 `true`
 */
function finalRows(changes: readonly RemoteChange[]): Map<string, { deleted: boolean; values: Map<string, unknown> }> {
  const rows = new Map<string, { deleted: boolean; values: Map<string, unknown> }>();
  for (const change of [...changes].sort((a, b) => a.id - b.id)) {
    const key = rowKey(change.namespace, change.entity, String(change.entityId));
    const row = rows.get(key) ?? { deleted: false, values: new Map<string, unknown>() };
    if (change.type === 'DELETE') {
      rows.set(key, { deleted: true, values: new Map() });
      continue;
    }
    row.deleted = false;
    for (const [property, value] of Object.entries((change.patch ?? {}) as Record<string, unknown>)) {
      row.values.set(property, value);
    }
    rows.set(key, row);
  }
  return rows;
}

/** 这一轮里环内引用了、却既不在这一轮也不在（已判过的）本地的行：仓库键 → 行 id */
function missingReferences(
  changes: readonly RemoteChange[],
  edges: readonly DependencyForeignKey[]
): Map<string, { repository: RepositoryIdentifier; ids: Set<string> }> {
  const rows = finalRows(changes);
  const missing = new Map<string, { repository: RepositoryIdentifier; ids: Set<string> }>();
  for (const [key, row] of rows) {
    if (row.deleted) continue;
    for (const edge of edges) {
      if (!key.startsWith(`${repositoryKey(edge.from)}:`)) continue;
      const value = row.values.get(edge.properties[0]);
      if (value === null || value === undefined) continue;
      const target = rows.get(rowKey(edge.to.namespace, edge.to.entity, String(value)));
      if (target && !target.deleted) continue;
      const entry = missing.get(repositoryKey(edge.to)) ?? { repository: edge.to, ids: new Set<string>() };
      entry.ids.add(String(value));
      missing.set(repositoryKey(edge.to), entry);
    }
  }
  return missing;
}

/**
 * 补齐一轮拉取里环内的引用（US-038）
 *
 * @param graph - 依赖图
 * @param changes - 这一轮拉到的变更
 * @param sinceIds - 每个仓库这一轮的起点水位线（仓库键 → id）
 * @param source - 续拉与本地查询
 * @returns 补齐之后的变更；远端已经拉空还缺的，原样交回，让提交如实撞外键
 *
 * @remarks
 * 环上一行引用的另一行，既不在这一轮、本地也没有，就从被引用的仓库续拉下一页，直到都找得到或远端拉空为止。
 * 续拉的变更并进这一轮，水位线随之推到续拉到的最大 id。不在环上的引用不归这里管：父先子后的顺序已经保证了。
 */
export async function closeCycleReferences(
  graph: DependencyGraph,
  changes: readonly RemoteChange[],
  sinceIds: ReadonlyMap<string, number>,
  source: CycleClosureSource
): Promise<RemoteChange[]> {
  const edges = cycleEdges(graph);
  if (edges.length === 0) return [...changes];

  let round = [...changes];
  const seen = new Set(round.map(change => change.id));
  for (;;) {
    const missing = missingReferences(round, edges);
    let fetched = false;
    for (const { repository, ids } of missing.values()) {
      const existing = await source.existingIds(repository, [...ids]);
      if ([...ids].every(id => existing.has(id))) continue;
      const repoKey = repositoryKey(repository);
      const fetchedIds = round
        .filter(change => `${change.namespace}:${change.entity}` === repoKey)
        .map(change => change.id);
      const sinceId = fetchedIds.length > 0 ? Math.max(...fetchedIds) : (sinceIds.get(repoKey) ?? 0);
      const more = (await source.fetchAfter(repository, sinceId)).filter(change => !seen.has(change.id));
      for (const change of more) seen.add(change.id);
      if (more.length > 0) {
        round = [...round, ...more].sort((a, b) => a.id - b.id);
        fetched = true;
      }
    }
    if (!fetched) return round;
  }
}

/**
 * 拉取补不齐的环：环上有按条件（`Filter`）或按授权分区同步的成员
 *
 * @param graph - 依赖图
 * @param unsupported - 判定一个仓库是不是这两种同步之一
 * @returns 每个这样的环与它的一个不支持的成员
 *
 * @remarks
 * 这两种仓库各自逐仓、逐区拉取，凑不进同一个本地事务，也补不齐环内的引用；整个环以 `pull-unsupported-member`
 * 失败，下游被依赖闸门挡下，环外照常拉取。
 */
export function unsupportedPullCycles(
  graph: DependencyGraph,
  unsupported: (repository: RepositoryIdentifier) => boolean
): { cycle: DependencyCycle; member: RepositoryIdentifier }[] {
  const cycles = new Set<DependencyCycle>();
  for (const node of graph.values()) if (node.cycle) cycles.add(node.cycle);
  return [...cycles].flatMap(cycle => {
    const member = cycle.members.find(unsupported);
    return member ? [{ cycle, member }] : [];
  });
}
