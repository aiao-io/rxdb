import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ownerEmail } from '../../deploy/scripts/lib/paths.mjs';
import {
  allPermissions,
  developmentAccounts,
  ensureAuthUsers,
  ensureMemberships,
  memberAccounts,
  ownerAccount
} from './accounts.mjs';
import { mailboxOf } from './mail.mjs';

const product = path.resolve(import.meta.dirname, '../..');
const supabaseUrl = 'http://127.0.0.1:4500';
const serviceKey = 'service-key-for-test';

describe('测试账号的定义', () => {
  it('管理员就是本地栈的初始管理员，其余账号的收件箱互不相同', () => {
    assert.deepEqual(developmentAccounts, [ownerAccount, ...memberAccounts]);
    assert.equal(ownerAccount.email, ownerEmail);
    assert.deepEqual(ownerAccount.permissions, allPermissions);
    const mailboxes = developmentAccounts.map(account => mailboxOf(account.email));
    assert.equal(new Set(mailboxes).size, mailboxes.length);
  });

  it('权限表与协作包的权限一致，每个账号都有查看权限', async () => {
    const model = await readFile(path.join(product, 'packages/collaboration/src/model.ts'), 'utf8');
    const declared = /export const permissions = \[([^\]]+)\] as const;/.exec(model)?.[1];
    assert.deepEqual(allPermissions, [...declared.matchAll(/'(\w+)'/g)].map(match => match[1]));
    for (const account of developmentAccounts) {
      assert.ok(account.permissions.includes('read'), account.email);
      assert.ok(
        account.permissions.every(permission => allPermissions.includes(permission)),
        account.email
      );
    }
  });

  it('覆盖发起、审核、合并与只读几种协作角色', () => {
    const holders = permission =>
      developmentAccounts.filter(account => account.permissions.includes(permission)).map(account => account.key);
    assert.deepEqual(holders('edit'), ['owner', 'editor']);
    assert.deepEqual(holders('review'), ['owner', 'reviewer']);
    assert.deepEqual(holders('merge'), ['owner']);
    assert.deepEqual(
      developmentAccounts.filter(account => account.permissions.length === 1).map(account => account.key),
      ['viewer']
    );
  });
});

/** Auth 管理接口的替身：按方法与路径应答，记下每个请求。 */
function authAdmin(users, { failCreate = false } = {}) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const target = new URL(url);
    requests.push({ method, path: `${target.pathname}${target.search}`, headers: init.headers, body: init.body });
    if (method === 'GET') return Response.json({ users });
    if (method === 'PUT') return Response.json({ id: target.pathname.split('/').at(-1) });
    if (failCreate) return Response.json({ msg: 'boom' }, { status: 500 });
    return Response.json({ id: `id-${JSON.parse(init.body).email}` });
  };
  return { fetch, requests };
}

describe('在 Auth 里准备测试账号', () => {
  it('已有账号保留 ID、重新确认邮箱；缺的账号新建并确认邮箱', async () => {
    const { fetch, requests } = authAdmin([{ id: 'existing-owner', email: ownerEmail }]);
    const ids = await ensureAuthUsers([ownerEmail, 'editor@admin-template.local'], { supabaseUrl, serviceKey, fetch });
    assert.deepEqual(
      [...ids],
      [
        [ownerEmail, 'existing-owner'],
        ['editor@admin-template.local', 'id-editor@admin-template.local']
      ]
    );
    assert.deepEqual(
      requests.map(({ method, path: target }) => `${method} ${target}`),
      [
        'GET /auth/v1/admin/users?per_page=1000',
        'PUT /auth/v1/admin/users/existing-owner',
        'POST /auth/v1/admin/users'
      ]
    );
    assert.deepEqual(JSON.parse(requests[1].body), { email_confirm: true });
    assert.deepEqual(JSON.parse(requests[2].body), { email: 'editor@admin-template.local', email_confirm: true });
    for (const request of requests) {
      assert.equal(request.headers.apikey, serviceKey);
      assert.equal(request.headers.authorization, `Bearer ${serviceKey}`);
    }
  });

  it('管理接口出错时报出方法、路径与状态码', async () => {
    const { fetch } = authAdmin([], { failCreate: true });
    await assert.rejects(
      ensureAuthUsers(['editor@admin-template.local'], { supabaseUrl, serviceKey, fetch }),
      /POST \/auth\/v1\/admin\/users.*500/
    );
  });
});

describe('让测试账号成为团队成员', () => {
  const workspace = { teamId: 'admin-template-local', appId: 'assets' };
  const owner = { id: 'owner-id', email: ownerEmail, verified: true };
  const members = [
    { id: 'editor-id', email: 'editor@admin-template.local', permissions: ['read', 'edit', 'comment'] },
    { id: 'viewer-id', email: 'viewer@admin-template.local', permissions: ['read'] }
  ];
  const recorder = () => {
    const operations = [];
    return { operations, operation: async (...args) => void operations.push(args) };
  };

  it('不是有效成员的账号：管理员发邀请，账号本人接受，与页面走同一条命令路径', async () => {
    const repository = recorder();
    const started = Date.now();
    const added = await ensureMemberships({ repository, workspace, owner, members, activeMembers: new Set() });
    assert.deepEqual(added, ['editor@admin-template.local', 'viewer@admin-template.local']);
    assert.equal(repository.operations.length, 4);
    const [[inviter, teamId, appId, invite], [invitee, , , accept]] = repository.operations;
    assert.deepEqual([inviter, teamId, appId], [owner, workspace.teamId, workspace.appId]);
    assert.equal(invite.type, 'invite');
    assert.equal(invite.email, 'editor@admin-template.local');
    assert.deepEqual(invite.permissions, ['read', 'edit', 'comment']);
    assert.equal(invite.expectedVersion, 0);
    assert.match(invite.tokenHash, /^[0-9a-f]{64}$/);
    assert.ok(invite.expiresAt > started && invite.expiresAt <= started + 7 * 86_400_000);
    assert.deepEqual(invitee, { id: 'editor-id', email: 'editor@admin-template.local', verified: true });
    assert.deepEqual(accept, {
      type: 'accept_invite',
      id: invite.id,
      tokenHash: invite.tokenHash,
      operationId: accept.operationId
    });
    const operationIds = repository.operations.map(([, , , command]) => command.operationId);
    assert.equal(new Set(operationIds).size, 4);
  });

  it('已是有效成员的账号保持原样（包括在页面上改过的权限）', async () => {
    const repository = recorder();
    const added = await ensureMemberships({
      repository,
      workspace,
      owner,
      members,
      activeMembers: new Set(['editor-id', 'viewer-id'])
    });
    assert.deepEqual(added, []);
    assert.equal(repository.operations.length, 0);
  });
});
