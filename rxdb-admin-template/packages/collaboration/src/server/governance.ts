import { applyChanges, diffRecords } from '../changes.js';
import {
  demand,
  type Command,
  type Environment,
  type Identity,
  type PullRequest,
  type Review,
  type StageProgress,
  type StoredCandidate,
  type Workspace
} from '../model.js';
import { canonical, checkRecords, mergeRecords, rowAt } from '../records.js';
import { authorize, expected, managePr, openPr, prFor, taskFor } from './access.js';
import { preloaded, type Facts, type MergeInputs, type Plan, type Reopen, type Run } from './plan.js';

export function currentCandidate(state: Workspace, pr: PullRequest, id: string): StoredCandidate {
  const candidate = state.candidates[id];
  const task = taskFor(state, pr.taskId);
  demand(
    candidate &&
      pr.candidateId === id &&
      candidate.prId === pr.id &&
      candidate.source === task.head &&
      candidate.target === state.head &&
      candidate.policyVersion === state.policy.version &&
      candidate.schemaVersion === state.schemaVersion,
    'stale',
    '候选已过期，请重新预览、检查和审核'
  );
  return candidate;
}
export function checkedCandidate(state: Workspace, pr: PullRequest, id: string): StoredCandidate {
  const candidate = currentCandidate(state, pr, id);
  demand(!candidate.conflicts.length, 'conflict', '还有未解决的冲突');
  demand(!candidate.checks.length, 'checks', '最终结果检查未通过', { checks: candidate.checks });
  return candidate;
}
export function reviewRevision(state: Workspace, prId: string, reviewerId: string): number {
  return state.reviews
    .filter(
      r =>
        r.prId === prId &&
        (r.decision === 'dismiss' ? r.dismissedReviewerId === reviewerId : r.reviewerId === reviewerId)
    )
    .reduce((revision, r) => Math.max(revision, r.revision), 0);
}
export function blockers(state: Workspace, prId: string): Review[] {
  const active = new Map<string, Review>();
  for (const review of state.reviews.filter(r => r.prId === prId)) {
    if (review.decision === 'request_changes') active.set(review.reviewerId, review);
    else active.delete(review.dismissedReviewerId ?? review.reviewerId);
  }
  return [...active.values()];
}
export function progress(state: Workspace, pr: PullRequest, candidate: StoredCandidate): StageProgress[] {
  return state.policy.stages.map(stage => {
    const latest = new Map<string, Review>();
    for (const review of state.reviews.filter(r => r.prId === pr.id && r.stageId === stage.id))
      latest.set(review.reviewerId, review);
    const approved = [...latest.values()].filter(
      r => validApproval(state, pr, candidate, r) && (!stage.reviewers.length || stage.reviewers.includes(r.reviewerId))
    );
    return {
      id: stage.id,
      name: stage.name,
      minimum: stage.minimum,
      approved: approved.length,
      complete: approved.length >= stage.minimum
    };
  });
}
function validApproval(state: Workspace, pr: PullRequest, candidate: StoredCandidate, review: Review): boolean {
  const member = state.members[review.reviewerId];
  return (
    review.decision === 'approve' &&
    review.candidateId === candidate.id &&
    review.reviewerId !== pr.authorId &&
    member?.active &&
    member.generation === review.generation &&
    member.permissions.includes('review')
  );
}
/** 候选与合并需要预加载的数据：B、S、T 的完整记录；候选另需已解决的必须处理线程所锚定的历史候选行。 */
export function governancePlan(state: Workspace, user: Identity, command: Command): Plan | undefined {
  if (command.type === 'candidate') {
    const { pr, task, source } = candidateGuards(state, user, command);
    return { type: 'inputs', head: state.head, base: task.base, source, reopen: reopenTargets(state, pr) };
  }
  if (command.type !== 'merge') return undefined;
  const { candidate } = mergeGuards(state, user, command);
  return { type: 'inputs', head: state.head, base: candidate.base, source: candidate.source, reopen: [] };
}
export function governanceCommand(
  state: Workspace,
  user: Identity,
  command: Command,
  env: Environment,
  run: Run
): Record<string, unknown> | undefined {
  if (command.type === 'candidate') return makeCandidate(state, user, command, env, run);
  if (command.type === 'review') return review(state, user, command, env);
  if (command.type === 'dismiss') {
    authorize(state, user, 'manage');
    authorize(state, user, 'review');
    openPr(state, command.prId);
    expected(reviewRevision(state, command.prId, command.reviewerId), command.expectedRevision);
    demand(command.reason.trim(), 'invalid', '撤销阻塞意见必须填写理由');
    demand(
      blockers(state, command.prId).some(r => r.reviewerId === command.reviewerId),
      'state',
      '没有可撤销的阻塞意见'
    );
    const entry: Review = {
      id: env.id(),
      prId: command.prId,
      reviewerId: user.id,
      dismissedReviewerId: command.reviewerId,
      decision: 'dismiss',
      source: null,
      candidateId: null,
      stageId: '',
      generation: state.members[user.id].generation,
      revision: command.expectedRevision + 1,
      reason: command.reason,
      at: env.now
    };
    state.reviews.push(entry);
    return { reviewId: entry.id };
  }
  if (command.type === 'merge') return merge(state, user, command, env, run);
  return undefined;
}
/** 生成候选前的授权与状态校验：PR 打开且可管理、修订号一致、任务已有同步的提交。 */
function candidateGuards(state: Workspace, user: Identity, command: Extract<Command, { type: 'candidate' }>) {
  const pr = openPr(state, command.prId);
  managePr(state, user, pr);
  expected(pr.revision, command.expectedRevision);
  const task = taskFor(state, pr.taskId);
  demand(task.head, 'empty', '任务没有已同步提交');
  return { pr, task, source: task.head };
}
/** 已解决的必须处理线程所锚定的记录，按它们当时对应的候选归并；新候选里这些记录变化了线程才会重新打开。 */
function reopenTargets(state: Workspace, pr: PullRequest): Reopen[] {
  const targets = new Map<string, Reopen>();
  for (const thread of Object.values(state.threads)) {
    if (thread.prId !== pr.id || !thread.required || !thread.resolved || !thread.candidateId || !thread.recordId)
      continue;
    const candidate = state.candidates[thread.resolvedCandidateId ?? thread.candidateId];
    if (!candidate) continue;
    const target = targets.get(candidate.id) ?? { candidate, recordIds: [] };
    if (!target.recordIds.includes(thread.recordId)) target.recordIds.push(thread.recordId);
    targets.set(candidate.id, target);
  }
  return [...targets.values()];
}
function makeCandidate(
  state: Workspace,
  user: Identity,
  command: Extract<Command, { type: 'candidate' }>,
  env: Environment,
  run: Run
) {
  const { pr, task, source } = candidateGuards(state, user, command);
  const { base, source: sourceRecords, target } = mergeInputs(run.facts);
  const merged = mergeRecords(base, sourceRecords, target, command.resolutions);
  const id = env.id();
  state.candidates[id] = {
    id,
    prId: pr.id,
    base: task.base,
    source,
    target: state.head,
    schemaVersion: state.schemaVersion,
    policyVersion: state.policy.version,
    resolutions: structuredClone(command.resolutions),
    conflicts: merged.conflicts,
    checks: checkRecords(merged.records),
    actorId: user.id,
    at: env.now,
    // 只存最终结果相对目标版本 T 的字段级变更；整份记录在读取时由 T 加变更推导
    changes: diffRecords(target, merged.records)
  };
  const reopenedThreads: string[] = [];
  for (const thread of Object.values(state.threads).filter(
    value => value.prId === pr.id && value.required && value.resolved && value.candidateId && value.recordId
  )) {
    const original = rowAt(
      run.facts.previous[thread.resolvedCandidateId ?? thread.candidateId!] ?? {},
      thread.recordId!
    );
    const current = rowAt(merged.records, thread.recordId!);
    const before = thread.field ? original?.fields[thread.field] : original;
    const after = thread.field ? current?.fields[thread.field] : current;
    if (canonical(before) === canonical(after)) continue;
    thread.resolved = false;
    thread.revision++;
    reopenedThreads.push(thread.id);
  }
  pr.candidateId = id;
  pr.revision++;
  return { candidateId: id, revision: pr.revision, reopenedThreads };
}
/** 取出预加载的合并输入：找不到可信共同起点时拒绝；仓储没有按声明预加载说明与引擎不同步，按内部错误处理。 */
function mergeInputs(facts: Facts): MergeInputs {
  const inputs = preloaded(facts.inputs, 'merge inputs');
  demand(inputs !== null, 'ancestry', '找不到可信共同起点');
  return inputs;
}
function review(state: Workspace, user: Identity, command: Extract<Command, { type: 'review' }>, env: Environment) {
  const member = authorize(state, user, 'review');
  const pr = openPr(state, command.prId);
  demand(pr.status === 'review', 'state', '先请求审核');
  const source = taskFor(state, pr.taskId).head;
  expected(source, command.expectedSource);
  expected(reviewRevision(state, pr.id, user.id), command.expectedRevision);
  demand(pr.authorId !== user.id, 'forbidden', '不能审核自己的 PR');
  const assigned = state.policy.stages.find(stage => stage.id === command.stageId);
  demand(
    state.policy.stages.length === 0 ||
      (assigned && (!assigned.reviewers.length || assigned.reviewers.includes(user.id))),
    'forbidden',
    '没有此审批阶段的权限'
  );
  if (command.decision === 'approve') assertStage(state, pr, command, user);
  else {
    if (command.candidateId) currentCandidate(state, pr, command.candidateId);
    demand(command.reason.trim(), 'invalid', '要求修改必须填写原因');
  }
  const entry: Review = {
    id: env.id(),
    prId: pr.id,
    reviewerId: user.id,
    source,
    candidateId: command.candidateId,
    stageId: command.stageId,
    decision: command.decision,
    generation: member.generation,
    revision: command.expectedRevision + 1,
    reason: command.reason,
    at: env.now
  };
  state.reviews.push(entry);
  return { reviewId: entry.id, revision: entry.revision };
}
function assertStage(
  state: Workspace,
  pr: PullRequest,
  command: Extract<Command, { type: 'review' }>,
  user: Identity
): void {
  demand(command.candidateId, 'candidate', '尚未生成最终候选，检查未通过');
  const candidate = checkedCandidate(state, pr, command.candidateId);
  if (state.policy.stages.length === 0) {
    demand(command.stageId === 'review', 'forbidden', '没有此审批阶段的权限');
    return;
  }
  const stage = state.policy.stages.find(item => item.id === command.stageId);
  demand(stage && (!stage.reviewers.length || stage.reviewers.includes(user.id)), 'forbidden', '没有此审批阶段的权限');
  const stages = progress(state, pr, candidate);
  demand(
    stage.after.every(id => stages.find(item => item.id === id)?.complete),
    'stage',
    '前置审批阶段尚未完成'
  );
}
/** 合并前的授权与状态校验：候选当前且检查通过、来源与目标符合预期、没有阻塞意见与未处理线程、审批阶段全部满足。 */
function mergeGuards(state: Workspace, user: Identity, command: Extract<Command, { type: 'merge' }>) {
  authorize(state, user, 'merge');
  const pr = prFor(state, command.prId);
  demand(pr.status === 'review', 'state', 'PR 不在可合并状态');
  const candidate = checkedCandidate(state, pr, command.candidateId);
  expected(candidate.source, command.expectedSource);
  expected(candidate.target, command.expectedTarget);
  demand(!blockers(state, pr.id).length, 'review', '存在未解除的要求修改');
  demand(
    !Object.values(state.threads).some(t => t.prId === pr.id && t.required && !t.resolved),
    'thread',
    '必须处理的讨论尚未解决'
  );
  const stages = progress(state, pr, candidate);
  demand(
    stages.every(stage => stage.complete),
    'approval',
    '缺少当前候选的有效批准',
    { stages }
  );
  return { pr, candidate };
}
function merge(
  state: Workspace,
  user: Identity,
  command: Extract<Command, { type: 'merge' }>,
  env: Environment,
  run: Run
) {
  const { pr, candidate } = mergeGuards(state, user, command);
  const { base, source, target } = mergeInputs(run.facts);
  // 服务端重算并核对候选：重新得到的结果与候选存储的变更应用到 T 之后必须完全一致，不能在事务里换用新的冲突值
  const result = mergeRecords(base, source, target, candidate.resolutions);
  const final = applyChanges(structuredClone(target), candidate.changes);
  demand(
    !result.conflicts.length && !checkRecords(result.records).length && canonical(result.records) === canonical(final),
    'checks',
    '候选内容与重新检查的结果不一致'
  );
  const head = env.id();
  const changedIds = [...new Set(candidate.changes.map(change => change.entityId))];
  const changes = changedIds.map(id => ({ id, before: rowAt(target, id) ?? null, after: rowAt(final, id) ?? null }));
  run.effects.commits.push({
    id: head,
    parent: state.head,
    authorId: user.id,
    message: `Merge ${pr.title}`,
    mergeSource: candidate.source,
    candidateId: candidate.id,
    changes: structuredClone(candidate.changes)
  });
  run.effects.shared = {
    upsert: Object.fromEntries(changes.filter(change => change.after).map(change => [change.id, change.after!])),
    remove: changes.filter(change => !change.after).map(change => change.id)
  };
  state.head = head;
  pr.status = 'merged';
  pr.revision++;
  return {
    head,
    changes,
    prId: pr.id,
    candidateId: candidate.id,
    source: candidate.source,
    policy: structuredClone(state.policy),
    approvals: state.reviews.filter(r => r.prId === pr.id).map(r => r.id)
  };
}
