import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CollaborationApi } from '../client/api.js';
import { taskCommit } from '../commit.testing.js';
import type { Command, Records } from '../model.js';
import { assetSchema, diffAssets } from '../schema.testing.js';
import {
  contractOrigin,
  person,
  poolerSize,
  poolerWaitSeconds,
  startContractStack,
  type ContractStack,
  type Person
} from './contract-stack.testing.js';
import { startEdgeFunction } from './edge-fixture.js';
import { transactionLimits } from './repository.js';

/**
 * 同一套命令契约，分别打 Node 入口与 Edge Function 入口（ADMIN-US-220 AC#2）：两个入口都以协作专用数据库角色、经 transaction 模式的
 * PgBouncer 连同一个干净的库（拓扑见 `contract-stack.testing.ts`）。每个用例先断言本入口的行为，再把与入口无关的规范化结果
 * （状态码、错误码、行数、等待是否发生）记下来；最后一个用例要求两个入口逐项相同。
 * 覆盖：幂等重放、同任务并发上传一胜一负、撤权与批准交错、权限拒绝、事务失败回滚、等锁超时与连接池耗尽（可重试的 503，
 * 重试只执行一次）、浏览器端客户端按 Retry-After 自动重发（AC#5），以及全部 21 种命令都能由专用角色执行（AC#4）；
 * 另有 Edge Function 冷启动失败（平台 503 BOOT_ERROR）与 transaction 模式约束的用例。
 */
const entries = ['node', 'edge'] as const;
type Entry = (typeof entries)[number];
interface Workspace {
  teamId: string;
  appId: string;
  /** 共享分支的根（初始化时写下的 baseline 提交）：新任务从它起步，第一次合并之前共享头就是它。 */
  root: string;
}
interface Reply {
  status: number;
  body: Record<string, unknown>;
  retryAfter: string | null;
}
let stack: ContractStack;
const outcomes: Record<Entry, Record<string, unknown>> = { node: {}, edge: {} };
const admin = person('contract-admin');

beforeAll(async () => {
  stack = await startContractStack();
  stack.register(admin);
}, 240_000);
afterAll(async () => {
  // 排查用：CONTRACT_EDGE_LOGS=<文件> 时把函数容器的日志写到该文件
  if (process.env['CONTRACT_EDGE_LOGS'] && stack)
    await writeFile(process.env['CONTRACT_EDGE_LOGS'], await stack.edge.logs());
  await stack?.stop();
}, 60_000);

/** 一个只有初始管理员的新工作区：以迁移所有者初始化（部署期步骤），之后全部经命令入口。 */
async function workspace(): Promise<Workspace> {
  const seed = { teamId: randomUUID(), appId: 'assets' };
  await stack.repository.initialize({
    ...seed,
    name: '契约测试',
    bootstrapKey: randomUUID(),
    admin,
    schema: assetSchema
  });
  const root = await stack.owner.query<{ id: string }>(
    "SELECT id FROM admin_private.commits WHERE team_id = $1 AND app_id = $2 AND kind = 'baseline'",
    [seed.teamId, seed.appId]
  );
  return { ...seed, root: root.rows[0].id };
}
const command = (data: Record<string, unknown>) => ({ operationId: randomUUID(), ...data });
/** 向一个入口提交命令；`who` 为 null 时不带令牌，为字符串时原样作为令牌。 */
async function send(
  entry: Entry,
  space: Workspace,
  body: Record<string, unknown>,
  who: Person | string | null,
  headers: Record<string, string> = {}
): Promise<Reply> {
  const token =
    who === null ? undefined
    : typeof who === 'string' ? who
    : stack.token(who);
  const response = await fetch(`${stack.bases[entry]}/workspaces/${space.teamId}/${space.appId}/commands`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // 平台层或网关的非 JSON 响应：原样保留，断言时能看到内容
    parsed = { raw: text };
  }
  return { status: response.status, body: parsed, retryAfter: response.headers.get('retry-after') };
}
/** 命令必须成功，否则带上响应内容报错。 */
async function ok(entry: Entry, space: Workspace, data: Record<string, unknown>, who: Person = admin) {
  const reply = await send(entry, space, command(data), who);
  expect(reply.status, `${String(data['type'])}: ${JSON.stringify(reply.body)}`).toBe(200);
  return reply.body;
}
/** 一条分类记录：标识只用 ASCII（记录标识的格式要求），名称可以是中文。 */
const records = (name: string): Records => ({
  [`c-${[...name].map(char => char.codePointAt(0)!.toString(16)).join('')}`]: {
    entity: 'AssetCategory',
    fields: { name }
  }
});
const commit = (id: string, parent: string, before: Records, after: Records, author: Person = admin) =>
  taskCommit({ id, parent, authorId: author.id, message: id, changes: diffAssets(before, after) });
