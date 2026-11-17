import {
  auditPageSize,
  auditSummarySize,
  demand,
  permissions,
  type Audit,
  type AuditPage,
  type AuditQuery,
  type Candidate,
  type CandidateSummary,
  type Command,
  type Commit,
  type CommitSummary,
  type Environment,
  type Identity,
  type SharedRecords,
  type Workspace,
  type WorkspaceSummary
} from '../model.js';
import { canonical } from '../records.js';
import { authorize, editTask, taskFor } from './access.js';
import { discussionCommand, notify } from './discussion.js';
import { blockers, governanceCommand, progress } from './governance.js';
import { membershipCommand } from './membership.js';
import { taskCommand } from './tasks.js';

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
    records: {},
    policy: { version: 1, stages: [{ id: 'review', name: '审核', minimum: 1, reviewers: [], after: [] }] },
    members: { [input.admin.id]: { ...input.admin, permissions: [...permissions], generation: 1, active: true } },
    tasks: {},
    commits: {},
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

/** 在副本上执行；任一步拒绝均保持输入状态原样。持久化层负责事务锁与原子提交。 */
export function execute(state: Workspace, user: Identity, command: Command, env: Environment): Record<string, unknown> {
  demand(user.verified, 'forbidden', '需要已验证的用户身份');
  if (command.type === 'presence') {
    const result = discussionCommand(state, user, command, env);
    demand(result, 'invalid', '不支持的操作');
    return structuredClone(result);
  }
  if (command.type !== 'accept_invite') authorize(state, user, 'read');
  const previous = state.receipts[command.operationId];
  if (previous) return receipt(state, user, command, previous);
  const next = structuredClone(state);
  const result =
    membershipCommand(next, user, command, env) ??
    taskCommand(next, user, command, env) ??
    governanceCommand(next, user, command, env) ??
    discussionCommand(next, user, command, env);
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
    fingerprint: canonical(command),
    value: structuredClone(result)
  };
  next.revision++;
  Object.assign(state, next);
  return structuredClone(result);
}
function receipt(state: Workspace, user: Identity, command: Command, previous: Workspace['receipts'][string]) {
  authorize(state, user, 'read');
  demand(
    previous.actorId === user.id && previous.fingerprint === canonical(command),
    'idempotency',
    '幂等键已绑定其他请求或参数'
  );
  if (command.type === 'upload' || command.type === 'fork') editTask(state, user, taskFor(state, command.taskId));
  return structuredClone(previous.value);
}
/**
 * 审计详情会随摘要与审计分页发给所有可读成员，并写入成员可读的 admin_audit，因此不收录：
 * 邀请令牌摘要（tokenHash）、受邀邮箱（email，只有管理者能经摘要的 invitations 查看）、完整提交内容（commits）。
 * 各命令的 result 本身不含邮箱，原样保留（合并结果的 changes 还要供 admin_changes 投影）。
 */
const auditExcluded = ['tokenHash', 'email', 'commits'];
function auditDetails(command: Command, result: Record<string, unknown>): Record<string, unknown> {
  const details: Record<string, unknown> = { ...command, result };
  for (const key of auditExcluded) delete details[key];
  return details;
}

/** 去掉记录内容后的元数据；提交与候选的记录改经按需读取接口获取。 */
function withoutRecords<T extends { records: unknown }>(value: T): Omit<T, 'records'> {
  const metadata: Partial<T> = { ...value };
  delete metadata.records;
  return metadata as Omit<T, 'records'>;
}

/**
 * 工作区摘要，只返回该用户可见的内容：提交只含元数据，候选不含记录，不含共享数据，审计只含最近
 * {@link auditSummarySize} 条（另附总数）。邀请摘要、请求指纹和他人通知永不离开服务端，
 * 受邀邮箱只出现在有 manage 权限者的 invitations 里（审计详情不含邮箱）。
 * 体积与记录数无关；需要内容时经 {@link sharedRecords}、{@link commitContent}、{@link candidateContent}、
 * {@link auditPage} 读取。
 */
