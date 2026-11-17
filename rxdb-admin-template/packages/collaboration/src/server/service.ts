import { assertFingerprints, commitFingerprint } from '../commit.js';
import {
  demand,
  type Candidate,
  type Command,
  type CommitContent,
  type Environment,
  type Identity,
  type Presence,
  type SharedRecords,
  type Workspace,
  type WorkspaceSummary
} from '../model.js';
import { sortRecords } from '../records.js';
import { authorize } from './access.js';
import { candidateRecords, commitRecords, preload } from './content.js';
import { candidateSummary, execute, plan, snapshot } from './engine.js';
import type { NewCommit } from './plan.js';
import { commitSummary, type CommitStore } from './store.js';

/** 给新提交补上指纹：上传的提交已带核验过的指纹，服务端生成的合并提交在写入前计算。 */
async function sealed(commit: NewCommit) {
  return { ...commit, fingerprint: commit.fingerprint ?? (await commitFingerprint(commit)) };
}

/**
 * 在已持有工作区状态的前提下执行一条命令：先让引擎做授权与状态校验并声明所需数据，核验上传提交的内容指纹，
 * 按声明从存储预加载数据，交给纯函数的引擎裁决，再把新提交与共享记录改动写回存储。
 * `state` 在成功时就地更新；调用方负责事务、锁与把更新后的 `state` 落库，任一步失败时整体回滚。
 */
export async function runCommand(
  store: CommitStore,
  state: Workspace,
  user: Identity,
  command: Command,
  env: Environment
): Promise<Record<string, unknown>> {
  const planned = plan(state, user, command);
  if (command.type === 'upload' || command.type === 'fork') await assertFingerprints(command.commits);
  const { result, effects } = execute(state, user, command, env, await preload(store, planned));
  if (effects.commits.length) await store.append(await Promise.all(effects.commits.map(sealed)));
  if (effects.shared) await store.apply(effects.shared);
  return result;
}

/** 工作区摘要：提交只含元数据，从提交表读出；`presence` 省略时取状态里的在线记录。需要 read 权限。 */
export async function readSummary(
  store: CommitStore,
  state: Workspace,
  user: Identity,
  now: number,
  presence?: Presence[]
): Promise<WorkspaceSummary> {
  authorize(state, user, 'read');
  return snapshot(state, user, now, await store.summaries(), presence);
}
/** 共享分支当前的全部记录及其头提交；需要 read 权限。 */
export async function readSharedRecords(store: CommitStore, state: Workspace, user: Identity): Promise<SharedRecords> {
  authorize(state, user, 'read');
  return { head: state.head, records: sortRecords(await store.shared()) };
}
/** 一个提交的完整内容（含推导出的整份记录）；未知 ID 返回 `not_found`，授权与摘要一致。 */
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
  return { ...commitSummary(meta), records: sortRecords(records) };
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