/** 时限内是否仍未完成：用于断言请求被行锁或连接池挡住。 */
const within = (pending: Promise<unknown>, ms: number) =>
  Promise.race([
    pending.then(() => 'done' as const),
    new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), ms))
  ]);
const value = async (sql: string, params: unknown[]) =>
  (await stack.owner.query(sql, params)).rows[0] as Record<string, unknown>;
/** 工作区的规范化计数：行数、修订号与广播条数（与入口无关）。 */
async function facts(space: Workspace) {
  const scope = [space.teamId, space.appId];
  const row = await value(
    `SELECT
       (SELECT count(*)::int FROM admin_private.tasks WHERE team_id = $1 AND app_id = $2) AS tasks,
       (SELECT count(*)::int FROM admin_private.commits WHERE team_id = $1 AND app_id = $2) AS commits,
       (SELECT count(*)::int FROM admin_private.operations WHERE team_id = $1 AND app_id = $2) AS receipts,
       (SELECT count(*)::int FROM public.admin_audit WHERE team_id = $1 AND app_id = $2) AS audit,
       (SELECT revision::int FROM public.admin_workspace_versions WHERE team_id = $1 AND app_id = $2) AS revision,
       (SELECT count(*)::int FROM public.shared_records WHERE team_id = $1 AND app_id = $2) AS shared,
       (SELECT count(*)::int FROM realtime.messages
          WHERE topic = 'collab:' || $1 || ':' || $2 AND event = 'changed' AND private) AS broadcasts`,
    scope
  );
  return row;
}
/**
 * 让命令事务停在写审计的那一步（触发器里等一个由测试持有的会话级咨询锁），用来确定性地制造交错；只作用于这个工作区。
 * 触发器函数以执行命令的专用角色身份运行：它只调用对 PUBLIC 开放的 pg_advisory_xact_lock。
 */
async function suspend(space: Workspace, name: string, action: string) {
  const key = Math.floor(Math.random() * 2 ** 31);
  const holder = await stack.owner.connect();
  await holder.query('SELECT pg_advisory_lock($1)', [key]);
  await stack.owner.query(
    `CREATE FUNCTION admin_private.${name}() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN PERFORM pg_advisory_xact_lock(${key}); RETURN NEW; END $$`
  );
  await stack.owner.query(
    `CREATE TRIGGER ${name} BEFORE INSERT ON public.admin_audit FOR EACH ROW
     WHEN (NEW.team_id = '${space.teamId}' AND NEW.action = '${action}') EXECUTE FUNCTION admin_private.${name}()`
  );
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    await holder.query('SELECT pg_advisory_unlock($1)', [key]);
  };
  return {
    release,
    drop: async () => {
      await release();
      holder.release();
      await stack.owner.query(`DROP TRIGGER IF EXISTS ${name} ON public.admin_audit`);
      await stack.owner.query(`DROP FUNCTION IF EXISTS admin_private.${name}()`);
    }
  };
}
/** 受邀并接受：成员带给定权限。 */
async function member(entry: Entry, space: Workspace, who: Person, permissions: string[]) {
  stack.register(who);
  await ok(entry, space, {
    type: 'invite',
    id: `invite-${who.id.slice(0, 8)}`,
    email: who.email,
    permissions,
    tokenHash: `token-${who.id}`,
    expiresAt: Date.now() + 3_600_000,
    expectedVersion: 0
  });
  await ok(
    entry,
    space,
    { type: 'accept_invite', id: `invite-${who.id.slice(0, 8)}`, tokenHash: `token-${who.id}` },
    who
  );
}
/** 一个进入审核、已有候选的 PR，返回候选与来源提交。 */
async function reviewablePr(entry: Entry, space: Workspace) {
  await ok(entry, space, { type: 'task', id: 'task', name: '任务', expectedHead: space.root });
  const source = commit('c1', space.root, {}, records('一'));
  await ok(entry, space, { type: 'upload', taskId: 'task', expectedHead: space.root, commits: [source] });
  await ok(entry, space, { type: 'pr', id: 'pr', taskId: 'task', title: '合并', description: '', target: 'shared' });
  await ok(entry, space, { type: 'pr_state', prId: 'pr', status: 'review', expectedRevision: 0 });
  const { candidateId } = await ok(entry, space, {
    type: 'candidate',
    prId: 'pr',
    expectedRevision: 1,
    resolutions: []
  });
  return { candidateId: candidateId as string, source: source.commitId };
}

