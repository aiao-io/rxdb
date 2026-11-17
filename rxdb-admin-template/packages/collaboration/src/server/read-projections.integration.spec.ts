import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sealCommit } from '../commit.js';
import type { Command, Identity, Records } from '../model.js';
import { CollaborationReader } from '../reader.js';
import { assetSchema, diffAssets } from '../schema.testing.js';
import { applyMigrations } from './migrate.js';
import { pgReadSource } from './pg-read.js';
import { emptyState, PgWorkspaceWriter } from './pg-workspace.js';
import { noEffects } from './plan.js';
import { installRealtime } from './realtime.testing.js';
import { CollaborationRepository } from './repository.js';
import { stateChanges } from './state-changes.js';

/**
 * ADMIN-US-219 的数据库边界：public 下的只读投影与读取函数按成员资格裁决可见范围（跨团队、跨应用、被撤成员、匿名一律读不到，
 * 通知与回执只读本人的，邀请只对管理者可见），任何写入都被拒绝，敏感列不出现在投影里；私有频道的 realtime.messages 策略
 * 只让可读成员接收广播与在线状态、只能上报在线状态；命令事务提交后才有广播，回滚则没有，载荷只含修订号、类别与标识。
 * 身份按 PostgREST 与 Realtime 的做法注入：`SET LOCAL ROLE` 加 `request.jwt.claims`。
 */
const run = promisify(execFile);
const container = `admin-projections-${randomUUID()}`;
let pool: pg.Pool;
let repository: CollaborationRepository;
let started = false;

const person = (name: string): Identity => ({ id: randomUUID(), email: `${name}@example.test`, verified: true });
const admin = person('matrix-admin');
const reviewer = person('matrix-reviewer');
const revoked = person('matrix-revoked');
const outsider = person('matrix-outsider');
const sideApp = person('matrix-side-app');
const teamId = randomUUID();
const own = { teamId, appId: 'assets' };
const otherTeam = { teamId: randomUUID(), appId: 'assets' };
const otherApp = { teamId, appId: 'other-app' };
const topic = (workspace: { teamId: string; appId: string }) => `collab:${workspace.teamId}:${workspace.appId}`;
const command = (data: Record<string, unknown>) => ({ operationId: randomUUID(), ...data }) as Command;
const op = (actor: Identity, data: Record<string, unknown>, workspace = own) =>
  repository.operation(actor, workspace.teamId, workspace.appId, command(data));

/**
 * 以 PostgREST 的方式在一个只读事务里扮演某个身份：登录用户为 authenticated 角色加 JWT 声明，未登录为 anon。
 * PostgREST v14 与 Realtime 设置 `request.jwt.claims`，Supabase 现行的 `auth.uid()` 读它；裸镜像自带的旧版 `auth.uid()`
 * 只读 `request.jwt.claim.sub`，两个都设上，矩阵就不依赖装的是哪一版。
 */
