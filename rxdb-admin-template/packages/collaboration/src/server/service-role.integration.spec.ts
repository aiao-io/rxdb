import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assetSchema } from '../schema.testing.js';
import { applyMigrations, readMigrations } from './migrate.js';
import { installRealtime } from './realtime-fixture.js';
import { CollaborationRepository } from './repository.js';
import { servicePasswordStatement, serviceRole } from './service-role.js';

/**
 * 协作专用数据库角色的权限边界（ADMIN-US-220 AC#4）：它能执行全部命令（见 `contract.integration.spec.ts` 的「全部 21 种命令」，
 * 两个入口都以它连库），这里证明它做不了协作之外的事——不是超级用户、不能绕过行级安全、读写不了 auth 等其他 schema、
 * 改不了表结构与行级策略、读不到初始化密钥、不能改写只追加的表、不能直接写 realtime、不能借别的角色的身份；
 * 迁移里没有口令，角色只在部署步骤设置口令之后才能登录。
 */
const run = promisify(execFile);
const container = `admin-service-role-${randomUUID()}`;
let started = false;
let owner: pg.Pool;
let connection: { host: string; port: number; database: string };
let password: string;
/** 部署步骤设置口令之前角色的属性与登录结果（beforeAll 里记下，第一个用例断言）。 */
let initial: { attributes: Record<string, unknown>; login: string };
const workspace = { teamId: randomUUID(), appId: 'assets' };
const attributesOf = async () =>
  (
    await owner.query(
      `SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolinherit
       FROM pg_roles WHERE rolname = $1`,
      [serviceRole]
    )
  ).rows[0] as Record<string, unknown>;

/** 以专用角色单独执行一条语句：成功返回 'ok'，失败返回错误消息。 */
async function asService(sql: string, params: unknown[] = []): Promise<string> {
  const client = new pg.Client({ ...connection, user: serviceRole, password });
  await client.connect();
  try {
    await client.query(sql, params);
    return 'ok';
  } catch (error) {
    return (error as Error).message;
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  const ownerPassword = randomUUID();
  await run('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    container,
    '-e',
    `POSTGRES_PASSWORD=${ownerPassword}`,
    '-p',
    '127.0.0.1::5432',
    'supabase/postgres:17.6.1.136'
  ]);
  started = true;
  const { stdout } = await run('docker', ['port', container, '5432']);
  connection = { host: '127.0.0.1', port: Number(stdout.trim().split(':').at(-1)), database: 'postgres' };
  owner = new pg.Pool({ ...connection, user: 'postgres', password: ownerPassword, max: 3 });
  await vi.waitFor(
    async () => {
      await owner.query('SELECT 1');
    },
    { timeout: 45000, interval: 500 }
  );
  const superuser = new pg.Client({ ...connection, user: 'supabase_admin', password: ownerPassword });
  await superuser.connect();
  try {
    await installRealtime(superuser);
  } finally {
    await superuser.end();
  }
  await applyMigrations(owner);
  await new CollaborationRepository(owner).initialize({
    ...workspace,
    name: '权限边界',
    bootstrapKey: 'bootstrap-key-that-must-stay-private',
    admin: { id: randomUUID(), email: 'role-admin@example.test', verified: true },
    schema: assetSchema
  });
  // 一张应用自己的表：Supabase 给 public 下的新表默认授权给 anon / authenticated / service_role，不给协作角色
  await owner.query('CREATE TABLE IF NOT EXISTS public.app_private_data (id int PRIMARY KEY, secret text)');
  password = randomUUID();
  const early = new pg.Client({ ...connection, user: serviceRole, password });
  const login = await early.connect().then(
    async () => {
      await early.end();
      return 'connected';
    },
    (error: Error) => error.message
  );
  initial = { attributes: await attributesOf(), login };
  // 部署步骤：设置口令并允许登录
  await owner.query(await servicePasswordStatement(password));
}, 60000);
afterAll(async () => {
  await owner?.end();
  if (started) await run('docker', ['stop', container]);
});