describe.each(entries)('命令契约：%s 入口', entry => {
  it('幂等重放：同一个操作 ID 重发返回原结果、只执行一次；换参数复用同一个操作 ID 被拒绝', async () => {
    const space = await workspace();
    const task = command({ type: 'task', id: 'task', name: '任务', expectedHead: space.root });
    const first = await send(entry, space, task, admin);
    const replay = await send(entry, space, task, admin);
    const reused = await send(entry, space, { ...task, id: 'other' }, admin);
    const upload = command({
      type: 'upload',
      taskId: 'task',
      expectedHead: space.root,
      commits: [commit('c1', space.root, {}, records('一'))]
    });
    const uploaded = await send(entry, space, upload, admin);
    const reuploaded = await send(entry, space, upload, admin);
    const counted = await facts(space);
    expect([first.status, replay.status, uploaded.status, reuploaded.status]).toEqual([200, 200, 200, 200]);
    expect(replay.body).toEqual(first.body);
    expect(reuploaded.body).toEqual(uploaded.body);
    expect(reused).toMatchObject({ status: 409, body: { error: 'idempotency' } });
    // 提交是根与上传的那一个：重放没有多写
    expect(counted).toMatchObject({ tasks: 1, commits: 2, receipts: 2, revision: 2, broadcasts: 2 });
    outcomes[entry]['idempotency'] = {
      statuses: [first.status, replay.status, reused.status, uploaded.status, reuploaded.status],
      reused: reused.body['error'],
      results: [Object.keys(first.body).sort(), Object.keys(uploaded.body).sort()],
      facts: counted
    };
  });

  it('并发：同一任务的两个上传同时到达，一个成功、一个以 diverged 失败并带回胜者的头', async () => {
    const space = await workspace();
    await ok(entry, space, { type: 'task', id: 'race', name: '并发', expectedHead: space.root });
    const uploads = ['甲', '乙'].map(name =>
      command({
        type: 'upload',
        taskId: 'race',
        expectedHead: space.root,
        commits: [commit(`race-${name === '甲' ? 'a' : 'b'}`, space.root, {}, records(name))]
      })
    );
    const replies = await Promise.all(uploads.map(upload => send(entry, space, upload, admin)));
    const head = (
      await value(`SELECT head FROM admin_private.refs WHERE team_id = $1 AND app_id = $2 AND ref = 'tasks/race'`, [
        space.teamId,
        space.appId
      ])
    )['head'];
    const loser = replies.find(reply => reply.status !== 200)!;
    expect(replies.map(reply => reply.status).sort()).toEqual([200, 409]);
    expect(loser.body).toMatchObject({ error: 'diverged', details: { remoteHead: head } });
    outcomes[entry]['concurrentUploads'] = {
      statuses: replies.map(reply => reply.status).sort(),
      loser: loser.body['error'],
      loserSeesWinner: (loser.body['details'] as Record<string, unknown>)['remoteHead'] === head,
      facts: await facts(space)
    };
  });

  it('并发：撤权等在途的批准提交，批准随授权代次失效；等在撤权之后的批准与评论按撤权后的成员关系一律拒绝', async () => {
    const space = await workspace();
    const reviewer = person('contract-reviewer');
    await member(entry, space, reviewer, ['read', 'review', 'comment']);
    const { candidateId, source } = await reviewablePr(entry, space);
    const approve = (expectedRevision: number) =>
      send(
        entry,
        space,
        command({
          type: 'review',
          prId: 'pr',
          candidateId,
          expectedSource: source,
          stageId: 'review',
          decision: 'approve',
          reason: '',
          expectedRevision
        }),
        reviewer
      );
    const grant = (permissions: string[], expectedGeneration: number) =>
      send(
        entry,
        space,
        command({ type: 'member', userId: reviewer.id, permissions, active: true, expectedGeneration }),
        admin
      );
    const merge = () =>
      send(
        entry,
        space,
        command({ type: 'merge', prId: 'pr', candidateId, expectedSource: source, expectedTarget: space.root }),
        admin
      );

    const reviews = await suspend(space, `pause_review_${entry}`, 'review');
    let first: unknown[];
    try {
      const approval = approve(0);
      const approvalWaited = await within(approval, 500);
      const revoke = grant(['read'], 1);
      const revokeWaited = await within(revoke, 700);
      await reviews.release();
      const [approved, revoked] = await Promise.all([approval, revoke]);
      expect([approvalWaited, revokeWaited]).toEqual(['pending', 'pending']);
      expect([approved.status, revoked.status]).toEqual([200, 200]);
      first = [approvalWaited, revokeWaited, approved.status, revoked.status];
    } finally {
      await reviews.drop();
    }
    const blocked = await merge();
    expect(blocked.body).toMatchObject({ error: 'approval' });

    expect((await grant(['read', 'review', 'comment'], 2)).status).toBe(200);
    const members = await suspend(space, `pause_member_${entry}`, 'member');
    let second: unknown[];
    try {
      const revoking = grant(['read'], 3);
      const revokingWaited = await within(revoking, 500);
      const late = approve(1);
      const remark = send(
        entry,
        space,
        command({
          type: 'thread',
          id: randomUUID(),
          prId: 'pr',
          candidateId: null,
          recordId: null,
          field: null,
          body: '撤权之后',
          required: false,
          mentions: []
        }),
        reviewer
      );
      const lateWaited = await within(late, 500);
      const remarkWaited = await within(remark, 200);
      await members.release();
      const [revokedAgain, lateApproval, lateRemark] = await Promise.all([revoking, late, remark]);
      expect([revokingWaited, lateWaited, remarkWaited]).toEqual(['pending', 'pending', 'pending']);
      expect(revokedAgain.status).toBe(200);
      expect([lateApproval.body['error'], lateRemark.body['error']]).toEqual(['forbidden', 'forbidden']);
      second = [
        revokingWaited,
        lateWaited,
        remarkWaited,
        revokedAgain.status,
        lateApproval.body['error'],
        lateRemark.body['error']
      ];
    } finally {
      await members.drop();
    }
    outcomes[entry]['revocationRaces'] = { first, mergeAfterRevocation: blocked.body['error'], second };
  }, 60_000);

  it('权限拒绝：缺令牌、伪造或过期令牌、服务端角色令牌、非成员、只读成员、跨团队与白名单外的来源', async () => {
    const space = await workspace();
    const other = await workspace();
    const outsider = person('contract-outsider');
    const reader = person('contract-reader');
    const impostor = person('contract-impostor');
    stack.register(outsider);
    await member(entry, space, reader, ['read']);
    stack.register(impostor);
    await ok(entry, space, {
      type: 'invite',
      id: 'invite-someone',
      email: 'someone-else@example.test',
      permissions: ['read'],
      tokenHash: 'someone-token',
      expiresAt: Date.now() + 3_600_000,
      expectedVersion: 0
    });
    const task = () => command({ type: 'task', id: randomUUID(), name: '越权', expectedHead: space.root });
    const valid = stack.token(admin);
    const forged = `${valid.slice(0, valid.lastIndexOf('.'))}.${Buffer.from('forged').toString('base64url')}`;
    const cases: [string, Promise<Reply>][] = [
      ['missingToken', send(entry, space, task(), null)],
      ['forgedSignature', send(entry, space, task(), forged)],
      ['expired', send(entry, space, task(), stack.token(admin, { exp: Math.floor(Date.now() / 1000) - 60 }))],
      ['serviceRoleToken', send(entry, space, task(), stack.token(admin, { role: 'service_role' }))],
      ['outsider', send(entry, space, task(), outsider)],
      ['readOnlyMember', send(entry, space, task(), reader)],
      ['otherTeam', send(entry, other, task(), reader)],
      ['foreignOrigin', send(entry, space, task(), admin, { origin: 'https://evil.example' })],
      [
        'wrongInvitee',
        send(
          entry,
          space,
          command({ type: 'accept_invite', id: 'invite-someone', tokenHash: 'someone-token' }),
          impostor
        )
      ]
    ];
    const results = Object.fromEntries(
      await Promise.all(
        cases.map(async ([name, pending]) => [name, [(await pending).status, (await pending).body['error']]])
      )
    );
    expect(results).toMatchObject({
      missingToken: [401, 'unauthenticated'],
      forgedSignature: [401, 'unauthenticated'],
      expired: [401, 'unauthenticated'],
      serviceRoleToken: [401, 'unauthenticated'],
      outsider: [403, 'forbidden'],
      readOnlyMember: [403, 'forbidden'],
      otherTeam: [403, 'forbidden'],
      foreignOrigin: [403, 'forbidden']
    });
    expect(Number(results['wrongInvitee'][0])).toBeGreaterThanOrEqual(400);
    // 被拒的请求什么都不写：只有前面的邀请与接受邀请生效
    expect(await facts(space)).toMatchObject({ tasks: 0, receipts: 3, revision: 3 });
    const config = await fetch(`${stack.bases[entry]}/config`, { headers: { origin: contractOrigin } });
    outcomes[entry]['denials'] = { results, config: [config.status, await config.json()], facts: await facts(space) };
  });

  it('事务失败回滚：合并在写审计时失败，共享记录、共享头、合并提交、回执与广播都不落地；去掉故障后用原操作 ID 重试成功', async () => {
    const space = await workspace();
    await ok(entry, space, { type: 'policy', stages: [], expectedVersion: 1 });
    const { candidateId, source } = await reviewablePr(entry, space);
    const merge = command({
      type: 'merge',
      prId: 'pr',
      candidateId,
      expectedSource: source,
      expectedTarget: space.root
    });
    const before = await facts(space);
    const trigger = `fail_merge_${entry}`;
    await stack.owner.query(
      `CREATE FUNCTION admin_private.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN RAISE EXCEPTION 'injected failure'; END $$;
       CREATE TRIGGER ${trigger} BEFORE INSERT ON public.admin_audit FOR EACH ROW
       WHEN (NEW.team_id = '${space.teamId}' AND NEW.action = 'merge') EXECUTE FUNCTION admin_private.${trigger}()`
    );
    let failed: Reply;
    try {
      failed = await send(entry, space, merge, admin);
    } finally {
      await stack.owner.query(
        `DROP TRIGGER ${trigger} ON public.admin_audit; DROP FUNCTION admin_private.${trigger}()`
      );
    }
    const after = await facts(space);
    const head = await value(`SELECT head FROM public.admin_shared WHERE team_id = $1 AND app_id = $2`, [
      space.teamId,
      space.appId
    ]);
    expect(failed).toMatchObject({ status: 500, body: { error: 'internal', details: {} } });
    expect(after).toEqual(before);
    expect(head).toEqual({ head: space.root });
    const retried = await send(entry, space, merge, admin);
    expect(retried.status).toBe(200);
    const merged = await facts(space);
    expect(merged).toMatchObject({
      shared: 1,
      receipts: Number(before['receipts']) + 1,
      revision: Number(before['revision']) + 1
    });
    outcomes[entry]['rollback'] = {
      failed: [failed.status, failed.body['error']],
      unchanged: true,
      retried: retried.status,
      merged
    };
  });

  it('等锁超时：命令在治理行上等满 lock_timeout 后得到 503、Retry-After 与 unavailable，事务已回滚；用原操作 ID 重试只执行一次', async () => {
    const space = await workspace();
    const holder = await stack.owner.connect();
    const task = command({ type: 'task', id: 'blocked', name: '等锁', expectedHead: space.root });
    let blocked: Reply;
    let waited: number;
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2 FOR UPDATE', [
        space.teamId,
        space.appId
      ]);
      const started = Date.now();
      blocked = await send(entry, space, task, admin);
      waited = Date.now() - started;
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
    expect(blocked).toMatchObject({
      status: 503,
      retryAfter: '2',
      body: {
        error: 'unavailable',
        message: '服务暂时不可用，请稍后按原请求重试',
        details: { reason: 'timeout', retryAfter: 2 }
      }
    });
    expect(waited).toBeGreaterThanOrEqual(transactionLimits.lockTimeoutMs - 500);
    expect(await facts(space)).toMatchObject({ tasks: 0, receipts: 0, revision: 0 });
    const retried = await send(entry, space, task, admin);
    const again = await send(entry, space, task, admin);
    expect(retried.status).toBe(200);
    expect(again.body).toEqual(retried.body);
    const counted = await facts(space);
    expect(counted).toMatchObject({ tasks: 1, receipts: 1, revision: 1, broadcasts: 1 });
    outcomes[entry]['lockTimeout'] = {
      blocked: [blocked.status, blocked.retryAfter, blocked.body['error'], blocked.body['details']],
      retried: [retried.status, again.status],
      facts: counted
    };
  }, 60_000);

  it('连接池耗尽：服务端连接全被占用时排队超时得到 503、Retry-After 与 unavailable；连接释放后用原操作 ID 重试只执行一次', async () => {
    const space = await workspace();
    const holders = Array.from({ length: poolerSize }, () => stack.poolerClient());
    // 占位连接只用来占住服务端连接；连接池的断开不影响断言，只吞掉它的错误事件
    for (const holder of holders) holder.on('error', () => undefined);
    const task = command({ type: 'task', id: 'queued', name: '排队', expectedHead: space.root });
    let exhausted: Reply;
    let waited: number;
    try {
      for (const holder of holders) {
        await holder.connect();
        await holder.query('BEGIN');
        await holder.query('SELECT 1');
      }
      const started = Date.now();
      exhausted = await send(entry, space, task, admin);
      waited = Date.now() - started;
    } finally {
      for (const holder of holders) await holder.end().catch(() => undefined);
    }
    expect(exhausted).toMatchObject({
      status: 503,
      retryAfter: '1',
      body: { error: 'unavailable', details: { reason: 'pool', retryAfter: 1 } }
    });
    expect(waited).toBeGreaterThanOrEqual(poolerWaitSeconds * 1000 - 500);
    expect(await facts(space)).toMatchObject({ tasks: 0, receipts: 0, revision: 0 });
    const retried = await send(entry, space, task, admin);
    const again = await send(entry, space, task, admin);
    expect(retried.status).toBe(200);
    expect(again.body).toEqual(retried.body);
    const counted = await facts(space);
    expect(counted).toMatchObject({ tasks: 1, receipts: 1, revision: 1, broadcasts: 1 });
    outcomes[entry]['poolExhausted'] = {
      exhausted: [exhausted.status, exhausted.retryAfter, exhausted.body['error'], exhausted.body['details']],
      retried: [retried.status, again.status],
      facts: counted
    };
  }, 60_000);

  it('客户端按 503 的 Retry-After 用同一个请求自动重发：连接池释放之后这个操作只执行一次', async () => {
    const space = await workspace();
    const holders = Array.from({ length: poolerSize }, () => stack.poolerClient());
    for (const holder of holders) holder.on('error', () => undefined);
    for (const holder of holders) {
      await holder.connect();
      await holder.query('BEGIN');
      await holder.query('SELECT 1');
    }
    const waits: number[] = [];
    // 浏览器端的命令客户端：第一次等待时释放全部占用的连接，模拟连接池在 Retry-After 之内恢复
    const api = new CollaborationApi(
      stack.bases[entry],
      async () => stack.token(admin),
      () => undefined,
      async ms => {
        waits.push(ms);
        if (waits.length === 1) for (const holder of holders) await holder.end().catch(() => undefined);
      }
    );
    const task = command({ type: 'task', id: 'retried', name: '自动重发', expectedHead: space.root }) as Command;
    let result: Record<string, unknown>;
    try {
      result = await api.command({ ...space, name: '契约测试' }, task);
    } finally {
      for (const holder of holders) await holder.end().catch(() => undefined);
    }
    expect(waits).toEqual([1000]);
    expect(result).toMatchObject({ taskId: 'retried' });
    const counted = await facts(space);
    expect(counted).toMatchObject({ tasks: 1, receipts: 1, revision: 1, broadcasts: 1 });
    outcomes[entry]['clientRetry'] = { waits, result: Object.keys(result).sort(), facts: counted };
  }, 60_000);

  it('专用角色能执行全部 21 种命令，每条改变状态的命令都经私有频道广播', async () => {
    const space = await workspace();
    const reviewer = person('contract-all-reviewer');
    const pending = person('contract-all-pending');
    stack.register(reviewer);
    const steps: [string, number][] = [];
    const step = async (data: Record<string, unknown>, who: Person = admin) => {
      const body = await ok(entry, space, data, who);
      steps.push([String(data['type']), 200]);
      return body;
    };
    const scope = [space.teamId, space.appId];
    const revisionOf = async (sql: string, params: unknown[] = []) =>
      Number((await value(sql, [...scope, ...params]))['revision']);
    await step({
      type: 'invite',
      id: 'reviewer',
      email: reviewer.email,
      permissions: ['read', 'review', 'comment'],
      tokenHash: 'reviewer-token',
      expiresAt: Date.now() + 3_600_000,
      expectedVersion: 0
    });
    await step({
      type: 'invite',
      id: 'pending',
      email: pending.email,
      permissions: ['read'],
      tokenHash: 'pending-token',
      expiresAt: Date.now() + 3_600_000,
      expectedVersion: 0
    });
    await step({ type: 'revoke_invite', id: 'pending', expectedVersion: 1 });
    await step({ type: 'accept_invite', id: 'reviewer', tokenHash: 'reviewer-token' }, reviewer);
    await step({
      type: 'member',
      userId: reviewer.id,
      permissions: ['read', 'review', 'comment'],
      active: true,
      expectedGeneration: 1
    });
    await step({
      type: 'policy',
      stages: [{ id: 'review', name: '复核', minimum: 1, reviewers: [], after: [] }],
      expectedVersion: 1
    });
    await step({
      type: 'schema',
      schema: { ...assetSchema, schemaVersion: assetSchema.schemaVersion + 1 },
      expectedVersion: assetSchema.schemaVersion
    });
    await step({ type: 'task', id: 'task', name: '任务', expectedHead: space.root });
    const source = commit('c1', space.root, {}, records('一'));
    await step({ type: 'upload', taskId: 'task', expectedHead: space.root, commits: [source] });
    await step({
      type: 'fork',
      id: 'fork',
      name: '另存',
      taskId: 'task',
      expectedHead: space.root,
      commits: [commit('f1', space.root, {}, records('二'))]
    });
    await step({ type: 'pr', id: 'pr', taskId: 'task', title: '合并', description: '', target: 'shared' });
    await step({ type: 'pr_state', prId: 'pr', status: 'review', expectedRevision: 0 });
    const prRevision = () =>
      revisionOf('SELECT revision FROM admin_private.prs WHERE team_id = $1 AND app_id = $2 AND id = $3', ['pr']);
    const { candidateId } = await step({
      type: 'candidate',
      prId: 'pr',
      expectedRevision: await prRevision(),
      resolutions: []
    });
    await step(
      {
        type: 'thread',
        id: 'thread',
        prId: 'pr',
        candidateId: null,
        recordId: null,
        field: null,
        body: '请确认',
        required: false,
        mentions: [admin.id]
      },
      reviewer
    );
    const { commentId } = await step({ type: 'reply', threadId: 'thread', body: '已确认', mentions: [] });
    await step({
      type: 'edit_comment',
      threadId: 'thread',
      commentId,
      body: '已确认无误',
      deleted: false,
      expectedRevision: 0
    });
    const threadRevision = await revisionOf(
      'SELECT revision FROM admin_private.threads WHERE team_id = $1 AND app_id = $2 AND id = $3',
      ['thread']
    );
    await step(
      { type: 'resolve_thread', threadId: 'thread', resolved: true, expectedRevision: threadRevision },
      reviewer
    );
    await step({ type: 'subscribe', prId: 'pr', subscribed: true }, reviewer);
    const notice = await value(
      'SELECT id FROM admin_private.notifications WHERE team_id = $1 AND app_id = $2 AND user_id = $3 AND NOT read ORDER BY seq LIMIT 1',
      [...scope, admin.id]
    );
    await step({ type: 'read_notice', id: notice['id'] });
    const review = (decision: string, expectedRevision: number) => ({
      type: 'review',
      prId: 'pr',
      candidateId,
      expectedSource: source.commitId,
      stageId: 'review',
      decision,
      reason: decision === 'approve' ? '' : '再核对一次',
      expectedRevision
    });
    await step(review('request_changes', 0), reviewer);
    await step({ type: 'dismiss', prId: 'pr', reviewerId: reviewer.id, reason: '已与作者核对', expectedRevision: 1 });
    await step(review('approve', 2), reviewer);
    await step({
      type: 'merge',
      prId: 'pr',
      candidateId,
      expectedSource: source.commitId,
      expectedTarget: space.root
    });
    const types = [...new Set(steps.map(([type]) => type))].sort();
    expect(types).toHaveLength(21);
    const counted = await facts(space);
    // read_notice 与 subscribe 只改本人的通知与订阅，其余每条命令都推进修订号并广播一次
    expect(counted['broadcasts']).toBe(counted['revision']);
    expect(counted).toMatchObject({ shared: 1, tasks: 2 });
    outcomes[entry]['everyCommand'] = { types, statuses: steps.map(([, status]) => status), facts: counted };
  }, 60_000);
});

