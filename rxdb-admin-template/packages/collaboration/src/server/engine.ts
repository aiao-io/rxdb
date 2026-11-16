import { demand, permissions, type Command, type Environment, type Identity, type Workspace } from '../model.js';
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
 * 审计详情会随快照发给所有可读成员，并写入成员可读的 admin_audit，因此不收录：
 * 邀请令牌摘要（tokenHash）、受邀邮箱（email，只有管理者能经快照的 invitations 查看）、完整提交内容（commits）。
 * 各命令的 result 本身不含邮箱，原样保留（合并结果的 changes 还要供 admin_changes 投影）。
 */
const auditExcluded = ['tokenHash', 'email', 'commits'];
function auditDetails(command: Command, result: Record<string, unknown>): Record<string, unknown> {
  const details: Record<string, unknown> = { ...command, result };
  for (const key of auditExcluded) delete details[key];
  return details;
}

/**
 * 只返回该用户可见的内容；邀请摘要、请求指纹和他人通知永不离开服务端，
 * 受邀邮箱只出现在有 manage 权限者的 invitations 里（审计详情不含邮箱）。
 */
export function snapshot(state: Workspace, user: Identity, now: number, presence = state.presence) {
  const member = authorize(state, user, 'read');
  return structuredClone({
    teamId: state.teamId,
    appId: state.appId,
    name: state.name,
    revision: state.revision,
    schemaVersion: state.schemaVersion,
    head: state.head,
    records: state.records,
    policy: state.policy,
    members: Object.values(state.members).filter(m => m.active),
    tasks: Object.values(state.tasks),
    commits: state.commits,
    prs: Object.values(state.prs),
    candidates: state.candidates,
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
    audit: state.audit,
    governance: Object.values(state.prs).map(pr => ({
      prId: pr.id,
      blockers: blockers(state, pr.id),
      stages: pr.candidateId ? progress(state, pr, state.candidates[pr.candidateId]) : []
    }))
  });
}
export type WorkspaceSnapshot = ReturnType<typeof snapshot>;