async function as<T>(who: Identity | 'anon', work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (who === 'anon') await client.query('SET LOCAL ROLE anon');
    else {
      await client.query('SET LOCAL ROLE authenticated');
      await client.query(
        "SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)",
        [JSON.stringify({ sub: who.id, role: 'authenticated', aud: 'authenticated' }), who.id]
      );
    }
    return await work(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
/** 单独一个事务里执行一条语句：成功返回 'ok'，失败返回错误消息（失败会中止事务，所以每条单独执行）。 */
const attempt = (who: Identity | 'anon', sql: string, params: unknown[] = []) =>
  as(who, async client => {
    try {
      await client.query(sql, params);
      return 'ok';
    } catch (error) {
      return (error as Error).message;
    }
  });
/** 某个身份能看到的、属于 `workspace` 的行数。 */
const visible = (who: Identity | 'anon', relation: string, workspace = own) =>
  as(who, async client => {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM public.${relation} WHERE team_id = $1 AND app_id = $2`,
      [workspace.teamId, workspace.appId]
    );
    return result.rows[0].count;
  });

/** 客户端读取的全部 public 关系：本故事新增的只读视图，以及此前已有的带 RLS 的公开表。 */
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
  'admin_changes',
  'admin_workspace_versions'
];
/** 读取函数与调用方式（参数之外的部分由用例补上团队与应用）。 */
const functions: [name: string, args: (head: string) => string][] = [
  ['admin_shared_records', () => 'NULL'],
  ['admin_commit_path', head => `'${head}', NULL`],
  ['admin_commit_lineage', () => `'commit-2'`],
  ['admin_commit_history', head => `'${head}', NULL, 10`],
  ['admin_commit_changes', () => `ARRAY['commit-1', 'commit-2']`]
];
let sharedHead = '';

beforeAll(async () => {
  const password = randomUUID();
  await run('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    container,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-p',
    '127.0.0.1::5432',
    'supabase/postgres:17.6.1.136'
  ]);
  started = true;
  const { stdout } = await run('docker', ['port', container, '5432']);
  const connection = {
    host: '127.0.0.1',
    port: Number(stdout.trim().split(':').at(-1)),
    password,
    database: 'postgres',
    connectionTimeoutMillis: 2000
  };
  pool = new pg.Pool({ ...connection, user: 'postgres', max: 6 });
  await vi.waitFor(
    async () => {
      await pool.query('SELECT 1');
    },
    { timeout: 45000, interval: 500 }
  );
  const superuser = new pg.Client({ ...connection, user: 'supabase_admin' });
  await superuser.connect();
  try {
    await installRealtime(superuser);
  } finally {
    await superuser.end();
  }
  await applyMigrations(pool);
  repository = new CollaborationRepository(pool);
  const seed = (workspace: { teamId: string; appId: string }, owner: Identity, name: string) =>
    repository.initialize({ ...workspace, name, bootstrapKey: randomUUID(), admin: owner, schema: assetSchema });
  await seed(own, admin, 'Matrix');
  await seed(otherTeam, outsider, 'Other team');
  await seed(otherApp, sideApp, 'Other app');
  await op(admin, { type: 'policy', stages: [], expectedVersion: 1 });
  const invite = (id: string, who: Identity, permissions: string[]) =>
    op(admin, {
      type: 'invite',
      id,
      email: who.email,
      permissions,
      tokenHash: `token-hash-${id}`,
      expiresAt: Date.now() + 3600000,
      expectedVersion: 0
    });
  await invite('reviewer', reviewer, ['read', 'comment', 'review']);
  await op(reviewer, { type: 'accept_invite', id: 'reviewer', tokenHash: 'token-hash-reviewer' });
  await invite('revoked', revoked, ['read']);
  await op(revoked, { type: 'accept_invite', id: 'revoked', tokenHash: 'token-hash-revoked' });
  await invite('pending', person('matrix-pending'), ['read']);
  const category: Records = { category: { entity: 'AssetCategory', fields: { name: 'Computers' } } };
  await op(admin, { type: 'task', id: 'task', name: 'Task', expectedHead: null });
  await op(admin, {
    type: 'upload',
    taskId: 'task',
    expectedHead: null,
    commits: [
      await sealCommit({
        id: 'commit-1',
        parent: null,
        authorId: admin.id,
        message: 'First',
        changes: diffAssets({}, category)
      })
    ]
  });
  await op(admin, { type: 'pr', id: 'pr', taskId: 'task', title: 'First', description: '', target: 'shared' });
  await op(admin, { type: 'pr_state', prId: 'pr', status: 'review', expectedRevision: 0 });
  const first = await op(admin, { type: 'candidate', prId: 'pr', expectedRevision: 1, resolutions: [] });
  const merged = await op(admin, {
    type: 'merge',
    prId: 'pr',
    candidateId: first['candidateId'],
    expectedSource: 'commit-1',
    expectedTarget: null
  });
  sharedHead = String(merged['head']);
  await op(admin, { type: 'task', id: 'task-2', name: 'Second', expectedHead: sharedHead });
  await op(admin, {
    type: 'upload',
    taskId: 'task-2',
    expectedHead: sharedHead,
    commits: [
      await sealCommit({
        id: 'commit-2',
        parent: sharedHead,
        authorId: admin.id,
        message: 'Second',
        changes: diffAssets(category, { category: { entity: 'AssetCategory', fields: { name: 'Laptops' } } })
      })
    ]
  });
  await op(admin, { type: 'pr', id: 'pr-2', taskId: 'task-2', title: 'Second', description: '', target: 'shared' });
  await op(admin, { type: 'pr_state', prId: 'pr-2', status: 'review', expectedRevision: 0 });
  const second = await op(admin, { type: 'candidate', prId: 'pr-2', expectedRevision: 1, resolutions: [] });
  await op(reviewer, {
    type: 'review',
    prId: 'pr-2',
    candidateId: second['candidateId'],
    expectedSource: 'commit-2',
    stageId: 'review',
    decision: 'approve',
    reason: '',
    expectedRevision: 0
  });
  // 管理员提及审核者、审核者回复：两人各收到一条通知
  await op(admin, {
    type: 'thread',
    id: 'thread',
    prId: 'pr-2',
    candidateId: null,
    recordId: null,
    field: null,
    body: 'Matrix discussion',
    required: false,
    mentions: [reviewer.id]
  });
  await op(reviewer, { type: 'reply', threadId: 'thread', body: 'Matrix reply', mentions: [] });
  await op(admin, { type: 'member', userId: revoked.id, permissions: [], active: false, expectedGeneration: 1 });
}, 90000);
afterAll(async () => {
  await pool?.end();
  if (started) await run('docker', ['stop', container]);
}, 20000);

describe('ADMIN-US-219 public read projections and private channel authorization', () => {
  it('shows every projection to a readable member of the team and application, and nothing to anyone else', async () => {
    for (const relation of projections) {
      expect(await visible(admin, relation), `${relation} for a member`).toBeGreaterThan(0);
      for (const [who, label] of [
        [outsider, 'another team'],
        [sideApp, 'another application'],
        [revoked, 'a revoked member']
      ] as const)
        expect(await visible(who, relation), `${relation} for ${label}`).toBe(0);
      expect(await attempt('anon', `SELECT 1 FROM public.${relation} LIMIT 1`), `${relation} for anon`).toMatch(
        /permission denied/
      );
    }
    // 跨团队、跨应用的身份本身有效：它们看得到自己的工作区
    expect(await visible(outsider, 'admin_workspaces', otherTeam)).toBe(1);
    expect(await visible(sideApp, 'admin_workspaces', otherApp)).toBe(1);
    expect(await visible(admin, 'admin_workspaces', otherTeam)).toBe(0);
    expect(await visible(admin, 'admin_workspaces', otherApp)).toBe(0);
  });

  it('limits notifications and receipts to their owner and invitations to managers', async () => {
    const owners = (who: Identity, relation: string, column: string) =>
      as(who, async client =>
        (
          await client.query<{ owner: string }>(
            `SELECT DISTINCT ${column} AS owner FROM public.${relation} WHERE team_id = $1 AND app_id = $2`,
            [teamId, 'assets']
          )
        ).rows.map(row => row.owner)
      );
    expect(await owners(admin, 'admin_notifications', 'user_id')).toEqual([admin.id]);
    expect(await owners(reviewer, 'admin_notifications', 'user_id')).toEqual([reviewer.id]);
    // 回执投影不含操作者：按操作 ID 与私有表核对，每个人只读到自己发起的操作
    const receipts = async (who: Identity) =>
      as(who, async client =>
        (
          await client.query<{ operation_id: string }>(
            'SELECT operation_id FROM public.admin_receipts WHERE team_id = $1 AND app_id = $2',
            [teamId, 'assets']
          )
        ).rows.map(row => row.operation_id)
      );
    const actors = async (ids: string[]) =>
      (
        await pool.query<{ actor_id: string }>(
          'SELECT DISTINCT actor_id FROM admin_private.operations WHERE team_id = $1 AND operation_id = ANY($2::text[])',
          [teamId, ids]
        )
      ).rows.map(row => row.actor_id);
    expect(await actors(await receipts(admin))).toEqual([admin.id]);
    expect(await actors(await receipts(reviewer))).toEqual([reviewer.id]);
    expect(await visible(admin, 'admin_invitations')).toBe(3);
    expect(await visible(reviewer, 'admin_invitations')).toBe(0);
  });

  it('hides receipts past the retention period, like the server does', async () => {
    const [{ operation_id: id }] = (
      await pool.query<{ operation_id: string }>(
        'SELECT operation_id FROM admin_private.operations WHERE team_id = $1 AND actor_id = $2 LIMIT 1',
        [teamId, reviewer.id]
      )
    ).rows;
    const seen = () =>
      as(
        reviewer,
        async client =>
          (await client.query('SELECT 1 FROM public.admin_receipts WHERE operation_id = $1', [id])).rows.length
      );
    expect(await seen()).toBe(1);
    const at = (
      await pool.query<{ at: string }>('SELECT at FROM admin_private.operations WHERE operation_id = $1', [id])
    ).rows[0].at;
    try {
      await pool.query('UPDATE admin_private.operations SET at = $2 WHERE operation_id = $1', [
        id,
        Date.now() - 30 * 86_400_000 - 60_000
      ]);
      expect(await seen()).toBe(0);
    } finally {
      await pool.query('UPDATE admin_private.operations SET at = $2 WHERE operation_id = $1', [id, at]);
    }
  });

  it('never exposes token hashes, request fingerprints, bootstrap keys or commit fingerprints', async () => {
    const columns = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [projections]
    );
    const exposed = columns.rows.map(row => `${row.table_name}.${row.column_name}`);
    expect(exposed.length).toBeGreaterThan(projections.length);
    for (const secret of ['token_hash', 'fingerprint', 'bootstrap_key', 'initial_admin_id'])
      expect(
        exposed.filter(name => name.endsWith(`.${secret}`)),
        secret
      ).toEqual([]);
    // 回执只给本人看，投影里连操作者与请求指纹都没有
    expect(exposed.filter(name => name.startsWith('admin_receipts.')).sort()).toEqual([
      'admin_receipts.app_id',
      'admin_receipts.operation_id',
      'admin_receipts.result',
      'admin_receipts.team_id'
    ]);
    const text = await as(admin, async client => {
      const rows = [];
      for (const relation of projections)
        rows.push(
          ...(
            await client.query(`SELECT * FROM public.${relation} WHERE team_id = $1 AND app_id = $2`, [
              teamId,
              'assets'
            ])
          ).rows
        );
      return JSON.stringify(rows);
    });
    expect(text).not.toContain('token-hash-');
    for (const fingerprint of (
      await pool.query<{ fingerprint: string }>('SELECT fingerprint FROM admin_private.operations WHERE team_id = $1', [
        teamId
      ])
    ).rows)
      expect(text).not.toContain(fingerprint.fingerprint);
  });

  it('denies every write to the projections, even to a manager of the team', async () => {
    for (const relation of projections) {
      for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
        expect(
          (
            await pool.query<{ allowed: boolean }>('SELECT has_table_privilege($1, $2, $3) AS allowed', [
              'authenticated',
              `public.${relation}`,
              privilege
            ])
          ).rows[0].allowed,
          `${privilege} on ${relation}`
        ).toBe(false);
      for (const sql of [`DELETE FROM public.${relation}`, `UPDATE public.${relation} SET team_id = team_id`])
        expect(await attempt(admin, sql), sql).toMatch(/permission denied|cannot (delete from|update) view/);
    }
    expect(
      await attempt(
        admin,
        `INSERT INTO public.admin_members(team_id, app_id, user_id, email, permissions, generation)
        VALUES ('${teamId}', 'assets', '${randomUUID()}', 'forged@example.test', '{read,manage}', 1)`
      )
    ).toMatch(/permission denied/);
    expect(
      await attempt(
        admin,
        `INSERT INTO public.admin_receipts(team_id, app_id, operation_id, result)
        VALUES ('${teamId}', 'assets', 'forged', '{}')`
      )
    ).toMatch(/permission denied/);
  });

  it('answers the read functions for members only: NULL for other teams, applications and revoked members, denied to anon', async () => {
    for (const [name, args] of functions) {
      const sql = (workspace: { teamId: string; appId: string }) =>
        `SELECT public.${name}('${workspace.teamId}', '${workspace.appId}', ${args(sharedHead)}) AS value`;
      const value = (who: Identity) =>
        as(who, async client => (await client.query<{ value: unknown }>(sql(own))).rows[0].value);
      expect(await value(admin), `${name} for a member`).not.toBeNull();
      for (const who of [outsider, sideApp, revoked]) expect(await value(who), `${name} for ${who.email}`).toBeNull();
      expect(await attempt('anon', sql(own)), `${name} for anon`).toMatch(/permission denied/);
    }
    const records = await as(
      admin,
      async client =>
        (
          await client.query<{ value: { head: string; records: unknown[] } }>(
            'SELECT public.admin_shared_records($1, $2) AS value',
            [teamId, 'assets']
          )
        ).rows[0].value
    );
    expect(records).toEqual({
      head: sharedHead,
      records: [{ record_id: 'category', entity: 'AssetCategory', fields: { name: 'Computers' } }]
    });
  });

  it('lets only readable members receive broadcasts and presence, and only report presence, on their private channel', async () => {
    const channels = [own, otherTeam, otherApp].map(topic);
    // 与 Realtime 的鉴权方式相同：先以服务端身份写入试探行，再以登录用户身份读；写入则直接以登录用户身份试插
    const readable = (who: Identity | 'anon') =>
      as(who, async client => {
        await client.query('RESET ROLE');
        const inserted = await client.query<{ id: string; topic: string; extension: string }>(
          `INSERT INTO realtime.messages(topic, extension, payload, event, private)
           SELECT t, e, '{}'::jsonb, 'probe', true FROM unnest($1::text[]) t, unnest(ARRAY['broadcast', 'presence']) e
           RETURNING id, topic, extension`,
          [channels]
        );
        await client.query(who === 'anon' ? 'SET LOCAL ROLE anon' : 'SET LOCAL ROLE authenticated');
        const seen = await client.query<{ topic: string; extension: string }>(
          'SELECT topic, extension FROM realtime.messages WHERE id = ANY($1::uuid[]) ORDER BY topic, extension',
          [inserted.rows.map(row => row.id)]
        );
        return seen.rows.map(row => `${row.topic}/${row.extension}`);
      });
    const both = (workspace: { teamId: string; appId: string }) => [
      `${topic(workspace)}/broadcast`,
      `${topic(workspace)}/presence`
    ];
    expect(await readable(admin)).toEqual(both(own));
    expect(await readable(reviewer)).toEqual(both(own));
    expect(await readable(outsider)).toEqual(both(otherTeam));
    expect(await readable(sideApp)).toEqual(both(otherApp));
    expect(await readable(revoked)).toEqual([]);
    expect(await readable('anon')).toEqual([]);
    const report = (who: Identity | 'anon', channel: string, extension: string) =>
      attempt(
        who,
        `INSERT INTO realtime.messages(topic, extension, payload, event, private) VALUES ($1, $2, '{}'::jsonb, 'probe', true)`,
        [channel, extension]
      );
    expect(await report(admin, topic(own), 'presence')).toBe('ok');
    expect(await report(reviewer, topic(own), 'presence')).toBe('ok');
    for (const [who, channel, extension] of [
      [admin, topic(own), 'broadcast'],
      [reviewer, topic(own), 'broadcast'],
      [outsider, topic(own), 'presence'],
      [sideApp, topic(own), 'presence'],
      [revoked, topic(own), 'presence'],
      ['anon', topic(own), 'presence'],
      [admin, topic(otherTeam), 'presence']
    ] as const)
      expect(await report(who, channel, extension), `${channel}/${extension}`).toMatch(/row-level security/);
  });
});

describe('ADMIN-US-219 broadcast invalidation in the command transaction', () => {
  /** 某个频道上全部广播的事件名与载荷，按写入顺序。 */
  const messages = async (workspace: { teamId: string; appId: string }) =>
    (
      await pool.query<{ event: string; payload: Record<string, unknown> }>(
        `SELECT event, payload FROM realtime.messages WHERE topic = $1 AND extension = 'broadcast' AND event <> 'probe'
         ORDER BY inserted_at, id`,
        [topic(workspace)]
      )
    ).rows;
  const revision = async () =>
    Number(
      (
        await pool.query<{ revision: string }>(
          'SELECT revision FROM public.admin_workspace_versions WHERE team_id = $1 AND app_id = $2',
          [teamId, 'assets']
        )
      ).rows[0].revision
    );
  const allowedKinds = ['members', 'policy', 'schema', 'tasks', 'prs', 'details', 'shared', 'notices', 'audit'];
  /** 失效通知的白名单：Realtime 自动加的消息 ID，加上修订号、类别与标识，别的什么都没有。 */
  const assertSignal = (payload: Record<string, unknown>) => {
    expect(Object.keys(payload).sort()).toEqual(['id', 'kinds', 'noticeUserIds', 'prIds', 'revision']);
    expect(Number.isSafeInteger(payload['revision'])).toBe(true);
    expect((payload['kinds'] as string[]).every(kind => allowedKinds.includes(kind))).toBe(true);
    for (const key of ['prIds', 'noticeUserIds'])
      expect((payload[key] as unknown[]).every(value => typeof value === 'string')).toBe(true);
  };

  it('sends one invalidation per committed command carrying the new revision, the kinds and the ids only', async () => {
    const before = (await messages(own)).length;
    await op(admin, {
      type: 'reply',
      threadId: 'thread',
      body: 'A body that must not travel',
      mentions: [reviewer.id]
    });
    const sent = (await messages(own)).slice(before);
    expect(sent.map(message => message.event)).toEqual(['changed']);
    const [{ payload }] = sent;
    assertSignal(payload);
    expect(payload).toMatchObject({
      revision: await revision(),
      kinds: ['details', 'notices', 'audit'],
      prIds: ['pr-2'],
      noticeUserIds: [reviewer.id]
    });
    expect(JSON.stringify(sent)).not.toContain('A body that must not travel');
    // 其他工作区的频道上没有任何东西
    expect(await messages(otherTeam)).toEqual([]);
  });

  it('marks shared, task and member changes with their kinds', async () => {
    const before = (await messages(own)).length;
    await op(admin, { type: 'task', id: 'task-3', name: 'Third', expectedHead: sharedHead });
    await op(admin, { type: 'subscribe', prId: 'pr-2', subscribed: false });
    await op(admin, { type: 'policy', stages: [], expectedVersion: 2 });
    const sent = (await messages(own)).slice(before).map(message => message.payload);
    sent.forEach(assertSignal);
    expect(sent.map(payload => payload['kinds'])).toEqual([
      ['tasks', 'audit'],
      ['prs', 'audit'],
      ['policy', 'audit']
    ]);
    const revisions = sent.map(payload => Number(payload['revision']));
    expect(revisions).toEqual([revisions[0], revisions[0] + 1, revisions[0] + 2]);
  });

  it('broadcasts a revocation event in the same transaction that removes the read permission', async () => {
    const member = person('matrix-short-lived');
    await op(admin, {
      type: 'invite',
      id: 'short-lived',
      email: member.email,
      permissions: ['read'],
      tokenHash: 'token-hash-short-lived',
      expiresAt: Date.now() + 3600000,
      expectedVersion: 0
    });
    await op(member, { type: 'accept_invite', id: 'short-lived', tokenHash: 'token-hash-short-lived' });
    const before = (await messages(own)).length;
    await op(admin, { type: 'member', userId: member.id, permissions: [], active: false, expectedGeneration: 1 });
    // 两条消息由同一条语句写入、属于同一个事务（插入时间相同），Realtime 提交后按写入顺序一并广播
    const sent = (await messages(own)).slice(before);
    expect(sent.map(message => message.event).sort()).toEqual(['changed', 'revoked']);
    const changed = sent.find(message => message.event === 'changed')!.payload;
    assertSignal(changed);
    expect(changed).toMatchObject({ revision: await revision(), kinds: ['members', 'audit'] });
    expect(sent.find(message => message.event === 'revoked')!.payload).toEqual({
      id: expect.any(String),
      revision: await revision(),
      userIds: [member.id]
    });
  });

  it('sends nothing for a rejected command, a replayed receipt, or a transaction that rolls back', async () => {
    const before = await messages(own);
    const replay = command({ type: 'subscribe', prId: 'pr-2', subscribed: true });
    await repository.operation(admin, teamId, 'assets', replay);
    const once = await messages(own);
    expect(once).toHaveLength(before.length + 1);
    await repository.operation(admin, teamId, 'assets', replay);
    await expect(op(reviewer, { type: 'policy', stages: [], expectedVersion: 3 })).rejects.toMatchObject({
      code: 'forbidden'
    });
    expect(await messages(own)).toHaveLength(once.length);
    // 写回到一半回滚：版本行与广播一起消失
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const state = emptyState(teamId, 'assets');
      const after = structuredClone(state);
      after.revision = 1;
      after.audit.push({
        id: randomUUID(),
        actorId: admin.id,
        action: 'probe',
        operationId: 'probe',
        at: 1,
        details: {}
      });
      await new PgWorkspaceWriter(client, teamId, 'assets').save(stateChanges(state, after), noEffects(), Date.now());
      const pending = await pool.query(`SELECT 1 FROM realtime.messages WHERE topic = $1 AND payload ? 'revision'`, [
        topic(own)
      ]);
      expect(pending.rows.length).toBe(once.length);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(await messages(own)).toHaveLength(once.length);
  });
});

describe('ADMIN-US-218 AC#6 / ADMIN-US-219 AC#1: the team page does not grow with collaboration activity', () => {
  const reader = (who: Identity) => new CollaborationReader(() => pgReadSource(pool, who.id));
  const window = { prs: 50, tasks: 50, notices: 50, taskIds: [] };
  const entry = { ...own, name: 'Matrix' };
  /** 团队页的字节数：去掉随命令数增长的计数（修订号、审计总数、未读数）之后序列化。 */
  const bytes = async () => {
    const team = await reader(admin).team(entry, admin.id, window);
    return {
      size: Buffer.byteLength(
        JSON.stringify({ ...team, revision: 0, auditCount: 0, notices: { ...team.notices, unread: 0 } })
      ),
      text: JSON.stringify(team),
      team
    };
  };
  const chatter = async (rounds: number) => {
    for (let index = 0; index < rounds; index++) {
      await op(reviewer, {
        type: 'reply',
        threadId: 'thread',
        body: `Chatter ${index} `.repeat(20),
        mentions: [admin.id]
      });
      if (index % 10 === 0)
        await op(reviewer, {
          type: 'review',
          prId: 'pr-2',
          candidateId: null,
          expectedSource: 'commit-2',
          stageId: 'review',
          decision: 'request_changes',
          reason: `Round ${index}`,
          expectedRevision: (
            await pool.query<{ revision: number }>(
              `SELECT coalesce(max(revision), 0)::int AS revision FROM admin_private.reviews
               WHERE team_id = $1 AND app_id = $2 AND pr_id = 'pr-2' AND reviewer_id = $3`,
              [teamId, 'assets', reviewer.id]
            )
          ).rows[0].revision
        });
    }
  };

  it('reads only members, policy, refs, the PR and task windows and the notice window, whatever the discussion holds', async () => {
    await chatter(60);
    const before = await bytes();
    await chatter(120);
    const after = await bytes();
    // 讨论、审核与通知的条数又涨了一大截，团队页的体积不变：通知只读最近一窗，讨论与审核不在团队页里
    expect(after.size).toBe(before.size);
    expect(after.team.notices.notices).toHaveLength(50);
    expect(after.team.notices.earlier).toBe(true);
    expect(after.team.notices.unread).toBeGreaterThanOrEqual(after.team.notices.notices.filter(n => !n.read).length);
    expect(after.text).not.toContain('Chatter');
    expect(after.text).not.toContain('Round');
    expect(after.size).toBeLessThan(50_000);
    // PR 详情才带讨论与审核：打开这个 PR 时读，体积随它自己的讨论增长
    const detail = await reader(admin).prDetail(
      entry,
      after.team.prs.find(pr => pr.id === 'pr-2')!,
      after.team
    );
    expect(detail.threads[0].comments.length).toBeGreaterThan(180);
    expect(detail.reviews.filter(review => review.decision === 'request_changes').length).toBeGreaterThan(15);
  }, 120000);
});