describe('Edge Function 平台层的错误（冷启动失败）', () => {
  it('函数起不来（例如部署时漏了构建产物）时平台回 503 BOOT_ERROR；客户端当作可重试的不可用，有限次重发之后报 unavailable', async () => {
    const functions = await mkdtemp(path.join('/tmp', 'admin-broken-function-'));
    await mkdir(path.join(functions, 'admin-collaboration'));
    await writeFile(path.join(functions, 'admin-collaboration', 'index.ts'), "import './dist/collaboration.js';\n");
    await chmod(functions, 0o755);
    const broken = await startEdgeFunction({ env: {}, functions });
    try {
      const raw = await fetch(`${broken.url}/config`);
      expect(raw.status).toBe(503);
      expect(await raw.json()).toMatchObject({ code: 'BOOT_ERROR' });
      const waits: number[] = [];
      const api = new CollaborationApi(
        broken.url,
        async () => 'token',
        () => undefined,
        async ms => {
          waits.push(ms);
        }
      );
      const task = command({ type: 'task', id: 'boot', name: '冷启动', expectedHead: 'root' }) as Command;
      await expect(api.command({ teamId: 'team', appId: 'assets', name: '契约测试' }, task)).rejects.toMatchObject({
        code: 'unavailable',
        message: '服务暂时不可用，请稍后按原请求重试'
      });
      // 平台的 503 不带 Retry-After：按 0.5、1、2 秒退避，共发 4 次
      expect(waits).toEqual([500, 1000, 2000]);
    } finally {
      await broken.stop();
      await rm(functions, { recursive: true, force: true });
    }
  }, 60_000);
  it('函数缺少必需的密钥时模块求值即失败，平台回 500 WORKER_ERROR：这是确定的部署配置错误，客户端只发一次、不自动重发', async () => {
    const misconfigured = await startEdgeFunction({ env: {} });
    try {
      const raw = await fetch(`${misconfigured.url}/config`);
      expect(raw.status).toBe(500);
      expect(await raw.json()).toMatchObject({ code: 'WORKER_ERROR' });
      expect(await misconfigured.logs()).toContain('缺少环境变量 SUPABASE_URL');
      const waits: number[] = [];
      const api = new CollaborationApi(
        misconfigured.url,
        async () => 'token',
        () => undefined,
        async ms => {
          waits.push(ms);
        }
      );
      const task = command({ type: 'task', id: 'config', name: '缺密钥', expectedHead: 'root' }) as Command;
      await expect(api.command({ teamId: 'team', appId: 'assets', name: '契约测试' }, task)).rejects.toMatchObject({
        code: 'http',
        message: '请求失败'
      });
      expect(waits).toEqual([]);
    } finally {
      await misconfigured.stop();
    }
  }, 60_000);
});

