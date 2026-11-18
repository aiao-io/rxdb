import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Audit, AuditQuery, Command, Identity } from '../model.js';
import { CollaborationReader } from '../reader.js';
import { assetSchema } from '../schema.testing.js';
import { archiveAudit } from './audit-archive.js';
import { applyMigrations, readMigrations } from './migrate.js';
import { pgReadSource } from './pg-read.js';
import { installRealtime } from './realtime-fixture.js';
import { CollaborationRepository } from './repository.js';
import { servicePasswordStatement, serviceRole } from './service-role.js';

/**
 * ADMIN-US-217 AC#6 的审计归档：热表 public.admin_audit 里满足策略（早于若干天，或不在本工作区最新的若干条之内）的事件，
 * 由迁移所有者调用 admin_private.archive_audit() 分批移入归档表 admin_private.audit_archive；只读投影 public.admin_audit_events
 * 合并两张表，浏览器同一个 CollaborationReader 的审计分页与最近一窗在归档前后读到完全相同的结果，可见范围仍只属于可读成员。
 * 归档表与归档函数对客户端角色与协作专用角色一概不可用；审计总数（admin_workspace_versions.audit_count）不随归档变化。
 * 用例按顺序共享同一个库：每一步的策略作用于全部工作区，所以各工作区的事件量与时间都按顺序设计成只有当前用例的工作区受影响。
 */
const run = promisify(execFile);
const container = `admin-audit-archive-${randomUUID()}`;
let started = false;
let pool: pg.Pool;
let repository: CollaborationRepository;
let connection: { host: string; port: number; password: string; database: string };

type Workspace = { teamId: string; appId: string };
const person = (name: string): Identity => ({ id: randomUUID(), email: `${name}@example.test`, verified: true });
const admin = person('archive-admin');
const outsider = person('archive-outsider');
const revoked = person('archive-revoked');
const workspace = (): Workspace => ({ teamId: randomUUID(), appId: 'assets' });
/** 按天数归档：60 条事件从 60 天前排到 1 天前，其中 31 条早于 30 天。 */
const aged = workspace();
/** 按条数归档：301 条近期事件，远多于每个工作区保留的 100 条。 */
const crowded = workspace();
/** 两项策略同时给出：最新的 100 条里也有早于期限的事件，满足任一条件即归档。 */
const mixed = workspace();
/** 归档时有事件被别的事务锁着：跳过它们，下一次再移。 */
const locked = workspace();
const otherTeam = workspace();
const day = 1440;

const entry = (target: Workspace) => ({ ...target, name: 'Archive' });
const reader = (who: Identity) => new CollaborationReader(() => pgReadSource(pool, who.id));
const op = (actor: Identity, target: Workspace, data: Record<string, unknown>) =>
  repository.operation(actor, target.teamId, target.appId, { operationId: randomUUID(), ...data } as Command);

/** 以 PostgREST 的方式在一个只读事务里扮演某个身份：登录用户为 authenticated 角色加 JWT 声明，未登录为 anon。 */
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
/** 单独一个事务里执行一条语句：成功返回 'ok'，失败返回错误消息。 */
const attempt = (who: Identity | 'anon', sql: string) =>
  as(who, async client => {
    try {
      await client.query(sql);
      return 'ok';
    } catch (error) {
      return (error as Error).message;
    }
  });
