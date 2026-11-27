/**
 * @fileoverview 外键成环时的拉取（US-038）
 *
 * 环上的行互相引用：一轮拉取在一个本地事务里落库，提交时才检查外键（本地外键都是延迟检查的）。
 * 一页如果在环中间截断，引用的另一半要么在本页、要么在本地，否则提交撞外键——这里续拉补齐。
 */
import {
  getEntityMetadata,
  getSyncType,
  type RemoteChange,
  type RepositoryIdentifier,
  repositoryKey,
  resolvePullIneligibility,
  type RxDB
} from '@aiao/rxdb';
import type { DependencyCycle, DependencyForeignKey, DependencyGraph } from './dependency-graph.js';

/** {@link closeCycleReferences} 需要的远端与本地读 */
export interface CycleClosureSource {
  /** 续拉一页：这个仓库 `sinceId` 之后的变更，按 id 升序 */
  fetchAfter(repository: RepositoryIdentifier, sinceId: number): Promise<RemoteChange[]>;
  /** 本地已有哪些行 */
  existingIds(repository: RepositoryIdentifier, ids: readonly string[]): Promise<ReadonlySet<string>>;
}

/**
 * 一次补齐最多续拉几页（每页是单仓的拉取上限，默认 1000 行）
 *
 * @remarks
 * 补得齐的环几页之内就补齐了：批量拉取交回的是按 id 连续的一段，环内引用的另一半要么已经在这一段里，
 * 要么落在同一个事务稍后的几行。补不齐的（被引用的行远端看不到，例如被行级安全挡住、在别的分支上）
 * 续拉多少页都找不到：没有上限就会把被引用仓库此后的整段远端历史拉进内存、每拉一页都把整轮重算一遍，
 * 最后照样撞外键。到了上限与远端拉空同样处理：原样交回，让提交如实撞外键。
 */
export const MAX_CYCLE_CLOSURE_PAGES = 16;

/** 环内一条外键，带上本侧存着被引用行 id 的那个属性 */
type ResolvableEdge = DependencyForeignKey & { readonly referencedIdProperty: string };

const isResolvable = (edge: DependencyForeignKey): edge is ResolvableEdge => edge.referencedIdProperty !== undefined;

/**
 * 环上仓库之间认得出被引用行的外键（{@link DependencyForeignKey.referencedIdProperty}）
 *
 * @remarks
 * 关系外键与引用了 `id` 的复合外键都算；两者共用一列时引用的是同一行，缺的行只记一次。
 */