describe('Supavisor / PgBouncer transaction 模式的约束', () => {
  it('入口的连接不带启动参数：transaction 模式的连接池拒绝 statement_timeout 这类启动参数', async () => {
    const legacy = new pg.Client({ connectionString: stack.serviceConnection, statement_timeout: 30_000 });
    legacy.on('error', () => undefined);
    await expect(legacy.connect()).rejects.toThrow(/unsupported startup parameter/);
  });
  it('事务时限用 SET LOCAL，随事务结束失效：每个服务端连接上都看不到残留的会话设置', async () => {
    const probes = Array.from({ length: poolerSize }, () => stack.poolerClient());
    try {
      for (const probe of probes) {
        await probe.connect();
        await probe.query('BEGIN');
      }
      // 同时占住全部服务端连接，逐个看会话设置：都还是默认值，说明没有哪个命令把时限留在了连接上
      const settings = await Promise.all(
        probes.map(async probe => {
          const { rows } = await probe.query(
            `SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock,
                    current_setting('idle_in_transaction_session_timeout') AS idle, pg_backend_pid() AS pid`
          );
          return rows[0] as Record<string, unknown>;
        })
      );
      expect(new Set(settings.map(row => row['pid'])).size).toBe(poolerSize);
      for (const row of settings) expect(row).toMatchObject({ statement: '0', lock: '0', idle: '0' });
    } finally {
      for (const probe of probes) await probe.end().catch(() => undefined);
    }
  });
});

describe('两个入口逐项一致', () => {
  it('Node 入口与 Edge Function 入口的每一项契约结果都相同', async () => {
    expect(Object.keys(outcomes.node)).toEqual([
      'idempotency',
      'concurrentUploads',
      'revocationRaces',
      'denials',
      'rollback',
      'lockTimeout',
      'poolExhausted',
      'clientRetry',
      'everyCommand'
    ]);
    expect(outcomes.edge).toEqual(outcomes.node);
    // 证据用：CONTRACT_OUTCOMES=<文件> 时把两个入口的规范化结果写到该文件
    if (process.env['CONTRACT_OUTCOMES'])
      await writeFile(process.env['CONTRACT_OUTCOMES'], `${JSON.stringify(outcomes, null, 2)}\n`);
  });
});