/** 某个身份能看到的、属于 `target` 的行数。 */
const visible = (who: Identity, relation: string, target: Workspace) =>
  as(who, async client => {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM public.${relation} WHERE team_id = $1 AND app_id = $2`,
      [target.teamId, target.appId]
    );
    return result.rows[0].count;
  });

/** 一条直接写入热表的审计事件：`minutes` 是距今多少分钟；按给出的顺序写入，seq 随之递增。 */
interface Seeded {
  id: string;
  minutes: number;
  prId: string | null;
  threadId: string | null;
}
/** `count` 条事件：每隔 `every.pr` 条属于 `pr-<组>`，每隔 `every.thread` 条属于 `thread-<组>`。 */
const events = (
  prefix: string,
  count: number,
  minutes: (index: number) => number,
  every: { pr: number; thread: number },
  group = prefix
): Seeded[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    minutes: minutes(index),
    prId: index % every.pr === 0 ? `pr-${group}` : null,
    threadId: index % every.thread === 0 ? `thread-${group}` : null
  }));
async function seed(target: Workspace, rows: readonly Seeded[]) {
  await pool.query(
    `INSERT INTO public.admin_audit(team_id, app_id, id, actor_id, action, details, created_at, pr_id, thread_id)
     SELECT $1, $2, e.id, $3, 'reply',
       jsonb_build_object('id', e.id, 'actorId', $3::text, 'action', 'reply', 'operationId', 'op-' || e.id,
         'at', e.ordinal, 'details', '{}'::jsonb),
       now() - make_interval(mins => e.minutes), e.pr_id, e.thread_id
     FROM unnest($4::text[], $5::integer[], $6::text[], $7::text[]) WITH ORDINALITY AS e(id, minutes, pr_id, thread_id, ordinal)
     ORDER BY e.ordinal`,
    [
      target.teamId,
      target.appId,
      admin.id,
      rows.map(row => row.id),
      rows.map(row => row.minutes),
      rows.map(row => row.prId),
      rows.map(row => row.threadId)
    ]
  );
}

/** 一种查询从新到旧逐页读完：每一页的事件与游标都记下。 */
async function pages(who: Identity, target: Workspace, query: Omit<AuditQuery, 'before'>) {
  const found: { events: Audit[]; nextBefore: string | null }[] = [];
  let before: string | null = null;
  do {
    const page = await reader(who).audit(entry(target), before === null ? query : { ...query, before });
    found.push(page);
    before = page.nextBefore;
  } while (before !== null);
  return found;
}
/** 浏览器读到的全部审计：最近一窗、全部事件，以及按 PR、按线程筛选的分页（页大小各不相同，游标会落在冷热两边）。 */
async function readings(who: Identity, target: Workspace, group: string) {
  return {
    recent: await reader(who).recentAudit(entry(target)),
    all: await pages(who, target, { limit: 7 }),
    pr: await pages(who, target, { prId: `pr-${group}`, limit: 4 }),
    thread: await pages(who, target, { threadId: `thread-${group}`, limit: 3 })
  };
}
/** 热表或归档表里某个工作区的事件 ID（按 seq）。 */
const ids = async (relation: 'public.admin_audit' | 'admin_private.audit_archive', target: Workspace) =>
  (
    await pool.query<{ id: string }>(`SELECT id FROM ${relation} WHERE team_id = $1 AND app_id = $2 ORDER BY seq`, [
      target.teamId,
      target.appId
    ])
  ).rows.map(row => row.id);
/** 一个工作区全部审计行的原样内容（热表与归档表合起来，按 seq）：归档只是搬家，任何一列都不变。 */
const rowsOf = async (target: Workspace) =>
  (
    await pool.query(
      `SELECT team_id, app_id, id, actor_id, action, details, created_at, seq, pr_id, thread_id FROM public.admin_audit
         WHERE team_id = $1 AND app_id = $2
       UNION ALL
       SELECT team_id, app_id, id, actor_id, action, details, created_at, seq, pr_id, thread_id FROM admin_private.audit_archive
         WHERE team_id = $1 AND app_id = $2
       ORDER BY seq`,
      [target.teamId, target.appId]
    )
  ).rows;
/** 以迁移所有者调用一次归档函数，返回这一批移动的行数。 */
const archive = async (olderThan: string | null, keepLatest: number | null, batch: number | null) =>
  (
    await pool.query<{ moved: number }>(
      'SELECT admin_private.archive_audit($1::interval, $2::integer, $3::integer) AS moved',
      [olderThan, keepLatest, batch]
    )
  ).rows[0].moved;
/** 全部工作区的版本行：修订号与审计总数。 */
const versions = async () =>
  (
    await pool.query(
      'SELECT team_id, app_id, revision, audit_count FROM public.admin_workspace_versions ORDER BY team_id, app_id'
    )
  ).rows;
let initialVersions: unknown[] = [];

/**
 * 归档涉及的结构（列、索引、约束、行级安全开关与授权、策略、投影定义、函数定义与授权）与两张表的数据：
 * 授权按（受权者, 权限）排序后比较，重复 REVOKE / GRANT 只会改变 ACL 里的先后，不算变化。
 */
async function signature() {
  const structure = await pool.query<{ kind: string; name: string; detail: string }>(`
    WITH relations(relation) AS (
      VALUES ('admin_private.audit_archive'::regclass), ('public.admin_audit_events'::regclass), ('public.admin_audit'::regclass)
    )
    SELECT 'column' AS kind, a.attrelid::regclass::text || '.' || a.attname AS name,
      format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '')
        || ':' || a.attidentity::text AS detail
    FROM pg_attribute a JOIN relations r ON r.relation = a.attrelid
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attnum > 0 AND NOT a.attisdropped
    UNION ALL SELECT 'index', i.indexrelid::regclass::text, pg_get_indexdef(i.indexrelid)
    FROM pg_index i JOIN relations r ON r.relation = i.indrelid
    UNION ALL SELECT 'constraint', k.conrelid::regclass::text || '.' || k.conname, pg_get_constraintdef(k.oid)
    FROM pg_constraint k JOIN relations r ON r.relation = k.conrelid
    UNION ALL SELECT 'relation', c.oid::regclass::text, c.relrowsecurity || ':' || coalesce(array_to_string(c.reloptions, ','), '')
      || ':' || coalesce((SELECT string_agg(e.entry, ',' ORDER BY e.entry) FROM (SELECT
          CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END || '=' || x.privilege_type AS entry
          FROM aclexplode(c.relacl) x) e), '')
    FROM pg_class c JOIN relations r ON r.relation = c.oid
    UNION ALL SELECT 'policy', p.polrelid::regclass::text || '.' || p.polname,
      p.polcmd::text || ':' || p.polroles::regrole[]::text || ':' || coalesce(pg_get_expr(p.polqual, p.polrelid), '')
        || ':' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
    FROM pg_policy p JOIN relations r ON r.relation = p.polrelid
    UNION ALL SELECT 'view', 'public.admin_audit_events', pg_get_viewdef('public.admin_audit_events'::regclass)
    UNION ALL SELECT 'function', f.oid::regprocedure::text, pg_get_functiondef(f.oid) || ':'
      || coalesce((SELECT string_agg(e.entry, ',' ORDER BY e.entry) FROM (SELECT
          CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END || '=' || x.privilege_type AS entry
          FROM aclexplode(f.proacl) x) e), '')
    FROM pg_proc f WHERE f.oid = 'admin_private.archive_audit(interval, integer, integer)'::regprocedure
    ORDER BY 1, 2`);
  const data = await pool.query(`SELECT
    (SELECT md5(coalesce(string_agg(to_jsonb(a)::text, ',' ORDER BY a.team_id, a.app_id, a.id), '')) FROM public.admin_audit a) AS hot,
    (SELECT md5(coalesce(string_agg(to_jsonb(r)::text, ',' ORDER BY r.team_id, r.app_id, r.id), ''))
      FROM admin_private.audit_archive r) AS archived,
    (SELECT count(*)::int FROM admin_private.audit_archive) AS archived_rows`);
  return { structure: structure.rows, data: data.rows[0] as Record<string, unknown> };
}

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
  connection = { host: '127.0.0.1', port: Number(stdout.trim().split(':').at(-1)), password, database: 'postgres' };
  pool = new pg.Pool({ ...connection, user: 'postgres', max: 6, connectionTimeoutMillis: 2000 });
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
  for (const [target, owner] of [
    [aged, admin],
    [crowded, admin],
    [mixed, admin],
    [locked, admin],
    [otherTeam, outsider]
  ] as const)
    await repository.initialize({
      ...target,
      name: 'Archive',
      bootstrapKey: randomUUID(),
      admin: owner,
      schema: assetSchema
    });
  // 按天数归档的工作区：初始化事件（最早写入、时间是现在）之后是 60 条从 60 天前到 1 天前的事件（错开半天，避开期限边界），
  // 再由真实命令写下几条近期事件：邀请、接受与撤销一名成员
  await seed(
    aged,
    events('aged', 60, index => (60 - index) * day + day / 2, { pr: 3, thread: 4 })
  );
  await op(admin, aged, {
    type: 'invite',
    id: 'revoked',
    email: revoked.email,
    permissions: ['read'],
    tokenHash: 'token-hash-revoked',
    expiresAt: Date.now() + 3600000,
    expectedVersion: 0
  });
  await op(revoked, aged, { type: 'accept_invite', id: 'revoked', tokenHash: 'token-hash-revoked' });
  await op(admin, aged, { type: 'member', userId: revoked.id, permissions: [], active: false, expectedGeneration: 1 });
  await seed(
    crowded,
    events('crowded', 300, index => 300 - index, { pr: 5, thread: 7 })
  );
  initialVersions = await versions();
}, 90000);
afterAll(async () => {
  await pool?.end();
  if (started) await run('docker', ['stop', container]);
}, 20000);

describe('ADMIN-US-217 AC#6：审计按策略归档且仍可查询', () => {
  it('按天数：早于期限的事件整行移入归档表，其余留在热表；浏览器读到的审计与归档前完全相同', async () => {
    const before = await readings(admin, aged, 'aged');
    const rows = await rowsOf(aged);
    const hot = await ids('public.admin_audit', aged);
    const expected = (
      await pool.query<{ id: string }>(
        `SELECT id FROM public.admin_audit WHERE team_id = $1 AND app_id = $2 AND created_at < now() - interval '30 days'
         ORDER BY seq`,
        [aged.teamId, aged.appId]
      )
    ).rows.map(row => row.id);
    expect(expected).toEqual(Array.from({ length: 31 }, (_, index) => `aged-${index}`));
    expect(await archive('30 days', null, 1000)).toBe(31);
    expect(await ids('admin_private.audit_archive', aged)).toEqual(expected);
    expect(await ids('public.admin_audit', aged)).toEqual(hot.filter(id => !expected.includes(id)));
    expect(await rowsOf(aged)).toEqual(rows);
    // 最近一窗（50 条）与分页的游标都跨过冷热边界：归档前后逐页、逐条相同
    expect(before.recent.map(event => event.id)).toContain('aged-30');
    expect(await readings(admin, aged, 'aged')).toEqual(before);
    // 投影合并两张表；只读热表（旧版前端读的 admin_audit）的话，归档的事件就读不到了
    expect(await visible(admin, 'admin_audit_events', aged)).toBe(rows.length);
    expect(await visible(admin, 'admin_audit', aged)).toBe(rows.length - 31);
  });

  it('按条数：每个工作区热表只留最新的若干条；一次至多移一批（从最旧的起），重复执行把剩余的移完', async () => {
    const before = await readings(admin, crowded, 'crowded');
    const rows = await rowsOf(crowded);
    const hot = await ids('public.admin_audit', crowded);
    expect(hot).toHaveLength(301);
    // 其余工作区的热表都不超过 100 条，不受影响
    expect(await archive(null, 100, 50)).toBe(50);
    expect(await ids('admin_private.audit_archive', crowded)).toEqual(hot.slice(0, 50));
    expect(await archiveAudit(pool, { afterDays: null, keepLatest: 100, batch: 50 })).toBe(151);
    expect(await ids('public.admin_audit', crowded)).toEqual(hot.slice(201));
    expect(await ids('admin_private.audit_archive', crowded)).toEqual(hot.slice(0, 201));
    expect(await rowsOf(crowded)).toEqual(rows);
    expect(await readings(admin, crowded, 'crowded')).toEqual(before);
  });

  it('两项都给时满足任一条件即归档：最新的若干条里早于期限的事件也移走', async () => {
    // 120 条近期事件之后，再写入 10 条时间早于 40 天的事件（例如补录）：它们的 seq 最大，在最新的 100 条之内
    await seed(mixed, [
      ...events('mixed', 120, index => 120 - index, { pr: 6, thread: 8 }),
      ...events('mixed-old', 10, index => 40 * day + index * 60, { pr: 2, thread: 3 }, 'mixed')
    ]);
    const before = await readings(admin, mixed, 'mixed');
    const rows = await rowsOf(mixed);
    const hot = await ids('public.admin_audit', mixed);
    expect(hot).toHaveLength(131);
    // 不在最新 100 条之内的：初始化事件与最早的 30 条近期事件；早于 30 天的：最后写入的 10 条
    expect(await archiveAudit(pool, { afterDays: 30, keepLatest: 100, batch: 5000 })).toBe(41);
    expect(await ids('admin_private.audit_archive', mixed)).toEqual([...hot.slice(0, 31), ...hot.slice(121)]);
    expect(await ids('public.admin_audit', mixed)).toEqual(hot.slice(31, 121));
    expect(await rowsOf(mixed)).toEqual(rows);
    expect(await readings(admin, mixed, 'mixed')).toEqual(before);
  });

  it('选行时跳过被其他事务锁住的事件：下一次再移，读取照常', async () => {
    await seed(
      locked,
      events('locked', 6, index => (45 + index) * day, { pr: 2, thread: 3 })
    );
    const before = await readings(admin, locked, 'locked');
    const hot = await ids('public.admin_audit', locked);
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM public.admin_audit WHERE team_id = $1 AND id = ANY($2::text[]) FOR UPDATE', [
        locked.teamId,
        ['locked-1', 'locked-4']
      ]);
      expect(await archive('30 days', null, 100)).toBe(4);
      expect(await ids('public.admin_audit', locked)).toEqual([hot[0], 'locked-1', 'locked-4']);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
    expect(await archive('30 days', null, 100)).toBe(2);
    expect(await ids('public.admin_audit', locked)).toEqual([hot[0]]);
    expect(await readings(admin, locked, 'locked')).toEqual(before);
  });

  it('策略已满足时重跑不再移动任何行；审计总数（含归档）与修订号不随归档变化', async () => {
    for (const [olderThan, keepLatest] of [
      ['30 days', null],
      [null, 100],
      ['30 days', 100]
    ] as const)
      expect(await archive(olderThan, keepLatest, 5000), `${olderThan} / ${keepLatest}`).toBe(0);
    expect(await versions()).toEqual(initialVersions);
  });

  it('归档的事件只对本工作区的可读成员可见：跨团队、被撤成员读不到，匿名无权，归档表本身谁都不能直接读', async () => {
    expect(await ids('admin_private.audit_archive', aged)).toHaveLength(31);
    expect(await visible(admin, 'admin_audit_events', aged)).toBe((await rowsOf(aged)).length);
    for (const who of [outsider, revoked]) expect(await visible(who, 'admin_audit_events', aged), who.email).toBe(0);
    // 跨团队的身份本身有效：它看得到自己的工作区
    expect(await visible(outsider, 'admin_audit_events', otherTeam)).toBe(1);
    expect(await visible(admin, 'admin_audit_events', otherTeam)).toBe(0);
    expect(await attempt('anon', 'SELECT 1 FROM public.admin_audit_events LIMIT 1')).toMatch(/permission denied/);
    for (const who of [admin, 'anon'] as const)
      expect(await attempt(who, 'SELECT 1 FROM admin_private.audit_archive LIMIT 1')).toMatch(/permission denied/);
    for (const sql of ['DELETE FROM public.admin_audit_events', "UPDATE public.admin_audit_events SET action = 'x'"])
      expect(await attempt(admin, sql), sql).toMatch(/permission denied|cannot (delete from|update) view/);
  });

  it('归档函数只给迁移所有者：登录用户、匿名与协作专用角色都不能调用，专用角色也读不到归档表与投影', async () => {
    const fn = 'admin_private.archive_audit(interval, integer, integer)';
    for (const role of ['public', 'anon', 'authenticated', serviceRole])
      expect(
        (await pool.query('SELECT has_function_privilege($1, $2, $3) AS allowed', [role, fn, 'EXECUTE'])).rows[0],
        role
      ).toEqual({ allowed: false });
    for (const role of ['anon', 'authenticated', serviceRole])
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
        expect(
          (
            await pool.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [
              role,
              'admin_private.audit_archive',
              privilege
            ])
          ).rows[0],
          `${role} ${privilege}`
        ).toEqual({ allowed: false });
    expect(await attempt(admin, "SELECT admin_private.archive_audit(interval '1 day')")).toMatch(/permission denied/);
    const password = randomUUID();
    await pool.query(await servicePasswordStatement(password));
    const service = new pg.Client({ ...connection, user: serviceRole, password });
    await service.connect();
    try {
      for (const sql of [
        'SELECT * FROM admin_private.audit_archive',
        'DELETE FROM admin_private.audit_archive',
        'SELECT * FROM public.admin_audit_events',
        "SELECT admin_private.archive_audit(interval '1 day')"
      ])
        await expect(service.query(sql), sql).rejects.toThrow(/permission denied/);
    } finally {
      await service.end();
    }
  });

  it('参数不合法时报错，什么都不移：两项都为空、保留条数为负、期限不为正、批量小于 1', async () => {
    const archived = await signature();
    for (const [olderThan, keepLatest, batch] of [
      [null, null, 10],
      [null, -1, 10],
      ['0 days', null, 10],
      ['-1 day', null, 10],
      ['30 days', null, 0],
      ['30 days', null, null]
    ] as const)
      await expect(archive(olderThan, keepLatest, batch), `${olderThan} / ${keepLatest} / ${batch}`).rejects.toThrow(
        /archive_audit/
      );
    expect(await signature()).toEqual(archived);
  });

  it('迁移整套重跑（正序两次、再倒序一次）后归档表、投影、函数与授权不变，热表与归档里的数据一行不动', async () => {
    const before = await signature();
    expect(before.structure.filter(row => row.kind === 'index').map(row => row.name)).toEqual(
      expect.arrayContaining([
        'admin_private.audit_archive_pkey',
        'admin_private.audit_archive_order',
        'admin_private.audit_archive_pr',
        'admin_private.audit_archive_thread',
        'admin_audit_age'
      ])
    );
    expect(before.data['archived_rows']).toBeGreaterThan(0);
    await applyMigrations(pool);
    await applyMigrations(pool);
    expect(await signature()).toEqual(before);
    for (const migration of [...(await readMigrations())].reverse()) await pool.query(migration.sql);
    expect(await signature()).toEqual(before);
  });
});
