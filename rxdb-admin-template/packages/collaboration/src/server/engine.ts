import {
  auditPageSize,
  auditSummarySize,
  demand,
  permissions,
  type Audit,
  type AuditPage,
  type AuditQuery,
  type CandidateSummary,
  type Command,
  type Environment,
  type Identity,
  type Presence,
  type StoredCandidate,
  type Workspace,
  type WorkspaceSummary
} from '../model.js';
import { canonical } from '../records.js';
import { authorize, editTask, taskFor } from './access.js';
import { discussionCommand, discussionPlan, notify } from './discussion.js';
import { blockers, governanceCommand, governancePlan, progress } from './governance.js';
import { membershipCommand } from './membership.js';
import { noEffects, noFacts, type Effects, type Facts, type Plan } from './plan.js';
import { taskCommand, taskPlan } from './tasks.js';

/** 仅由可信服务端部署命令调用，普通会话没有初始化入口。 */
export function bootstrap(
  input: { teamId: string; appId: string; name: string; bootstrapKey: string; admin: Identity },
  env: Environment
): Workspace {
  demand(input.admin.verified, 'forbidden', '初始管理员必须有已验证邮箱');
  return {
    teamId: input.teamId,
    appId: input.appId,
    name: input.name,
    bootstrapKey: input.bootstrapKey,
    initialAdminId: input.admin.id,
    schemaVersion: 1,
    revision: 0,
    head: null,
    policy: { version: 1, stages: [{ id: 'review', name: '审核', minimum: 1, reviewers: [], after: [] }] },
    members: { [input.admin.id]: { ...input.admin, permissions: [...permissions], generation: 1, active: true } },
    tasks: {},
    prs: {},
    candidates: {},
    invitations: {},
    reviews: [],
    threads: {},
    notifications: [],
    presence: [],
    receipts: {},
    audit: [
      {
        id: env.id(),
        actorId: input.admin.id,
        action: 'bootstrap',
        operationId: input.bootstrapKey,
        at: env.now,
        details: { initialAdminId: input.admin.id }
      }
    ]
  };
}

/** 命令的执行结果：返回给调用方的 `result`，以及除工作区状态变化之外要落到存储的 `effects`（新提交、共享记录改动、合并变更日志）。 */
export interface Outcome {
  result: Record<string, unknown>;
  effects: Effects;
}

/**
 * 命令需要预加载哪些提交与记录数据：先做与 {@link execute} 相同的授权与状态校验，通过后按命令类型声明所需数据。
 * 已有回执的重试不需要任何数据；校验不通过时抛出与 {@link execute} 相同的错误，不会白白读取数据。
 */
export function plan(state: Workspace, user: Identity, command: Command): Plan {
  demand(user.verified, 'forbidden', '需要已验证的用户身份');
  if (command.type !== 'presence') {
    if (command.type !== 'accept_invite') authorize(state, user, 'read');
    if (state.receipts[command.operationId]) return { type: 'none' };
  }
  return (
    taskPlan(state, user, command) ??
    governancePlan(state, user, command) ??
    discussionPlan(state, user, command) ?? { type: 'none' }
  );
}

/**
 * 在副本上执行；任一步拒绝均保持输入状态原样。持久化层负责事务锁与原子提交，并把返回的 `effects` 写入存储。
 * `facts` 是仓储按 {@link plan} 预加载的数据，引擎只读它；不需要数据的命令可以省略。
 */
