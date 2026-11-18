import { computeCommitExchangeRecordFingerprint } from '@aiao/rxdb-plugin-working-tree/exchange';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { diffRecords } from '../src/changes.js';
import { fixtures } from './fixtures.js';

/**
 * 已部署目标上 PostgREST 层的 RLS 验收（ADMIN-US-217 AC#5，对应 `read-projections.integration.spec.ts` 的数据库矩阵）：
 * 真实的部署栈、真实签发的 ES256 令牌，经网关的 PostgREST 读 public 下的全部只读投影与读取函数，经 Realtime 加入私有频道。
 * 身份：本团队成员（管理员）、跨团队与跨应用的成员（第二个账号只在别的团队、同团队的别的应用里）、被撤成员、匿名。
 * 只读投影只对本团队可读成员有行；任何写入都被拒绝；敏感列不在投影里；私有频道只让可读成员加入。
 * 只在 `ADMIN_E2E_TARGET=deployed` 下运行（项目 `rls`）。
 */
interface Account {
  id: string;
  email: string;
  otp: string;
}
interface Fixture {
  teamId: string;
  appId: string;
  admin: Account;
  reviewer: Account;
  secondReviewer: Account;
  secondary: { teamId: string; appId: string };
  sideApp: { teamId: string; appId: string };
  invitation: string;
  token: string;
  supabaseUrl: string;
  supabaseKey: string;
}
/** 客户端读取的全部 public 关系（与数据库矩阵同一份清单，含审计归档的合并投影）。 */
const projections = [
  'admin_workspaces',
  'admin_members',
  'admin_invitations',
  'admin_tasks',
  'admin_prs',
  'admin_candidates',
  'admin_reviews',
  'admin_threads',
  'admin_comments',
  'admin_notifications',
  'admin_receipts',
  'admin_commits',
  'admin_schemas',
  'shared_records',
  'admin_shared',
  'admin_audit',
  'admin_audit_events',
  'admin_changes',
  'admin_workspace_versions'
];
/** 管理员一定读得到行的投影：经下文的命令序列（任务、提交、PR、候选、讨论、合并、邀请、撤权）都写过。 */
const populated = projections.filter(name => !['admin_reviews', 'admin_notifications'].includes(name));
/** 不出现在投影里的敏感列。 */
const hidden: [projection: string, column: string][] = [
  ['admin_workspaces', 'bootstrap_key'],
  ['admin_invitations', 'token_hash'],
  ['admin_receipts', 'fingerprint'],
  ['admin_commits', 'content_fingerprint']
];

const scope = (workspace: { teamId: string; appId: string }) =>
  `team_id=eq.${workspace.teamId}&app_id=eq.${workspace.appId}`;