function cycleEdges(graph: DependencyGraph): ResolvableEdge[] {
  const edges: ResolvableEdge[] = [];
  for (const node of graph.values()) {
    const cycle = node.cycle;
    if (!cycle) continue;
    const members = new Set(cycle.members.map(repositoryKey));
    for (const edge of node.foreignKeys ?? []) {
      if (isResolvable(edge) && members.has(repositoryKey(edge.to))) edges.push(edge);
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
  edges: readonly ResolvableEdge[]
): Map<string, { repository: RepositoryIdentifier; ids: Set<string> }> {
  const rows = finalRows(changes);
  const missing = new Map<string, { repository: RepositoryIdentifier; ids: Set<string> }>();
  for (const [key, row] of rows) {
    if (row.deleted) continue;
    for (const edge of edges) {
      if (!key.startsWith(`${repositoryKey(edge.from)}:`)) continue;
      const value = row.values.get(edge.referencedIdProperty);
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
 * @returns 补齐之后的变更；远端已经拉空、或续拉到 {@link MAX_CYCLE_CLOSURE_PAGES} 页还缺的，原样交回，让提交如实撞外键
 *
 * @remarks
 * 环上一行引用的另一行，既不在这一轮、本地也没有，就从被引用的仓库续拉下一页，直到都找得到、远端拉空或到了页数上限为止。
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
  // 每个仓库从哪儿续拉：这一轮里它最大的变更 id，一条都没有就是它的起点水位线。随续拉逐页推进，
  // 不每次从整轮里筛一遍再展开成 `Math.max` 的参数（变更多了会栈溢出）
  const cursors = new Map(sinceIds);
  const advance = (more: readonly RemoteChange[]) => {
    for (const change of more) {
      const key = `${change.namespace}:${change.entity}`;
      if (change.id > (cursors.get(key) ?? 0)) cursors.set(key, change.id);
    }
  };
  advance(round);
  let pages = 0;
  for (;;) {
    const missing = missingReferences(round, edges);
    let fetched = false;
    for (const { repository, ids } of missing.values()) {
      if (pages >= MAX_CYCLE_CLOSURE_PAGES) return round;
      const existing = await source.existingIds(repository, [...ids]);
      if ([...ids].every(id => existing.has(id))) continue;
      pages += 1;
      const page = await source.fetchAfter(repository, cursors.get(repositoryKey(repository)) ?? 0);
      const more = page.filter(change => !seen.has(change.id));
      for (const change of more) seen.add(change.id);
      advance(more);
      if (more.length > 0) {
        round = [...round, ...more].sort((a, b) => a.id - b.id);
        fetched = true;
      }
    }
    if (!fetched) return round;
  }
}

/**
 * 环上的这个成员为什么让环补不齐（US-038）
 *
 * @param rxdb - RxDB 实例
 * @param repository - 环成员
 * @param bucketed - 远端把它登记为按授权分区同步
 * @returns 补不齐的原因；补得齐时为 `undefined`
 *
 * @remarks
 * - 按条件（`Filter`）或按授权分区同步的仓库逐仓、逐区拉取，凑不进同一个本地事务；
 * - 不能拉取（只存本地）或同步关着（`RxDBSync.enabled = false`）的仓库不在批量拉取的事务里：续拉把它的行补进这一轮、
 *   判定闭合，落库却只写可拉的成员，延迟外键在提交时失败、整批回滚，下一次拉取重演同一序列，永远拉不下来。
 */
export async function cycleMemberPullDetail(
  rxdb: RxDB,
  repository: RepositoryIdentifier,
  bucketed: boolean
): Promise<string | undefined> {
  const key = repositoryKey(repository);
  const metadata = rxdb.config.entities
    .map(EntityType => getEntityMetadata(EntityType))
    .find(item => item.namespace === repository.namespace && item.name === repository.entity);
  if (!metadata) return undefined;
  const syncType = getSyncType(metadata, rxdb.entitySync);
  if (bucketed || syncType === 'filter') return `${key} is synced by filter or by bucket`;
  const ineligible = await resolvePullIneligibility(rxdb, repository.namespace, repository.entity, syncType);
  return ineligible === undefined ? undefined : `${key} is not pulled into the local database: ${ineligible}`;
}

/**
 * 拉取补不齐的环
 *
 * @param graph - 依赖图
 * @param detailOf - 一个环成员为什么让环补不齐（见 {@link cycleMemberPullDetail}）；补得齐时为 `undefined`
 * @returns 每个补不齐的环、它的第一个这样的成员与原因
 *
 * @remarks
 * 这样的环整个以 `pull-unsupported-member` 失败，下游被依赖闸门挡下，环外照常拉取。
 */
export async function unsupportedPullCycles(
  graph: DependencyGraph,
  detailOf: (repository: RepositoryIdentifier) => Promise<string | undefined>
): Promise<{ cycle: DependencyCycle; member: RepositoryIdentifier; detail: string }[]> {
  const cycles = new Set<DependencyCycle>();
  for (const node of graph.values()) if (node.cycle) cycles.add(node.cycle);
  const found: { cycle: DependencyCycle; member: RepositoryIdentifier; detail: string }[] = [];
  for (const cycle of cycles) {
    const unsupported = await firstUnsupportedMember(cycle.members, detailOf);
    if (unsupported) found.push({ cycle, ...unsupported });
  }
  return found;
}

/** 依次判环成员，交出第一个补不齐的成员与原因 */
async function firstUnsupportedMember(
  members: readonly RepositoryIdentifier[],
  detailOf: (repository: RepositoryIdentifier) => Promise<string | undefined>
): Promise<{ member: RepositoryIdentifier; detail: string } | undefined> {
  for (const member of members) {
    const detail = await detailOf(member);
    if (detail !== undefined) return { member, detail };
  }
  return undefined;
}