export function execute(
  state: Workspace,
  user: Identity,
  command: Command,
  env: Environment,
  facts: Facts = noFacts
): Outcome {
  demand(user.verified, 'forbidden', '需要已验证的用户身份');
  const effects = noEffects();
  const run = { facts, effects };
  if (command.type === 'presence') {
    const result = discussionCommand(state, user, command, env, run);
    demand(result, 'invalid', '不支持的操作');
    return { result: structuredClone(result), effects };
  }
  if (command.type !== 'accept_invite') authorize(state, user, 'read');
  const previous = state.receipts[command.operationId];
  if (previous) return { result: receipt(state, user, command, previous), effects };
  const next = structuredClone(state);
  const result =
    membershipCommand(next, user, command, env) ??
    taskCommand(next, user, command, env, run) ??
    governanceCommand(next, user, command, env, run) ??
    discussionCommand(next, user, command, env, run);
  demand(result, 'invalid', '不支持的操作');
  if (command.type === 'review' || command.type === 'merge' || command.type === 'pr_state')
    notify(next, user.id, command.prId, null, [], env);
  next.audit.push({
    id: env.id(),
    actorId: user.id,
    action: command.type,
    operationId: command.operationId,
    at: env.now,
    details: auditDetails(command, result)
  });
  next.receipts[command.operationId] = {
    operationId: command.operationId,
    actorId: user.id,
    fingerprint: requestFingerprint(command),
    value: structuredClone(result),
    at: env.now
  };
  next.revision++;
  Object.assign(state, next);
  return { result: structuredClone(result), effects };
}
function receipt(state: Workspace, user: Identity, command: Command, previous: Workspace['receipts'][string]) {
  authorize(state, user, 'read');
  demand(
    previous.actorId === user.id && previous.fingerprint === requestFingerprint(command),
    'idempotency',
    '幂等键已绑定其他请求或参数'
  );
  if (command.type === 'upload' || command.type === 'fork') editTask(state, user, taskFor(state, command.taskId));
  return structuredClone(previous.value);
}
/**
 * 请求指纹：回执用它拒绝「换参数复用同一幂等键」。上传与分叉的提交内容可能很大，且每个提交已带核验过的内容指纹，
 * 所以只取提交 ID 与指纹，回执体积不随提交内容增长；其余命令用规范化后的整个命令。
 */
function requestFingerprint(command: Command): string {
  if (command.type !== 'upload' && command.type !== 'fork') return canonical(command);
  return canonical({ ...command, commits: command.commits.map(({ id, fingerprint }) => ({ id, fingerprint })) });
}
/**
 * 审计详情会随摘要与审计分页发给所有可读成员，并写入成员可读的 admin_audit，因此不收录：
 * 邀请令牌摘要（tokenHash）、受邀邮箱（email，只有管理者能经摘要的 invitations 查看）、完整提交内容（commits）。
 * 各命令的 result 本身不含邮箱，原样保留；合并改动的记录前后值不在 result 里，只由变更表（admin_changes）承载，
 * 审计因此不随单次合并的改动量增长。
 */
const auditExcluded = ['tokenHash', 'email', 'commits'];
function auditDetails(command: Command, result: Record<string, unknown>): Record<string, unknown> {
  const details: Record<string, unknown> = { ...command, result };
  for (const key of auditExcluded) delete details[key];
  return details;
}

/** 候选的元数据：去掉存储的字段级变更；最终记录改经按需读取接口获取。 */
export function candidateSummary(candidate: StoredCandidate): CandidateSummary {
  const summary: Partial<StoredCandidate> = { ...candidate };
  delete summary.changes;
  return summary as CandidateSummary;
}

/**
 * 摘要的外部输入：`auditCount` 是审计事件总数（仓储只把最近一窗事件放进状态时传入，省略时取 `state.audit.length`），
 * `presence` 是在线记录（省略时取状态里的）。
 */
export interface SummaryView {
  auditCount?: number;
  presence?: Presence[];
}
/**
 * 工作区摘要，只返回该用户可见的内容：不含提交元数据（经提交历史分页读取）、候选不含记录、不含共享数据，
 * 审计只含最近 {@link auditSummarySize} 条（另附总数）。邀请摘要、请求指纹和他人通知永不离开服务端，
 * 受邀邮箱只出现在有 manage 权限者的 invitations 里（审计详情不含邮箱）。
 * 体积与记录数、提交数无关；需要内容时经仓储的按需读取接口读取提交历史、共享记录、提交、候选与审计分页。
 */