describe('协作专用数据库角色只拥有协作所需的权限（ADMIN-US-220 AC#4）', () => {
  it('迁移只建 NOLOGIN、无口令的角色，迁移文件里没有口令；部署步骤设置口令之后才能登录', async () => {
    for (const migration of await readMigrations()) {
      const statements = migration.sql.replace(/--.*$/gm, '');
      expect(statements, migration.name).not.toMatch(/PASSWORD/i);
      expect(statements, migration.name).not.toMatch(/(?<!NO)LOGIN/);
    }
    expect(initial.attributes).toEqual({
      rolcanlogin: false,
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
      rolinherit: false
    });
    // 没有口令时连口令校验都过不了（PostgreSQL 先校验口令再看登录权）
    expect(initial.login).toMatch(/password authentication failed|not permitted to log in/);
    expect(await attributesOf()).toMatchObject({ rolcanlogin: true, rolsuper: false, rolbypassrls: false });
    await expect(asService('SELECT 1')).resolves.toBe('ok');
  });
  it('读得到命令需要的治理字段，读不到也改不了初始化密钥，不能新建或删除工作区', async () => {
    const scope = [workspace.teamId, workspace.appId];
    expect(
      await asService(
        'SELECT name, initial_admin_id, schema_version, policy_version FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2 FOR SHARE',
        scope
      )
    ).toBe('ok');
    for (const sql of [
      'SELECT bootstrap_key FROM admin_private.workspaces',
      'SELECT * FROM admin_private.workspaces',
      "UPDATE admin_private.workspaces SET bootstrap_key = 'x'",
      "UPDATE admin_private.workspaces SET name = 'x'",
      "INSERT INTO admin_private.workspaces(team_id, app_id) VALUES ('t', 'a')",
      'DELETE FROM admin_private.workspaces'
    ])
      expect(await asService(sql), sql).toMatch(/permission denied/);
    // 审计详情里也不给它读（只追加，不可读）
    expect(await asService('SELECT details FROM public.admin_audit')).toMatch(/permission denied/);
  });
  it('只追加的表不能改写或删除；公开投影与读取函数、应用自己的表都不可读', async () => {
    // 提交表与变更表是交换格式（ADMIN-US-221）：命令要读整条记录（父、种类、指纹与单元九列）并追加，表级授权覆盖新列
    for (const sql of [
      'SELECT id, parent_ids, first_parent, merge_parent, kind, author_id, created_at, content_fingerprint FROM admin_private.commits',
      'SELECT sequence, unit_id, transaction_id, namespace, entity, entity_id, operation, patch, inverse_patch, origin FROM admin_private.commit_changes'
    ])
      expect(await asService(sql), sql).toBe('ok');
    for (const sql of [
      'DELETE FROM admin_private.commits',
      "UPDATE admin_private.commits SET message = 'x'",
      "UPDATE admin_private.commits SET parent_ids = '{}'",
      "UPDATE admin_private.commits SET kind = 'normal'",
      "UPDATE admin_private.commits SET content_fingerprint = repeat('0', 64)",
      'DELETE FROM admin_private.commit_changes',
      "UPDATE admin_private.commit_changes SET patch = '{}'::jsonb",
      "UPDATE admin_private.commit_changes SET unit_id = 'x'",
      "UPDATE admin_private.candidates SET actor_id = 'x'",
      'DELETE FROM admin_private.reviews',
      "UPDATE public.admin_audit SET action = 'x'",
      'DELETE FROM public.admin_audit',
      'DELETE FROM public.admin_changes',
      "UPDATE admin_private.operations SET result = '{}'",
      'SELECT * FROM public.admin_workspaces',
      'SELECT * FROM public.admin_receipts',
      'SELECT * FROM public.admin_commits',
      // 审计归档（ADMIN-US-217 AC#6）：归档表、合并冷热两表的投影与归档函数都只属于迁移所有者与登录成员
      'SELECT * FROM admin_private.audit_archive',
      'DELETE FROM admin_private.audit_archive',
      'SELECT * FROM public.admin_audit_events',
      "SELECT admin_private.archive_audit(interval '1 day', NULL, 10)",
      "SELECT public.admin_shared_records('t', 'a')",
      "SELECT public.admin_commit_exchange('t', 'a', 'shared', NULL, 10)",
      'SELECT * FROM public.app_private_data'
    ])
      expect(await asService(sql), sql).toMatch(/permission denied/);
  });
  it('读写不了 auth、storage、vault 与 realtime，只能经定义者函数向协作私有频道广播', async () => {
    for (const sql of [
      'SELECT * FROM auth.users',
      'INSERT INTO auth.users(id) VALUES (gen_random_uuid())',
      'SELECT * FROM storage.objects',
      'SELECT * FROM vault.secrets',
      'SELECT * FROM realtime.messages',
      "INSERT INTO realtime.messages(topic, extension, payload) VALUES ('collab:x:y', 'broadcast', '{}')",
      "SELECT realtime.send('{}', 'changed', 'collab:x:y', true)"
    ])
      expect(await asService(sql), sql).toMatch(/permission denied|does not exist/);
    expect(await asService(`SELECT admin_private.broadcast('{"revision":1}', 'changed', 'collab:x:y')`)).toBe('ok');
    for (const [event, topic] of [
      ['changed', 'other-app:topic'],
      ['changed', 'collab:x'],
      ['presence', 'collab:x:y'],
      ['changed', 'collab:x:y:z']
    ])
      expect(await asService('SELECT admin_private.broadcast($1, $2, $3)', ['{}', event, topic]), topic).toMatch(
        /only sends collaboration invalidations/
      );
    // 普通登录用户不能调用这个广播函数
    expect(
      (
        await owner.query(
          "SELECT has_function_privilege('authenticated', 'admin_private.broadcast(jsonb, text, text)', 'EXECUTE') AS allowed"
        )
      ).rows[0]
    ).toEqual({ allowed: false });
  });
  it('改不了表结构与行级策略，不能建表，也不能借用别的角色的身份', async () => {
    for (const sql of [
      'ALTER TABLE admin_private.memberships DISABLE ROW LEVEL SECURITY',
      'ALTER TABLE public.shared_records NO FORCE ROW LEVEL SECURITY',
      'CREATE POLICY open ON admin_private.memberships USING (true)',
      'DROP POLICY admin_collaboration_service ON admin_private.memberships',
      'ALTER TABLE admin_private.prs ADD COLUMN extra text',
      'DROP TABLE public.admin_audit',
      'CREATE TABLE public.leak(id int)',
      'CREATE TABLE admin_private.leak(id int)',
      'SET ROLE postgres',
      'SET ROLE service_role',
      'SET ROLE authenticated',
      "CREATE OR REPLACE FUNCTION admin_private.broadcast(payload jsonb, event text, topic text) RETURNS void LANGUAGE sql AS 'SELECT 1'"
    ])
      expect(await asService(sql), sql).toMatch(/permission denied|must be owner|must be member/);
    // 没有授权选项：转授只得到「没有授予任何权限」的警告，anon 仍然没有权限
    await asService('GRANT SELECT ON admin_private.memberships TO anon');
    expect(
      (
        await owner.query(
          "SELECT has_table_privilege('anon', 'admin_private.memberships', 'SELECT') AS anon, has_table_privilege('authenticated', 'admin_private.memberships', 'SELECT') AS authenticated"
        )
      ).rows[0]
    ).toEqual({ anon: false, authenticated: false });
  });
  it('重复执行全部迁移后权限不变：仍读不到初始化密钥，策略与授权不会累积', async () => {
    const before = await owner.query(
      `SELECT table_schema, table_name, privilege_type FROM information_schema.role_table_grants
       WHERE grantee = $1 ORDER BY 1, 2, 3`,
      [serviceRole]
    );
    await applyMigrations(owner);
    const after = await owner.query(
      `SELECT table_schema, table_name, privilege_type FROM information_schema.role_table_grants
       WHERE grantee = $1 ORDER BY 1, 2, 3`,
      [serviceRole]
    );
    expect(after.rows).toEqual(before.rows);
    expect(after.rows.length).toBeGreaterThan(0);
    expect(await asService('SELECT bootstrap_key FROM admin_private.workspaces')).toMatch(/permission denied/);
    const policies = await owner.query(
      "SELECT count(*)::int AS count FROM pg_policies WHERE policyname = 'admin_collaboration_service'"
    );
    expect(policies.rows[0]).toEqual({ count: 22 });
  });
});
