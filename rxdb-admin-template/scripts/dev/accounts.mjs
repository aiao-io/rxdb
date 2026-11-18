/**
 * 本地开发的测试账号。登录是邮箱验证码（passwordless），没有密码：验证码邮件进本地收件服务，开发导航显示每个账号的最新验证码。
 * 管理员是本地栈的初始管理员（`local-up` 在 Auth 里建好，初始化时成为团队管理员）；其余账号每次 `nx dev` 都确认在 Auth 里存在、
 * 邮箱已验证，并经邀请与接受邀请成为团队成员——与页面上邀请、接受走同一套协作命令与事务，审计里看得到这两条记录。
 */
import { createHash, randomUUID } from 'node:crypto';
import { ownerEmail } from '../../deploy/scripts/lib/paths.mjs';

/** 协作的全部权限（与 `packages/collaboration/src/model.ts` 的 `permissions` 一致，accounts.spec.mjs 校验）。 */
export const allPermissions = ['read', 'edit', 'comment', 'review', 'merge', 'manage'];

/** 团队管理员：全部权限。 */
export const ownerAccount = {
  key: 'owner',
  role: '管理员',
  email: ownerEmail,
  permissions: allPermissions,
  duty: '成员、邀请与审批策略；合并 PR'
};

/** 管理员以外的成员：覆盖发起、审核与只读三种协作角色。 */
export const memberAccounts = [
  {
    key: 'editor',
    role: '编辑者',
    email: 'editor@admin-template.local',
    permissions: ['read', 'edit', 'comment'],
    duty: '建任务、编辑并同步草稿、发起 PR'
  },
  {
    key: 'reviewer',
    role: '审核者',
    email: 'reviewer@admin-template.local',
    permissions: ['read', 'comment', 'review'],
    duty: '审核与批准 PR（不能批准自己发起的 PR）'
  },
  {
    key: 'viewer',
    role: '只读成员',
    email: 'viewer@admin-template.local',
    permissions: ['read'],
    duty: '只能查看，用来验证权限边界'
  }
];

export const developmentAccounts = [ownerAccount, ...memberAccounts];

/** 调 Auth 管理接口（service role key 只在本机脚本里用，不进任何页面）；失败时报出方法、路径与状态码。 */
async function authAdmin(fetch, { supabaseUrl, serviceKey }, method, target, body) {
  const response = await fetch(`${supabaseUrl}${target}`, {
    method,
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Auth 管理接口 ${method} ${target} 返回 ${response.status}`);
  return response.json();
}

/**
 * 确认每个邮箱在 Auth 里都有账号且邮箱已验证：已有的保留账号 ID 与数据，只重新确认邮箱；缺的新建。返回邮箱 → 账号 ID。
 *
 * @param {string[]} emails
 * @param {{ supabaseUrl: string, serviceKey: string, fetch?: typeof globalThis.fetch }} options
 * @returns {Promise<Map<string, string>>}
 */
export async function ensureAuthUsers(emails, { fetch = globalThis.fetch, ...target }) {
  const { users } = await authAdmin(fetch, target, 'GET', '/auth/v1/admin/users?per_page=1000');
  const ids = new Map();
  for (const email of emails) {
    const existing = users.find(user => user.email === email);
    const user =
      existing ?
        await authAdmin(fetch, target, 'PUT', `/auth/v1/admin/users/${existing.id}`, { email_confirm: true })
      : await authAdmin(fetch, target, 'POST', '/auth/v1/admin/users', { email, email_confirm: true });
    ids.set(email, user.id);
  }
  return ids;
}

/**
 * 让测试账号成为团队的有效成员：不是的，由管理员发邀请、账号本人接受；已是有效成员的保持原样（包括在页面上改过的权限）。
 * 命令直接交给仓储执行——与命令入口经 HTTP 解析后交给仓储的是同一份命令（邀请令牌只存摘要，这里直接给出摘要）。
 *
 * @param {object} options
 * @param {{ operation(user: object, teamId: string, appId: string, command: object): Promise<unknown> }} options.repository
 * @param {{ teamId: string, appId: string }} options.workspace
 * @param {{ id: string, email: string, verified: true }} options.owner 发邀请的管理员
 * @param {Array<{ id: string, email: string, permissions: string[] }>} options.members
 * @param {Set<string>} options.activeMembers 当前有效成员的账号 ID
 * @returns {Promise<string[]>} 这次加入团队的邮箱
 */
export async function ensureMemberships({ repository, workspace, owner, members, activeMembers }) {
  const added = [];
  for (const member of members.filter(item => !activeMembers.has(item.id))) {
    const id = randomUUID();
    const tokenHash = createHash('sha256').update(randomUUID()).digest('hex');
    const command = (user, body) =>
      repository.operation(user, workspace.teamId, workspace.appId, { ...body, operationId: randomUUID() });
    await command(owner, {
      type: 'invite',
      id,
      email: member.email,
      permissions: member.permissions,
      tokenHash,
      expiresAt: Date.now() + 3_600_000,
      expectedVersion: 0
    });
    await command({ id: member.id, email: member.email, verified: true }, { type: 'accept_invite', id, tokenHash });
    added.push(member.email);
  }
  return added;
}
