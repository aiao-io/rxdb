import { demand, permissions, type Command, type Environment, type Identity, type Workspace } from '../model.js';
import { authorize, expected } from './access.js';

export function membershipCommand(
  state: Workspace,
  user: Identity,
  command: Command,
  env: Environment
): Record<string, unknown> | undefined {
  if (command.type === 'accept_invite') return accept(state, user, command, env);
  if (command.type === 'invite') return invite(state, user, command, env);
  if (command.type === 'revoke_invite') {
    authorize(state, user, 'manage');
    const invitation = state.invitations[command.id];
    demand(invitation, 'not_found', '邀请不存在');
    expected(invitation.version, command.expectedVersion);
    demand(invitation.state !== 'accepted', 'state', '已接受的邀请不能撤回成员关系，请使用移除成员');
    invitation.state = 'revoked';
    invitation.version++;
    return { invitationId: invitation.id };
  }
  if (command.type === 'member') {
    const actor = authorize(state, user, 'manage');
    const member = state.members[command.userId];
    demand(member, 'not_found', '成员不存在');
    expected(member.generation, command.expectedGeneration);
    demand(
      command.permissions.every(permission => actor.permissions.includes(permission)),
      'forbidden',
      '不能授予自己没有的权限'
    );
    demand(!command.active || command.permissions.includes('read'), 'invalid', '有效成员必须有查看权限');
    const managers = Object.values(state.members).filter(m => m.active && m.permissions.includes('manage'));
    demand(
      managers.length > 1 ||
        !member.permissions.includes('manage') ||
        (command.active && command.permissions.includes('manage')),
      'state',
      '不能移除最后一名管理员'
    );
    member.active = command.active;
    member.permissions = [...command.permissions];
    member.generation++;
    return { userId: member.id, generation: member.generation };
  }
  if (command.type === 'policy') {
    authorize(state, user, 'manage');
    expected(state.policy.version, command.expectedVersion);
    const seen = new Set<string>();
    for (const stage of command.stages) {
      demand(
        !seen.has(stage.id) && stage.minimum > 0 && Number.isInteger(stage.minimum) && stage.minimum <= 100,
        'invalid',
        '审批阶段或人数无效'
      );
      demand(
        stage.after.every(id => seen.has(id)),
        'invalid',
        '审批前置阶段必须位于当前阶段之前'
      );
      demand(
        stage.reviewers.every(id => state.members[id]?.active && state.members[id].permissions.includes('review')),
        'invalid',
        '阶段审核人没有审核权限'
      );
      seen.add(stage.id);
    }
    state.policy = { version: state.policy.version + 1, stages: structuredClone(command.stages) };
    return { policyVersion: state.policy.version };
  }
  return undefined;
}
function invite(state: Workspace, user: Identity, command: Extract<Command, { type: 'invite' }>, env: Environment) {
  const member = authorize(state, user, 'manage');
  const previous = state.invitations[command.id];
  expected(previous?.version ?? 0, command.expectedVersion);
  demand(!previous || previous.state !== 'accepted', 'state', '已接受的邀请不能重发');
  demand(
    command.permissions.includes('read') &&
      command.permissions.every(p => permissions.includes(p) && member.permissions.includes(p)),
    'forbidden',
    '邀请权限超出可授予范围'
  );
  demand(
    command.expiresAt > env.now && command.expiresAt <= env.now + 7 * 86400000,
    'invalid',
    '邀请有效期必须在七天内'
  );
  demand(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(command.email), 'invalid', '邮箱格式无效');
  state.invitations[command.id] = {
    id: command.id,
    email: command.email.trim().toLowerCase(),
    permissions: [...command.permissions],
    inviterId: user.id,
    tokenHash: command.tokenHash,
    version: (previous?.version ?? 0) + 1,
    expiresAt: command.expiresAt,
    state: 'pending',
    acceptedBy: null
  };
  return { invitationId: command.id, version: state.invitations[command.id].version };
}
function accept(
  state: Workspace,
  user: Identity,
  command: Extract<Command, { type: 'accept_invite' }>,
  env: Environment
) {
  const invitation = state.invitations[command.id];
  demand(
    user.verified &&
      invitation &&
      invitation.tokenHash === command.tokenHash &&
      invitation.email === user.email.trim().toLowerCase(),
    'forbidden',
    '邀请无效或登录邮箱不匹配，请切换账号'
  );
  const existing = state.members[user.id];
  if (invitation.state === 'accepted') {
    demand(invitation.acceptedBy === user.id && existing?.active, 'forbidden', '旧邀请不能恢复已移除的成员');
    return { userId: user.id, teamId: state.teamId };
  }
  demand(invitation.state === 'pending' && invitation.expiresAt > env.now, 'expired', '邀请已过期或撤销');
  const inviter = state.members[invitation.inviterId];
  demand(
    inviter?.active &&
      inviter.permissions.includes('manage') &&
      invitation.permissions.every(p => inviter.permissions.includes(p)),
    'forbidden',
    '邀请人的授权已失效'
  );
  if (!existing?.active)
    state.members[user.id] = {
      id: user.id,
      email: user.email,
      permissions: [...invitation.permissions],
      generation: (existing?.generation ?? 0) + 1,
      active: true
    };
  invitation.state = 'accepted';
  invitation.acceptedBy = user.id;
  return { userId: user.id, teamId: state.teamId };
}