export function snapshot(state: Workspace, user: Identity, now: number, view: SummaryView = {}): WorkspaceSummary {
  const member = authorize(state, user, 'read');
  const presence = view.presence ?? state.presence;
  const candidates: Record<string, CandidateSummary> = {};
  for (const [id, candidate] of Object.entries(state.candidates)) candidates[id] = candidateSummary(candidate);
  return structuredClone({
    teamId: state.teamId,
    appId: state.appId,
    name: state.name,
    revision: state.revision,
    schemaVersion: state.schemaVersion,
    head: state.head,
    policy: state.policy,
    members: Object.values(state.members).filter(m => m.active),
    tasks: Object.values(state.tasks),
    prs: Object.values(state.prs),
    candidates,
    reviews: state.reviews,
    threads: Object.values(state.threads),
    notifications: state.notifications.filter(n => n.userId === user.id),
    presence: presence.filter(p => p.expiresAt > now && state.members[p.userId]?.active),
    invitations:
      member.permissions.includes('manage') ?
        Object.values(state.invitations).map(i => ({
          id: i.id,
          email: i.email,
          permissions: i.permissions,
          inviterId: i.inviterId,
          version: i.version,
          expiresAt: i.expiresAt,
          state: i.state,
          acceptedBy: i.acceptedBy
        }))
      : [],
    audit: state.audit.slice(-auditSummarySize),
    auditCount: view.auditCount ?? state.audit.length,
    governance: Object.values(state.prs).map(pr => ({
      prId: pr.id,
      blockers: blockers(state, pr.id),
      stages: pr.candidateId ? progress(state, pr, state.candidates[pr.candidateId]) : []
    }))
  });
}
/** `snapshot()` 的返回类型：摘要，同 {@link WorkspaceSummary}。 */
export type WorkspaceSnapshot = WorkspaceSummary;

const threadActions = ['thread', 'reply', 'resolve_thread', 'edit_comment'];
const text = (value: unknown) => (typeof value === 'string' ? value : null);
/**
 * 审计事件所属的讨论线程：创建、回复、编辑、解决线程的事件，线程 ID 在 `threadId`（回复等）或 `id`（创建）里；
 * 其余事件为 null。审计分页的线程筛选与仓储写入审计时登记的线程列都以它为准。
 */
export function auditThread(event: Audit): string | null {
  if (!threadActions.includes(event.action)) return null;
  return text(event.details['threadId']) ?? text(event.details['id']);
}
/**
 * 审计事件所属的 PR：带 `prId` 的命令、PR 创建本身（`id`），以及属于某个 PR 的线程上的事件（`threadPr` 给出线程所属的 PR）；
 * 与 PR 无关的事件为 null。审计分页的 PR 筛选与仓储写入审计时登记的 PR 列都以它为准。
 */
export function auditPr(event: Audit, threadPr: (threadId: string) => string | undefined): string | null {
  const prId = text(event.details['prId']);
  if (prId !== null) return prId;
  if (event.action === 'pr') return text(event.details['id']);
  const threadId = text(event.details['threadId']);
  return threadId === null ? null : (threadPr(threadId) ?? null);
}
/** 讨论线程所属的 PR：线程 ID 不是自有属性（例如 `toString`）时视为不存在。 */
const threadPrOf = (state: Workspace) => (threadId: string) =>
  Object.hasOwn(state.threads, threadId) ? state.threads[threadId].prId : undefined;
/**
 * 审计分页，按时间从新到旧。`before` 是游标事件 ID，只返回比它更早的事件（游标事件本身不必匹配筛选）；
 * `prId` 与 `threadId` 同时给出时取交集；还有更早的匹配事件时 `nextBefore` 是本页最旧事件的 ID，否则为 null。
 * 授权与摘要一致；游标不存在返回 `not_found`，`limit` 必须是 1～{@link auditPageSize}.maximum 的整数。
 */
export function auditPage(state: Workspace, user: Identity, query: AuditQuery): AuditPage {
  authorize(state, user, 'read');
  const limit = pageLimit(query.limit, auditPageSize);
  const threadPr = threadPrOf(state);
  const matches = (event: Audit) =>
    (query.prId === undefined || auditPr(event, threadPr) === query.prId) &&
    (query.threadId === undefined || auditThread(event) === query.threadId);
  let position = state.audit.length;
  if (query.before !== undefined) {
    position = state.audit.findIndex(event => event.id === query.before);
    demand(position >= 0, 'not_found', '审计事件不存在');
  }
  const events: Audit[] = [];
  while (position > 0 && events.length < limit) {
    position--;
    if (matches(state.audit[position])) events.push(state.audit[position]);
  }
  const older = state.audit.slice(0, position).some(matches);
  return structuredClone({ events, nextBefore: older ? events[events.length - 1].id : null });
}
/** 分页条数：省略时取默认值，否则必须是 1～上限的整数，审计与提交历史共用。 */
export function pageLimit(limit: number | undefined, size: { default: number; maximum: number }): number {
  const value = limit ?? size.default;
  demand(Number.isInteger(value) && value >= 1 && value <= size.maximum, 'invalid', '请求字段不合法');
  return value;
}