export function snapshot(state: Workspace, user: Identity, now: number, presence = state.presence): WorkspaceSummary {
  const member = authorize(state, user, 'read');
  const commits: Record<string, CommitSummary> = {};
  for (const [id, commit] of Object.entries(state.commits)) commits[id] = withoutRecords(commit);
  const candidates: Record<string, CandidateSummary> = {};
  for (const [id, candidate] of Object.entries(state.candidates)) candidates[id] = withoutRecords(candidate);
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
    commits,
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
    auditCount: state.audit.length,
    governance: Object.values(state.prs).map(pr => ({
      prId: pr.id,
      blockers: blockers(state, pr.id),
      stages: pr.candidateId ? progress(state, pr, state.candidates[pr.candidateId]) : []
    }))
  });
}
/** `snapshot()` 的返回类型：摘要，同 {@link WorkspaceSummary}。 */
export type WorkspaceSnapshot = WorkspaceSummary;

/** 共享分支当前的全部记录及其头提交；授权与摘要一致，需要 read 权限。 */
export function sharedRecords(state: Workspace, user: Identity): SharedRecords {
  authorize(state, user, 'read');
  return structuredClone({ head: state.head, records: state.records });
}
/** 一个提交的完整内容（含记录）；未知 ID 返回 `not_found`，授权与摘要一致。 */
export function commitContent(state: Workspace, user: Identity, id: string): Commit {
  authorize(state, user, 'read');
  demand(Object.hasOwn(state.commits, id), 'not_found', '提交不存在');
  return structuredClone(state.commits[id]);
}
/** 一个合并候选的完整内容（含最终记录）；未知 ID 返回 `not_found`，授权与摘要一致。 */
export function candidateContent(state: Workspace, user: Identity, id: string): Candidate {
  authorize(state, user, 'read');
  demand(Object.hasOwn(state.candidates, id), 'not_found', '候选不存在');
  return structuredClone(state.candidates[id]);
}

const threadActions = ['thread', 'reply', 'resolve_thread', 'edit_comment'];
/** 讨论线程的处理历史：创建、回复、编辑、解决事件，线程 ID 在 `threadId`（回复等）或 `id`（创建）里。 */
function isThreadEvent(event: Audit, threadId: string): boolean {
  return (
    threadActions.includes(event.action) && (event.details['threadId'] === threadId || event.details['id'] === threadId)
  );
}
/** 与 PR 相关的事件：带 `prId` 的命令、PR 创建本身（`id`），以及属于该 PR 的线程上的事件。 */
function isPrEvent(state: Workspace, event: Audit, prId: string): boolean {
  if (event.details['prId'] === prId) return true;
  if (event.action === 'pr') return event.details['id'] === prId;
  const threadId = event.details['threadId'];
  return (
    typeof threadId === 'string' && Object.hasOwn(state.threads, threadId) && state.threads[threadId].prId === prId
  );
}
/**
 * 审计分页，按时间从新到旧。`before` 是游标事件 ID，只返回比它更早的事件（游标事件本身不必匹配筛选）；
 * `prId` 与 `threadId` 同时给出时取交集；还有更早的匹配事件时 `nextBefore` 是本页最旧事件的 ID，否则为 null。
 * 授权与摘要一致；游标不存在返回 `not_found`，`limit` 必须是 1～{@link auditPageSize}.maximum 的整数。
 */
export function auditPage(state: Workspace, user: Identity, query: AuditQuery): AuditPage {
  authorize(state, user, 'read');
  const limit = query.limit ?? auditPageSize.default;
  demand(Number.isInteger(limit) && limit >= 1 && limit <= auditPageSize.maximum, 'invalid', '请求字段不合法');
  const matches = (event: Audit) =>
    (query.prId === undefined || isPrEvent(state, event, query.prId)) &&
    (query.threadId === undefined || isThreadEvent(event, query.threadId));
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
