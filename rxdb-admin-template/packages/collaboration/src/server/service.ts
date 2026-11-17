import { assertFingerprints, commitFingerprint } from '../commit.js';
import {
  demand,
  historyPageSize,
  type Candidate,
  type Command,
  type CommitContent,
  type CommitPage,
  type Environment,
  type HistoryQuery,
  type Identity,
  type SharedRecords,
  type Workspace,
  type WorkspaceSummary
} from '../model.js';
import { sortRecords } from '../records.js';
import { authorize, prFor, taskFor } from './access.js';
import { candidateRecords, commitRecords, preload } from './content.js';
import { candidateSummary, execute, pageLimit, plan, snapshot, type SummaryView } from './engine.js';
import type { NewCommit } from './plan.js';
import { gather } from './scope.js';
import { stateChanges } from './state-changes.js';
import { commitSummary, type CommandStore, type CommitStore } from './store.js';

/** 给新提交补上指纹：上传的提交已带核验过的指纹，服务端生成的合并提交在写入前计算。 */
async function sealed(commit: NewCommit) {
  return { ...commit, fingerprint: commit.fingerprint ?? (await commitFingerprint(commit)) };
}

/**
 * 执行一条命令：按命令加载并锁定它涉及的行（局部状态），让引擎做授权与状态校验并声明所需的提交数据，
 * 核验上传提交的内容指纹，按声明预加载，交给纯函数的引擎裁决，再把新提交、共享记录改动与局部状态的差异写回。
 * 调用方负责事务：任一步失败时整体回滚；工作区不存在时与无权访问同样拒绝。
 */
export async function runCommand(
  store: CommandStore,
  user: Identity,
  command: Command,
  env: Environment
): Promise<Record<string, unknown>> {
  const state = await gather(store.loader, user, command, env.now);
  demand(state, 'forbidden', '当前用户没有操作权限');
  const before = structuredClone(state);
  const planned = plan(state, user, command);
  if (command.type === 'upload' || command.type === 'fork') await assertFingerprints(command.commits);
  const { result, effects } = execute(state, user, command, env, await preload(store.commits, planned));
  if (effects.commits.length) await store.commits.append(await Promise.all(effects.commits.map(sealed)));
  if (effects.shared) await store.commits.apply(effects.shared);
  await store.save(stateChanges(before, state), effects, env.now);
  return result;
}

/** 工作区摘要：只含元数据，不含提交元数据、记录与完整审计。需要 read 权限。 */
export function readSummary(state: Workspace, user: Identity, now: number, view?: SummaryView): WorkspaceSummary {
  return snapshot(state, user, now, view);
}
/** 共享分支当前的全部记录及其头提交；需要 read 权限。 */
export async function readSharedRecords(store: CommitStore, state: Workspace, user: Identity): Promise<SharedRecords> {
  authorize(state, user, 'read');
  return { head: state.head, records: sortRecords(await store.shared()) };
}
/** 一个提交的完整内容：元数据、它自身的字段级变更与推导出的整份记录；未知 ID 返回 `not_found`，授权与摘要一致。 */
export async function readCommit(
  store: CommitStore,
  state: Workspace,
  user: Identity,
  id: string
): Promise<CommitContent> {
  authorize(state, user, 'read');
  const meta = (await store.commits([id])).get(id);
  demand(meta, 'not_found', '提交不存在');
  const records = await commitRecords(store, state.head, meta);
  const changes = (await store.changes([id])).get(id) ?? [];
  return { ...commitSummary(meta), changes, records: sortRecords(records) };
}
/** 一个合并候选的完整内容（含推导出的最终记录）；未知 ID 返回 `not_found`，授权与摘要一致。 */
export async function readCandidate(
  store: CommitStore,
  state: Workspace,
  user: Identity,
  id: string
): Promise<Candidate> {
  authorize(state, user, 'read');
  demand(Object.hasOwn(state.candidates, id), 'not_found', '候选不存在');
  const candidate = state.candidates[id];
  return structuredClone({
    ...candidateSummary(candidate),
    records: sortRecords(await candidateRecords(store, state.head, candidate))
  });
}

/** 提交历史要读的分支：共享分支从共享头走到根，任务分支从任务头走到它的共同起点（不含）。 */
export function historyBranch(state: Workspace, query: HistoryQuery): { head: string | null; until: string | null } {
  const selectors = [query.branch, query.taskId, query.prId].filter(value => value !== undefined);
  demand(selectors.length === 1, 'invalid', '请求字段不合法');
  if (query.branch !== undefined) {
    demand(query.branch === 'shared', 'invalid', '请求字段不合法');
    return { head: state.head, until: null };
  }
  const task = taskFor(state, query.taskId ?? prFor(state, query.prId!).taskId);
  return { head: task.head, until: task.base };
}
/**
 * 提交历史的一页（从新到旧，只含元数据）：共享分支、任务分支或 PR 的来源任务，见 {@link HistoryQuery}。
 * `before` 是上一页的 `nextBefore`，从它的父提交接着读；未知的 `before` 返回 `not_found`。
 * 只沿父指针读本页的提交（多读一个判断是否还有更早的），成本只与页大小有关。授权与摘要一致。
 */
export async function readHistory(
  store: CommitStore,
  state: Workspace,
  user: Identity,
  query: HistoryQuery
): Promise<CommitPage> {
  authorize(state, user, 'read');
  const limit = pageLimit(query.limit, historyPageSize);
  const branch = historyBranch(state, query);
  let from = branch.head;
  if (query.before !== undefined) {
    const cursor = (await store.commits([query.before])).get(query.before);
    demand(cursor, 'not_found', '提交不存在');
    from = cursor.parent;
  }
  const commits = await store.history(from, branch.until, limit + 1);
  const page = commits.slice(0, limit);
  return { commits: page, nextBefore: commits.length > limit ? page[page.length - 1].id : null };
}