async function signIn(fixture: Fixture, account: Account): Promise<{ client: SupabaseClient; token: string }> {
  const client = createClient(fixture.supabaseUrl, fixture.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.verifyOtp({ email: account.email, token: account.otp, type: 'email' });
  if (error || !data.session) throw error ?? new Error('no session');
  return { client, token: data.session.access_token };
}
/** 经部署出的静态站点的 `/collaboration-api/*` 改写提交命令（与浏览器同一条写路径）。 */
async function act(
  request: APIRequestContext,
  token: string,
  workspace: { teamId: string; appId: string },
  command: Record<string, unknown>
) {
  const response = await request.post(`/collaboration-api/workspaces/${workspace.teamId}/${workspace.appId}/commands`, {
    headers: { authorization: `Bearer ${token}` },
    data: { ...command, operationId: crypto.randomUUID() }
  });
  const body = (await response.json()) as Record<string, unknown>;
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}

test('PostgREST 与 Realtime 上的 RLS：只读投影、读取函数、写入与私有频道按成员资格裁决（ADMIN-US-217 AC#5）', async ({
  request
}) => {
  const fixture = (await (await request.get(`${fixtures}/__fixture?sideApp=1`)).json()) as Fixture;
  const own = { teamId: fixture.teamId, appId: fixture.appId };
  const admin = await signIn(fixture, fixture.admin);
  const reviewer = await signIn(fixture, fixture.reviewer);
  const outsider = await signIn(fixture, fixture.secondReviewer);
  const rest = async (token: string, path: string, init: { method?: string; body?: unknown } = {}) => {
    const response = await fetch(`${fixture.supabaseUrl}/rest/v1/${path}`, {
      method: init.method ?? 'GET',
      headers: {
        apikey: fixture.supabaseKey,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  };
  const rows = async (token: string, path: string) => {
    const response = await rest(token, path);
    return response.status === 200 ? (response.body as unknown[]) : response;
  };

  // 管理员在本团队走一遍会写到每张投影的命令：任务、提交、PR、候选、讨论、免审批合并
  const [workspace] = (await rows(admin.token, `admin_workspaces?${scope(own)}&select=head`)) as { head: string }[];
  const changes = diffRecords(
    {},
    { 'rls-category': { entity: 'AssetCategory', fields: { name: 'RLS' } } },
    () => 'assets'
  );
  const draft = {
    commitId: 'rls-commit',
    parentIds: [workspace.head],
    kind: 'normal' as const,
    message: 'rls',
    authorId: fixture.admin.id,
    createdAt: new Date().toISOString(),
    units: changes.map(change => ({ ...change, unitId: 'rls-commit', transactionId: null, origin: 'local' as const }))
  };
  const commit = { ...draft, contentFingerprint: computeCommitExchangeRecordFingerprint(draft) };
  await act(request, admin.token, own, { type: 'task', id: 'rls', name: 'rls', expectedHead: workspace.head });
  await act(request, admin.token, own, {
    type: 'upload',
    taskId: 'rls',
    expectedHead: workspace.head,
    commits: [commit]
  });
  await act(request, admin.token, own, {
    type: 'pr',
    id: 'rls',
    taskId: 'rls',
    title: 'rls',
    description: '',
    target: 'shared'
  });
  await act(request, admin.token, own, { type: 'pr_state', prId: 'rls', status: 'review', expectedRevision: 0 });
  await act(request, admin.token, own, { type: 'policy', stages: [], expectedVersion: 1 });
  const candidate = await act(request, admin.token, own, {
    type: 'candidate',
    prId: 'rls',
    expectedRevision: 1,
    resolutions: []
  });
  await act(request, admin.token, own, {
    type: 'thread',
    id: 'rls-thread',
    prId: 'rls',
    candidateId: null,
    recordId: null,
    field: null,
    body: '讨论',
    required: false,
    mentions: []
  });
  await act(request, admin.token, own, {
    type: 'merge',
    prId: 'rls',
    candidateId: candidate['candidateId'],
    expectedSource: 'rls-commit',
    expectedTarget: workspace.head
  });
  // 审核者接受邀请后被撤权；第二个账号只成为另一个团队与同团队另一个应用的成员
  await act(request, reviewer.token, own, { type: 'accept_invite', id: fixture.invitation, tokenHash: fixture.token });
  const [membership] = (await rows(
    admin.token,
    `admin_members?${scope(own)}&user_id=eq.${fixture.reviewer.id}&select=generation`
  )) as { generation: number }[];
  await act(request, admin.token, own, {
    type: 'member',
    userId: fixture.reviewer.id,
    permissions: [],
    active: false,
    expectedGeneration: membership.generation
  });
  for (const [index, elsewhere] of [fixture.secondary, fixture.sideApp].entries()) {
    const token = `rls-side-${index}-${crypto.randomUUID()}`;
    const id = `rls-invite-${index}`;
    await act(request, admin.token, elsewhere, {
      type: 'invite',
      id,
      email: fixture.secondReviewer.email,
      permissions: ['read'],
      tokenHash: token,
      expiresAt: Date.now() + 3600000,
      expectedVersion: 0
    });
    await act(request, outsider.token, elsewhere, { type: 'accept_invite', id, tokenHash: token });
  }
  // 第二个账号确实是另外两个工作区的成员（否则跨团队、跨应用的断言没有意义）
  for (const elsewhere of [fixture.secondary, fixture.sideApp])
    expect(await rows(outsider.token, `admin_workspaces?${scope(elsewhere)}&select=team_id`)).toHaveLength(1);

  const identities = { member: admin.token, outsider: outsider.token, revoked: reviewer.token };
  for (const projection of projections) {
    const path = `${projection}?${scope(own)}&select=*`;
    const mine = await rows(identities.member, path);
    expect(Array.isArray(mine), `${projection} 成员可读`).toBe(true);
    if (populated.includes(projection))
      expect((mine as unknown[]).length, `${projection} 成员读得到行`).toBeGreaterThan(0);
    for (const [who, token] of Object.entries({ outsider: identities.outsider, revoked: identities.revoked }))
      expect(await rows(token, path), `${projection} ${who}`).toEqual([]);
    // 匿名没有任何读权限
    const anonymous = await rest(fixture.supabaseKey, path);
    expect(
      anonymous.status === 401 ||
        (anonymous.status === 200 && Array.isArray(anonymous.body) && anonymous.body.length === 0),
      `${projection} anon ${anonymous.status}`
    ).toBe(true);
    // 任何写入都被拒绝，行数不变
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const write = await rest(identities.member, method === 'POST' ? projection : path, {
        method,
        body: method === 'DELETE' ? undefined : { team_id: own.teamId, app_id: own.appId }
      });
      expect(write.status, `${method} ${projection}`).toBeGreaterThanOrEqual(400);
    }
    expect(await rows(identities.member, path)).toHaveLength((mine as unknown[]).length);
  }
  for (const [projection, column] of hidden) {
    const response = await rest(identities.member, `${projection}?${scope(own)}&select=${column}`);
    expect(response.status, `${projection}.${column} 不在投影里`).toBe(400);
  }

  // 读取函数：成员读得到，其余身份得到 null；匿名没有执行权限
  const [head] = (await rows(admin.token, `admin_workspaces?${scope(own)}&select=head`)) as { head: string }[];
  const calls: [string, Record<string, unknown>][] = [
    ['admin_shared_records', { p_team_id: own.teamId, p_app_id: own.appId }],
    ['admin_commit_path', { p_team_id: own.teamId, p_app_id: own.appId, p_from: head.head, p_until: null }],
    ['admin_commit_lineage', { p_team_id: own.teamId, p_app_id: own.appId, p_id: 'rls-commit' }],
    [
      'admin_commit_history',
      { p_team_id: own.teamId, p_app_id: own.appId, p_from: head.head, p_until: null, p_limit: 10 }
    ],
    ['admin_commit_changes', { p_team_id: own.teamId, p_app_id: own.appId, p_commit_ids: ['rls-commit'] }],
    [
      'admin_commit_exchange',
      { p_team_id: own.teamId, p_app_id: own.appId, p_ref: 'shared', p_known: null, p_limit: 10 }
    ],
    ['admin_audit_page', { p_team_id: own.teamId, p_app_id: own.appId, p_before: null, p_limit: 10 }]
  ];
  for (const [fn, args] of calls) {
    const mine = await rest(identities.member, `rpc/${fn}`, { method: 'POST', body: args });
    expect(mine.status, `${fn} ${JSON.stringify(mine.body)}`).toBe(200);
    expect(mine.body, fn).not.toBeNull();
    for (const [who, token] of Object.entries({ outsider: identities.outsider, revoked: identities.revoked })) {
      const theirs = await rest(token, `rpc/${fn}`, { method: 'POST', body: args });
      expect([theirs.status, theirs.body], `${fn} ${who}`).toEqual([200, null]);
    }
    expect((await rest(fixture.supabaseKey, `rpc/${fn}`, { method: 'POST', body: args })).status, `${fn} anon`).toBe(
      401
    );
  }

  // 私有频道：成员能加入，跨团队与被撤成员加入时被 Realtime 按 RLS 拒绝
  const join = async (client: SupabaseClient, token: string) => {
    await client.realtime.setAuth(token);
    const channel = client.channel(`collab:${own.teamId}:${own.appId}`, { config: { private: true } });
    const state = await new Promise<string>(resolve => {
      const timer = setTimeout(() => resolve('TIMED_OUT'), 15000);
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          resolve(status);
        }
      });
    });
    await client.removeAllChannels();
    return state;
  };
  expect(await join(admin.client, admin.token)).toBe('SUBSCRIBED');
  expect(await join(outsider.client, outsider.token)).toBe('CHANNEL_ERROR');
  expect(await join(reviewer.client, reviewer.token)).toBe('CHANNEL_ERROR');
});
