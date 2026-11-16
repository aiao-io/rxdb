import {
  demand,
  type Candidate,
  type Command,
  type Environment,
  type Identity,
  type PullRequest,
  type Review,
  type Workspace
} from '../model.js';
import { canonical, checkRecords, mergeRecords } from '../records.js';
import { authorize, expected, managePr, openPr, prFor, taskFor } from './access.js';
import { reachable } from './tasks.js';

export function currentCandidate(state: Workspace, pr: PullRequest, id: string): Candidate {
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
export function checkedCandidate(state: Workspace, pr: PullRequest, id: string): Candidate {
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
export function progress(state: Workspace, pr: PullRequest, candidate: Candidate) {
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
function validApproval(state: Workspace, pr: PullRequest, candidate: Candidate, review: Review): boolean {
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
export function governanceCommand(
  state: Workspace,
  user: Identity,
  command: Command,
  env: Environment
): Record<string, unknown> | undefined {
  if (command.type === 'candidate') return makeCandidate(state, user, command, env);
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
  if (command.type === 'merge') return merge(state, user, command, env);
  return undefined;
}
function makeCandidate(
  state: Workspace,
  user: Identity,
  command: Extract<Command, { type: 'candidate' }>,
  env: Environment
) {
  const pr = openPr(state, command.prId);
  managePr(state, user, pr);
  expected(pr.revision, command.expectedRevision);
  const task = taskFor(state, pr.taskId);
  demand(task.head, 'empty', '任务没有已同步提交');
  demand(
    reachable(state, task.head, task.base) && reachable(state, state.head, task.base),
    'ancestry',
    '找不到可信共同起点'
  );
  const merged = mergeRecords(
    task.base ? state.commits[task.base].records : {},
    state.commits[task.head].records,
    state.records,
    command.resolutions
  );
  const id = env.id();
  state.candidates[id] = {
    id,
    prId: pr.id,
    base: task.base,
    source: task.head,
    target: state.head,
    schemaVersion: state.schemaVersion,
    policyVersion: state.policy.version,
    resolutions: structuredClone(command.resolutions),
    ...merged,
    checks: checkRecords(merged.records),
    actorId: user.id,
    at: env.now
  };
  const reopenedThreads: string[] = [];
  for (const thread of Object.values(state.threads).filter(
    value => value.prId === pr.id && value.required && value.resolved && value.candidateId && value.recordId
  )) {
    const original = state.candidates[thread.resolvedCandidateId ?? thread.candidateId!]?.records[thread.recordId!];
    const current = merged.records[thread.recordId!];
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
function merge(state: Workspace, user: Identity, command: Extract<Command, { type: 'merge' }>, env: Environment) {
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
  const result = mergeRecords(
    candidate.base ? state.commits[candidate.base].records : {},
    state.commits[candidate.source].records,
    state.records,
    candidate.resolutions
  );
  demand(
    !result.conflicts.length &&
      !checkRecords(result.records).length &&
      canonical(result.records) === canonical(candidate.records),
    'checks',
    '候选内容与重新检查的结果不一致'
  );
  const head = env.id();
  const changes = Object.keys({ ...state.records, ...candidate.records })
    .filter(id => canonical(state.records[id]) !== canonical(candidate.records[id]))
    .map(id => ({ id, before: state.records[id] ?? null, after: candidate.records[id] ?? null }));
  state.commits[head] = {
    id: head,
    parent: state.head,
    authorId: user.id,
    message: `Merge ${pr.title}`,
    mergeSource: candidate.source,
    candidateId: candidate.id,
    records: structuredClone(candidate.records)
  };
  state.records = structuredClone(candidate.records);
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
