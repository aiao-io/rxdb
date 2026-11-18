import { applyChanges } from '../changes.js';
import { candidateRecords, sharedRecordsAt, taskRecordsAt } from '../derive.js';
import { demand, type Records } from '../model.js';
import { rowAt } from '../records.js';
import { mergeInputs } from './merge-inputs.js';
import { noFacts, type Facts, type ParentContent, type Plan } from './plan.js';
import type { CommitStore } from './store.js';

/**
 * 上传起点的内容：任务在提交 `from` 时，被新提交改动到的那几条记录（共同起点时的共享记录加上任务在起点之后的变更）。
 * 只按这些记录推导，成本与任务分叉以来的改动有关，与历史长度无关；找不到可信共同起点时为 null。
 */
async function parentContent(store: CommitStore, content: ParentContent, from: string): Promise<Records | null> {
  if (!content.touched.length) return {};
  return taskRecordsAt(store, content.shared, content.base, from, content.touched);
}
/**
 * 另存分叉的父内容：第一个新提交的第一父必须落在原任务头到共同起点（含）的路径上，取它那一刻的内容；
 * 不在路径上（链不合法，引擎会拒绝）时为 null，不沿着客户端声明的任意提交回溯。
 */
async function forkContent(
  store: CommitStore,
  plan: Extract<Plan, { type: 'fork' }>,
  existing: ReadonlyMap<string, unknown>,
  path: ReadonlySet<string>
): Promise<Records | null> {
  const first = plan.chain.find(link => !existing.has(link.id));
  if (!first) return {};
  return first.parent !== null && path.has(first.parent) ? parentContent(store, plan.content, first.parent) : null;
}

/** 按 {@link Plan} 读取命令需要的数据；每种命令只做它声明过的读取。 */
export async function preload(store: CommitStore, plan: Plan): Promise<Facts> {
  if (plan.type === 'upload') {
    const existing = await store.commits(plan.ids);
    return {
      ...noFacts,
      existing,
      path: new Set(),
      content: await parentContent(store, plan.content, plan.content.head)
    };
  }
  if (plan.type === 'fork') {
    const existing = await store.commits(plan.ids);
    const path = await store.path(plan.content.head, plan.content.base);
    const ids = path.links.map(link => link.id);
    if (path.reached) ids.push(plan.content.base);
    const set = new Set(ids);
    return { ...noFacts, existing, path: set, content: await forkContent(store, plan, existing, set) };
  }
  if (plan.type === 'inputs') {
    const inputs = await mergeInputs(store, plan);
    const previous: Record<string, Records> = {};
    for (const { candidate, recordIds } of plan.reopen)
      previous[candidate.id] = await candidateRecords(store, plan.shared, candidate, recordIds);
    return { ...noFacts, inputs, previous };
  }
  if (plan.type === 'records') return { ...noFacts, records: await store.shared() };
  if (plan.type === 'anchor') return { ...noFacts, anchor: await anchorRows(store, plan) };
  return noFacts;
}
async function anchorRows(store: CommitStore, plan: Extract<Plan, { type: 'anchor' }>) {
  const { candidate, recordId, shared } = plan;
  const ids = [recordId];
  const target = await sharedRecordsAt(store, shared, candidate.target, ids);
  const source = await taskRecordsAt(store, shared, candidate.base, candidate.source, ids);
  demand(target && source, 'ancestry', '找不到可信共同起点');
  const result = applyChanges(
    structuredClone(target),
    candidate.changes.filter(change => change.entityId === recordId)
  );
  return { candidate: rowAt(result, recordId), source: rowAt(source, recordId), target: rowAt(target, recordId) };
}
