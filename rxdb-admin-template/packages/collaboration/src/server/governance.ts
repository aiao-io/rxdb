import { activeBlockers, reviewRevision as sharedReviewRevision, stageProgress } from '../approval.js';
import { applyChanges, diffRecords } from '../changes.js';
import { checkMerged, type RecordCheck } from '../checks.js';
import {
  demand,
  type Check,
  type Command,
  type Environment,
  type Identity,
  type PullRequest,
  type Records,
  type Review,
  type SchemaManifest,
  type StageProgress,
  type StoredCandidate,
  type Workspace
} from '../model.js';
import { canonical, mergeRecords, rowAt } from '../records.js';
import { assertRecordsFit, namespaceOf, recordKeys } from '../schema.js';
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
/** 某个审核者在 PR 上的最新审核版本号，规则见 `approval.ts`。 */
export function reviewRevision(state: Workspace, prId: string, reviewerId: string): number {
  return sharedReviewRevision(state.reviews, prId, reviewerId);
}
/** 仍然生效的要求修改，规则见 `approval.ts`。 */
export function blockers(state: Workspace, prId: string): Review[] {
  return activeBlockers(state.reviews, prId);
}
/** 当前候选在各审批阶段的进度，规则见 `approval.ts`。 */
export function progress(state: Workspace, pr: PullRequest, candidate: StoredCandidate): StageProgress[] {
  return stageProgress(state.policy, state.members, state.reviews, pr, candidate);
}
/**
 * 候选与合并需要预加载的数据：合并基以来改动过的记录在 B、S、T 三处的取值与跨记录检查要用到的记录；
 * 候选另需已解决的必须处理线程所锚定的历史候选行。冲突选择里的自定义取值也参与唯一与关联检查。
 */
export function governancePlan(state: Workspace, user: Identity, command: Command): Plan | undefined {
  if (command.type === 'candidate') {
    const { pr, task, source } = candidateGuards(state, user, command);
    return {
      type: 'inputs',
      head: state.head,
      base: task.base,
      source,
      reopen: reopenTargets(state, pr),
      resolutions: command.resolutions,
      schema: state.schema
    };
  }
  if (command.type !== 'merge') return undefined;
  const { candidate } = mergeGuards(state, user, command);
  return {
    type: 'inputs',
    head: state.head,
    base: candidate.base,
    source: candidate.source,
    reopen: [],
    resolutions: candidate.resolutions,
    schema: state.schema
  };
}
/** 扩展检查返回的必须是可存进候选的检查（记录、字段与文案都是文本）；不是说明部署注入的扩展有误，按内部错误处理。 */
function extensionChecks(hook: RecordCheck, schema: SchemaManifest, inputs: MergeInputs, merged: Records): Check[] {
  const changed = inputs.touched
    .filter(id => canonical(rowAt(merged, id)) !== canonical(rowAt(inputs.target, id)))
    .map(id => ({ id, before: structuredClone(rowAt(inputs.target, id)), after: structuredClone(rowAt(merged, id)) }));
  const checks = hook({ schema: structuredClone(schema), changed });
  if (!checks.every(check => [check.recordId, check.field, check.message].every(text => typeof text === 'string')))
    throw new Error('The record check extension returned malformed checks');
  return checks.map(({ recordId, field, message }) => ({ recordId, field, message }));
}
/**
 * 合并结果的检查：结构必须符合清单（自定义的整条记录也一样），再按清单定向检查改动过的与受牵连的记录，
 * 结果与检查整份合并结果相同；部署注入了特殊业务检查时，把它对改动记录的检查追加在后面。
 */
function resultChecks(schema: SchemaManifest, inputs: MergeInputs, merged: Records, hook: RecordCheck | undefined) {
  assertRecordsFit(schema, merged);
  const checks = checkMerged(schema, { ...inputs, merged });
  return hook ? [...checks, ...extensionChecks(hook, schema, inputs, merged)] : checks;
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
  const inputs = mergeInputs(run.facts);
  // 三方合并只在改动过的记录上进行：其余记录三方相同，结果就是 T
  const merged = mergeRecords(inputs.base, inputs.source, inputs.target, command.resolutions);
  const checks = resultChecks(state.schema, inputs, merged.records, run.checks);
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
    checks,
    actorId: user.id,
    at: env.now,
    // 只存最终结果相对目标版本 T 的字段级变更；整份记录在读取时由 T 加变更推导
    changes: diffRecords(inputs.target, merged.records, namespaceOf(state.schema))
  };
  const touched = new Set(inputs.touched);
  // 锚定的记录没改动时，新结果里的取值就是 T 的（已按需预读）
  const resultRow = (recordId: string) =>
    touched.has(recordId) ? rowAt(merged.records, recordId) : rowAt(inputs.related, recordId);
  const reopenedThreads: string[] = [];
  for (const thread of Object.values(state.threads).filter(
    value => value.prId === pr.id && value.required && value.resolved && value.candidateId && value.recordId
  )) {
    const original = rowAt(
      run.facts.previous[thread.resolvedCandidateId ?? thread.candidateId!] ?? {},
      thread.recordId!
    );
    const current = resultRow(thread.recordId!);
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
  const inputs = mergeInputs(run.facts);
  const target = inputs.target;
  // 服务端重算并核对候选：重新得到的结果与候选存储的变更应用到 T 之后必须完全一致，不能在事务里换用新的冲突值。
  // 两边都只含改动过的记录，其余记录三方相同、都等于 T
  const result = mergeRecords(inputs.base, inputs.source, target, candidate.resolutions);
  const final = applyChanges(structuredClone(target), candidate.changes);
  demand(
    !result.conflicts.length &&
      !resultChecks(state.schema, inputs, result.records, run.checks).length &&
      canonical(result.records) === canonical(final),
    'checks',
    '候选内容与重新检查的结果不一致'
  );
  const head = env.id();
  const changedIds = [...new Set(candidate.changes.map(change => change.entityId))];
  const changes = changedIds.map(id => ({ id, before: rowAt(target, id) ?? null, after: rowAt(final, id) ?? null }));
  // 逐记录的前后值只进变更日志（admin_changes），命令结果、回执与审计详情不再带它们
  run.effects.log = { head, records: structuredClone(changes) };
  run.effects.commits.push({
    id: head,
    parent: state.head,
    authorId: user.id,
    message: `Merge ${pr.title}`,
    mergeSource: candidate.source,
    candidateId: candidate.id,
    changes: structuredClone(candidate.changes)
  });
  const upsert = Object.fromEntries(changes.filter(change => change.after).map(change => [change.id, change.after!]));
  run.effects.shared = {
    upsert,
    remove: changes.filter(change => !change.after).map(change => change.id),
    // 键索引随共享记录在同一事务里更新：唯一与关联检查按键查询，不扫全表
    keys: Object.entries(upsert).flatMap(([recordId, row]) =>
      recordKeys(state.schema, row).map(key => ({ ...key, recordId }))
    )
  };
  state.head = head;
  pr.status = 'merged';
  pr.revision++;
  return {
    head,
    prId: pr.id,
    candidateId: candidate.id,
    source: candidate.source,
    policy: structuredClone(state.policy),
    approvals: state.reviews.filter(r => r.prId === pr.id).map(r => r.id)
  };
}
