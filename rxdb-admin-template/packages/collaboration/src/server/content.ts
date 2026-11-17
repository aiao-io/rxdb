import { applyChanges, revertChanges } from '../changes.js';
import { demand, type ChangeSet, type CommitMeta, type Records, type StoredCandidate } from '../model.js';
import { rowAt } from '../records.js';
import { noFacts, type Facts, type MergeInputs, type Plan } from './plan.js';
import type { CommitStore, Link } from './store.js';

/**
 * 共享分支在合并提交 `until` 时的记录：从 `head` 时的记录 `rows` 出发，由新到旧反向应用其间各合并提交的 `inversePatch`。
 * `rows` 被就地修改；`ids` 给出时 `rows` 与变更都只含这些记录。`until` 为 null 表示第一次合并之前，没有记录。
 * `until` 不在共享分支上（找不到可信共同起点）时返回 null。
 */
async function revertShared(
  store: CommitStore,
  rows: Records,
  head: string | null,
  until: string | null,
  ids?: readonly string[]
): Promise<Records | null> {
  if (until === null) return {};
  const path = await store.path(head, until);
  if (!path.reached) return null;
  const changes = await store.changes(
    path.links.map(link => link.id),
    ids
  );
  for (const link of path.links) revertChanges(rows, changes.get(link.id) ?? []);
  return rows;
}
/** 把任务分支上的提交由旧到新应用到 `rows` 上（就地修改）。 */
function forward(rows: Records, links: readonly Link[], changes: ReadonlyMap<string, ChangeSet[]>): Records {
  for (const link of [...links].reverse()) applyChanges(rows, changes.get(link.id) ?? []);
  return rows;
}
/** 在 `rows`（共同起点时的记录）上应用 `source` 到 `base`（不含）之间的任务提交；`source` 不经过 `base` 时返回 null。 */
async function forwardTask(
  store: CommitStore,
  rows: Records,
  source: string | null,
  base: string | null,
  ids?: readonly string[]
): Promise<Records | null> {
  const path = await store.path(source, base);
  if (!path.reached) return null;
  const changes = await store.changes(
    path.links.map(link => link.id),
    ids
  );
  return forward(rows, path.links, changes);
}

/** 共享分支在合并提交 `commit` 时的记录（可只取 `ids`）：当前共享记录加上其后各合并提交的反向变更。找不到时返回 null。 */
export async function sharedRecordsAt(
  store: CommitStore,
  head: string | null,
  commit: string | null,
  ids?: readonly string[]
): Promise<Records | null> {
  if (commit === null) return {};
  return revertShared(store, await store.shared(ids), head, commit, ids);
}
/**
 * 任务分支在提交 `commit` 时的记录（可只取 `ids`）：共同起点 `base` 时的共享记录，加上任务在 `base` 之后的各提交变更。
 * 找不到可信共同起点时返回 null。
 */
export async function taskRecordsAt(
  store: CommitStore,
  head: string | null,
  base: string | null,
  commit: string | null,
  ids?: readonly string[]
): Promise<Records | null> {
  const start = await sharedRecordsAt(store, head, base, ids);
  return start && forwardTask(store, start, commit, base, ids);
}
/** 一个提交的完整记录：合并提交取共享分支在它那一刻的记录；任务提交取它最近的合并提交祖先的记录加上其间的任务变更。 */
export async function commitRecords(store: CommitStore, head: string | null, meta: CommitMeta): Promise<Records> {
  if (meta.mergeSource !== undefined) {
    const shared = await sharedRecordsAt(store, head, meta.id);
    demand(shared, 'ancestry', '找不到可信共同起点');
    return shared;
  }
  const lineage = await store.lineage(meta.id);
  const start = await sharedRecordsAt(store, head, lineage.anchor);
  demand(start, 'ancestry', '找不到可信共同起点');
  const changes = await store.changes(lineage.links.map(link => link.id));
  return forward(start, lineage.links, changes);
}
/** 候选最终结果的记录（可只取 `ids`）：它生成时的目标版本 T 的记录加上它存储的变更。 */
export async function candidateRecords(
  store: CommitStore,
  head: string | null,
  candidate: StoredCandidate,
  ids?: readonly string[]
): Promise<Records> {
  const target = await sharedRecordsAt(store, head, candidate.target, ids);
  demand(target, 'ancestry', '找不到可信共同起点');
  const wanted = ids && new Set(ids);
  return applyChanges(
    target,
    wanted ? candidate.changes.filter(change => wanted.has(change.entityId)) : candidate.changes
  );
}
/**
 * 三方合并输入：T 是共享分支当前的完整记录；B 由 T 反向应用共享分支上 `base` 之后各合并提交的 `inversePatch` 得到；
 * S 由 B 加上任务分支在 `base` 之后的变更得到。成本只与记录数及 `base` 以来的改动有关，与提交总数无关。
 * `base` 不在共享分支上、或 `source` 不经过 `base` 时返回 null。
 */
async function mergeInputs(
  store: CommitStore,
  head: string | null,
  base: string | null,
  source: string
): Promise<MergeInputs | null> {
  const target = await store.shared();
  const start = await revertShared(store, structuredClone(target), head, base);
  const result = start && (await forwardTask(store, structuredClone(start), source, base));
  return result && { base: start, source: result, target };
}

/** 按 {@link Plan} 读取命令需要的数据；每种命令只做它声明过的读取。 */
export async function preload(store: CommitStore, plan: Plan): Promise<Facts> {
  if (plan.type === 'upload') return { ...noFacts, existing: await store.commits(plan.ids), path: new Set() };
  if (plan.type === 'fork') {
    const existing = await store.commits(plan.ids);
    const path = await store.path(plan.head, plan.base);
    const ids = path.links.map(link => link.id);
    if (path.reached && plan.base !== null) ids.push(plan.base);
    return { ...noFacts, existing, path: new Set(ids) };
  }
  if (plan.type === 'inputs') {
    const inputs = await mergeInputs(store, plan.head, plan.base, plan.source);
    const previous: Record<string, Records> = {};
    for (const { candidate, recordIds } of plan.reopen)
      previous[candidate.id] = await candidateRecords(store, plan.head, candidate, recordIds);
    return { ...noFacts, inputs, previous };
  }
  if (plan.type === 'anchor') return { ...noFacts, anchor: await anchorRows(store, plan) };
  if (plan.type === 'presence') return { ...noFacts, presence: await presenceFacts(store, plan) };
  return noFacts;
}
async function anchorRows(store: CommitStore, plan: Extract<Plan, { type: 'anchor' }>) {
  const { candidate, recordId, head } = plan;
  const ids = [recordId];
  const target = await sharedRecordsAt(store, head, candidate.target, ids);
  const source = await taskRecordsAt(store, head, candidate.base, candidate.source, ids);
  demand(target && source, 'ancestry', '找不到可信共同起点');
  const result = applyChanges(
    structuredClone(target),
    candidate.changes.filter(change => change.entityId === recordId)
  );
  return { candidate: rowAt(result, recordId), source: rowAt(source, recordId), target: rowAt(target, recordId) };
}
async function presenceFacts(store: CommitStore, plan: Extract<Plan, { type: 'presence' }>) {
  const { head, recordId, task } = plan;
  const shared = Object.hasOwn(await store.shared([recordId]), recordId);
  if (shared || !task) return { shared, task: false };
  const rows = await taskRecordsAt(store, head, task.base, task.head, [recordId]);
  return { shared, task: !!rows && Object.hasOwn(rows, recordId) };
}
