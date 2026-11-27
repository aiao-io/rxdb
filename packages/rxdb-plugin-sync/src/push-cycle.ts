/**
 * @fileoverview 外键成环时的推送切批（US-038）
 *
 * 环上的仓库在同一个相位里一起推：互相引用的行放进同一次 `mergeChanges`，断环边上的外键先写空、同一请求里再补写。
 */
import { type RemoteDeferredForeignKey, type RepositoryIdentifier, repositoryKey } from '@aiao/rxdb';
import type { DependencyForeignKey } from './dependency-graph.js';

/** 环内一个要推的条目 */
export interface CycleBatchEntry {
  /** 所属仓库 */
  readonly repository: RepositoryIdentifier;
  /** 行 id */
  readonly entityId: string;
  /** 目标分支：一次 `mergeChanges` 只有一个目标分支 */
  readonly branchId: string;
  /** 本次写下的值：新建是整行，修改是改动的字段，删除为 `null` */
  readonly values: Readonly<Record<string, unknown>> | null;
}

/** 一次 `mergeChanges` 要发的条目与延迟外键 */
export interface CycleBatch<T extends CycleBatchEntry> {
  readonly branchId: string;
  /** 按传入的顺序（环的成员顺序） */
  readonly entries: readonly T[];
  /** 本批确有指向同批行的非空值的断环外键；为空时不需要先写空、再补写 */
  readonly deferredForeignKeys: readonly RemoteDeferredForeignKey[];
}

/**
 * 把环内一个相位的条目切成批
 *
 * @param entries - 环上全部仓库这一相位的条目，按环的成员顺序
 * @param cycleEdges - 环内的外键（两端都在环上）
 * @param breakEdges - 断环边
 * @param batchSize - 一批最多几个条目
 * @returns 按分支、再按组装好的批
 *
 * @remarks
 * - 一个条目的环内外键值等于同批另一个条目的行 id，两者并进同一组（并查集）。同一组不拆到两次请求：
 *   拆开之后，先到的那一半要么撞外键，要么得先写空、却等不到同一请求里的补写。
 * - 按 `batchSize` 贪心装批，装不下就开新批；单组超过上限就单独成一批。
 * - 延迟外键只在本批确有指向同批行的非空值时才带：指向远端早已有的行、或为空的外键照常写。
 * - 按认得出被引用行的外键（{@link DependencyForeignKey.referencedIdProperty}）并组：关系外键，与引用了 `id`
 *   的复合外键（只由复合外键成的环也一样）。复合外键引用的是别的唯一列时认不出被引用的行，不参与并组。
 */
export function planCycleBatches<T extends CycleBatchEntry>(
  entries: readonly T[],
  cycleEdges: readonly DependencyForeignKey[],
  breakEdges: readonly DependencyForeignKey[],
  batchSize: number
): CycleBatch<T>[] {
  const branches = new Map<string, T[]>();
  for (const entry of entries) branches.set(entry.branchId, [...(branches.get(entry.branchId) ?? []), entry]);
  return [...branches].flatMap(([branchId, branchEntries]) =>
    packGroups(groupReferencing(branchEntries, cycleEdges), batchSize).map(batch => ({
      branchId,
      entries: batch,
      deferredForeignKeys: deferredForeignKeysOf(batch, breakEdges)
    }))
  );
}

const rowKey = (repository: RepositoryIdentifier, entityId: string): string =>
  `${repositoryKey(repository)}:${entityId}`;

/** 互相引用的条目并成组，组按最早的条目排序，组内保持原顺序 */
function groupReferencing<T extends CycleBatchEntry>(
  entries: readonly T[],
  edges: readonly DependencyForeignKey[]
): T[][] {
  const parent = entries.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) index = parent[index] = parent[parent[index]];
    return index;
  };
  const indexByRow = new Map(entries.map((entry, index) => [rowKey(entry.repository, entry.entityId), index]));
  for (const [index, entry] of entries.entries()) {
    for (const target of referencedIndexes(entry, edges, indexByRow)) {
      const [a, b] = [find(index), find(target)];
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const groups = new Map<number, T[]>();
  for (const [index, entry] of entries.entries()) groups.set(find(index), [...(groups.get(find(index)) ?? []), entry]);
  return [...groups.values()];
}

/** 一个条目的环内外键指向的、同在这些条目里的行 */
function referencedIndexes(
  entry: CycleBatchEntry,
  edges: readonly DependencyForeignKey[],
  indexByRow: ReadonlyMap<string, number>
): number[] {
  return edges.flatMap(edge => {
    const target = referencedRowKey(entry, edge);
    const index = target === undefined ? undefined : indexByRow.get(target);
    return index === undefined ? [] : [index];
  });
}

/** 这个条目经这条外键引用的行；外键不在它这一侧、认不出被引用的行或本次没写非空值时为 `undefined` */
function referencedRowKey(entry: CycleBatchEntry, edge: DependencyForeignKey): string | undefined {
  if (edge.referencedIdProperty === undefined) return undefined;
  if (repositoryKey(edge.from) !== repositoryKey(entry.repository)) return undefined;
  const value = entry.values?.[edge.referencedIdProperty];
  return value === null || value === undefined ? undefined : rowKey(edge.to, String(value));
}

/** 贪心装批：一组不拆开，装不下就开新批 */
function packGroups<T>(groups: readonly T[][], batchSize: number): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  for (const group of groups) {
    if (current.length > 0 && current.length + group.length > batchSize) {
      batches.push(current);
      current = [];
    }
    current = [...current, ...group];
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * 本批要先写空、再补写的外键：断环边指向同批的行时，这条外键上本次写了非空值的可空属性；去重、按出现顺序
 *
 * @remarks
 * 关系外键的可空属性就是存着被引用行 id 的那一列；复合外键按 `MATCH SIMPLE` 任一列为空就不检查，
 * 置空它写了值的可空列都成立。
 */
function deferredForeignKeysOf(
  batch: readonly CycleBatchEntry[],
  breakEdges: readonly DependencyForeignKey[]
): RemoteDeferredForeignKey[] {
  const rows = new Set(batch.map(entry => rowKey(entry.repository, entry.entityId)));
  const deferred = new Map<string, RemoteDeferredForeignKey>();
  for (const entry of batch) {
    for (const edge of breakEdges) {
      const target = referencedRowKey(entry, edge);
      if (target === undefined || !rows.has(target)) continue;
      for (const key of writtenNullableProperties(entry, edge)) {
        deferred.set(`${key.namespace}:${key.entity}:${key.property}`, key);
      }
    }
  }
  return [...deferred.values()];
}

/** 这条外键上本条目写了非空值的可空属性 */
function writtenNullableProperties(entry: CycleBatchEntry, edge: DependencyForeignKey): RemoteDeferredForeignKey[] {
  const { namespace, entity } = entry.repository;
  return edge.nullableProperties
    .filter(property => entry.values?.[property] !== null && entry.values?.[property] !== undefined)
    .map(property => ({ namespace, entity, property }));
}
