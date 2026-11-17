import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { diffRecords } from '../changes.js';
import { commitFingerprint, sealCommit, uuidv7 } from '../commit.js';
import type { Command, Commit, Identity, Records } from '../model.js';
import { historyAdmin, replayHistory, type HistoryDriver } from './history.testing.js';
import { applyMigrations, readMigrations } from './migrate.js';
import { CollaborationRepository } from './repository.js';
const run = promisify(execFile);
const container = `admin-collaboration-${randomUUID()}`;
const admin: Identity = { id: randomUUID(), email: 'admin@example.test', verified: true };
let pool: pg.Pool;
let repository: CollaborationRepository;
let started = false;
const input = { teamId: randomUUID(), appId: 'assets', name: 'Isolation test', bootstrapKey: randomUUID(), admin };
const command = (data: Record<string, unknown>) => ({ operationId: randomUUID(), ...data }) as Command;
/** 时限内的结果：成功、失败或仍在等待；用于断言某个调用是否被行锁挡住。 */
const outcomeWithin = (pending: Promise<unknown>, ms: number) =>
  Promise.race([
    pending.then(
      () => 'resolved' as const,
      () => 'rejected' as const
    ),
    new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), ms))
  ]);
/** 相对 `before` 的内容形成一个已签名的提交：字段级变更加上内容指纹。 */
const signed = (id: string, parent: string | null, before: Records, after: Records, message = id): Promise<Commit> =>
  sealCommit({ id, parent, authorId: admin.id, message, changes: diffRecords(before, after) });
/** 删除测试自建的工作区及其全部投影，避免影响按行数断言的 RLS 用例。 */
async function removeWorkspace(workspace: { teamId: string; appId: string }) {
  for (const table of [
    'public.admin_presence',
    'public.admin_changes',
    'public.admin_audit',
    'public.admin_workspace_versions',
    'public.admin_shared',
    'public.shared_records',
    'admin_private.commit_changes',
    'admin_private.commits',
    'admin_private.memberships',
    'admin_private.workspaces'
  ]) {
    await pool.query(`DELETE FROM ${table} WHERE team_id = $1 AND app_id = $2`, [workspace.teamId, workspace.appId]);
  }
}
describe('PostgreSQL transaction and RLS boundary', () => {
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
    const port = Number(stdout.trim().split(':').at(-1));
    pool = new pg.Pool({
      host: '127.0.0.1',
      port,
      user: 'postgres',
      password,
      database: 'postgres',
      max: 5,
      connectionTimeoutMillis: 2000
    });
    await vi.waitFor(
      async () => {
        await pool.query('SELECT 1');
      },
      { timeout: 45000, interval: 500 }
    );
    await applyMigrations(pool);
    repository = new CollaborationRepository(pool);
    await repository.initialize(input);
  }, 60000);
  afterAll(async () => {
    await pool?.end();
    if (started) await run('docker', ['stop', container]);
  }, 20000);
  it('initializes once without resetting permissions, and rejects mismatched seed ownership', async () => {
    await expect(repository.initialize(input)).resolves.toMatchObject({ teamId: input.teamId });
    await expect(repository.initialize({ ...input, bootstrapKey: 'wrong' })).rejects.toThrow(/初始化/);
  });
  it('keeps presence outside the business projection and removes expired or revoked sessions', async () => {
    const seed = { ...input, teamId: randomUUID(), appId: 'presence', bootstrapKey: randomUUID() };
    await repository.initialize(seed);
    try {
      const before = await repository.read(admin, seed.teamId, seed.appId);
      const sessionId = randomUUID();
      const presence = command({ type: 'presence', sessionId, prId: null, recordId: null, leave: false });

      await expect(repository.operation(admin, seed.teamId, seed.appId, presence)).resolves.toMatchObject({
        expiresAt: expect.any(Number)
      });
      const after = await repository.read(admin, seed.teamId, seed.appId);
      expect(after.revision).toBe(before.revision);
      expect(after.audit).toEqual(before.audit);
      expect(after.presence).toEqual([expect.objectContaining({ userId: admin.id, sessionId })]);

      const stored = await pool.query<{
        state: { revision: number; audit: unknown[]; receipts: Record<string, unknown> };
      }>('SELECT state FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2', [seed.teamId, seed.appId]);
      expect(stored.rows[0].state.revision).toBe(before.revision);
      expect(stored.rows[0].state.audit).toHaveLength(before.audit.length);
      expect(stored.rows[0].state.receipts[presence.operationId]).toBeUndefined();
      expect(
        Number(
          (
            await pool.query(
              'SELECT revision FROM public.admin_workspace_versions WHERE team_id = $1 AND app_id = $2',
              [seed.teamId, seed.appId]
            )
          ).rows[0].revision
        )
      ).toBe(before.revision);
      expect(
        (
          await pool.query('SELECT count(*)::int AS count FROM public.admin_audit WHERE team_id = $1 AND app_id = $2', [
            seed.teamId,
            seed.appId
          ])
        ).rows[0].count
      ).toBe(before.audit.length);

      await pool.query(
        'UPDATE public.admin_presence SET expires_at = 0 WHERE team_id = $1 AND app_id = $2 AND session_id = $3',
        [seed.teamId, seed.appId, sessionId]
      );
      expect((await repository.read(admin, seed.teamId, seed.appId)).presence).toEqual([]);

      const reviewer = { id: randomUUID(), email: 'presence-reviewer@example.test', verified: true };
      await repository.operation(
        admin,
        seed.teamId,
        seed.appId,
        command({
          type: 'invite',
          id: 'presence-invite',
          email: reviewer.email,
          permissions: ['read'],
          tokenHash: 'presence-token',
          expiresAt: Date.now() + 60000,
          expectedVersion: 0
        })
      );
      await repository.operation(
        reviewer,
        seed.teamId,
        seed.appId,
        command({ type: 'accept_invite', id: 'presence-invite', tokenHash: 'presence-token' })
      );
      const reviewerSessionId = randomUUID();
      await repository.operation(
        reviewer,
        seed.teamId,
        seed.appId,
        command({ type: 'presence', sessionId: reviewerSessionId, prId: null, recordId: null, leave: false })
      );
      await repository.operation(
        admin,
        seed.teamId,
        seed.appId,
        command({ type: 'member', userId: reviewer.id, permissions: [], active: false, expectedGeneration: 1 })
      );
      expect((await repository.read(admin, seed.teamId, seed.appId)).presence).toEqual([]);
    } finally {
      await removeWorkspace(seed);
    }
  });
  it('denies ordinary authenticated admins direct writes and cross-team reads', async () => {
    const client = await pool.connect();
    try {
      await client.query('SET ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [admin.id]);
      expect((await client.query('SELECT * FROM public.admin_shared')).rows).toHaveLength(1);
      expect((await client.query('SELECT * FROM public.admin_workspace_versions')).rows).toHaveLength(1);
      await expect(client.query('UPDATE public.admin_workspace_versions SET revision = 999')).rejects.toThrow(
        /permission denied/
      );
      await expect(client.query("UPDATE public.admin_shared SET head = 'forged'")).rejects.toThrow(/permission denied/);
      await expect(client.query("UPDATE public.shared_records SET fields = '{}'::jsonb")).rejects.toThrow(
        /permission denied/
      );
      await expect(client.query('DELETE FROM public.shared_records')).rejects.toThrow(/permission denied/);
      await expect(client.query('DELETE FROM public.admin_audit')).rejects.toThrow(/permission denied/);
      // ADMIN-US-203 验收 5：绕过 PR 直接插入共享数据、共享头、合并审计、变更日志、版本和在线状态同样被拒。
      // 用不带 ON CONFLICT 的纯 INSERT：只要 INSERT 授权被放开，错误就不再是 permission denied（RLS 拒绝或主键冲突），用例随即变红。
      const own = [input.teamId, input.appId];
      const forgedInserts: [table: string, sql: string, params: string[]][] = [
        ['admin_shared', `INSERT INTO public.admin_shared(team_id, app_id, head) VALUES ($1, $2, 'forged')`, own],
        [
          'shared_records',
          `INSERT INTO public.shared_records(team_id, app_id, record_id, entity, fields)
           VALUES ($1, $2, 'forged', 'AssetCategory', '{}'::jsonb)`,
          own
        ],
        [
          'admin_audit',
          `INSERT INTO public.admin_audit(team_id, app_id, id, actor_id, action, details, created_at)
           VALUES ($1, $2, 'forged-merge', $3, 'merge', '{}'::jsonb, now())`,
          [...own, admin.id]
        ],
        [
          'admin_changes',
          `INSERT INTO public.admin_changes(team_id, app_id, merge_id, record_id, before_data, after_data)
           VALUES ($1, $2, 'forged-merge', 'record', NULL, '{}'::jsonb)`,
          own
        ],
        [
          'admin_workspace_versions',
          `INSERT INTO public.admin_workspace_versions(team_id, app_id, revision) VALUES ($1, $2, 999)`,
          own
        ],
        [
          'admin_presence',
          `INSERT INTO public.admin_presence(team_id, app_id, user_id, session_id, pr_id, record_id, expires_at)
           VALUES ($1, $2, $3, 'forged-session', NULL, NULL, 9999999999999)`,
          [...own, admin.id]
        ]
      ];
      for (const [table, sql, params] of forgedInserts)
        await expect(client.query(sql, params), `INSERT INTO ${table}`).rejects.toThrow(/permission denied/);
      for (const table of ['workspaces', 'commits', 'commit_changes'])
        await expect(client.query(`SELECT * FROM admin_private.${table}`), table).rejects.toThrow(/permission denied/);
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [randomUUID()]);
      expect((await client.query('SELECT * FROM public.admin_shared')).rows).toHaveLength(0);
      expect((await client.query('SELECT * FROM public.admin_workspace_versions')).rows).toHaveLength(0);
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  });
  it('serves snapshots and receipts without waiting for an in-flight write lock', async () => {
    const writer = await pool.connect();
    try {
      await writer.query('BEGIN');
      await writer.query('SELECT 1 FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2 FOR UPDATE', [
        input.teamId,
        input.appId
      ]);
      // 写事务持有行锁期间，读取必须基于已提交版本立即返回，不能排队等待写入结束
      await expect(outcomeWithin(repository.read(admin, input.teamId, input.appId), 1000)).resolves.toBe('resolved');
      await expect(
        outcomeWithin(repository.receipt(admin, input.teamId, input.appId, randomUUID()), 1000)
      ).resolves.toBe('resolved');
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
    }
  });
  /** 带一个已合并 PR 的工作区：共享头、提交、候选与审计事件都有内容。 */
  async function mergedWorkspace(appId: string, owner = admin) {
    const seed = { ...input, teamId: randomUUID(), appId, bootstrapKey: randomUUID(), admin: owner };
    await repository.initialize(seed);
    const op = (data: Record<string, unknown>, actor = owner) =>
      repository.operation(actor, seed.teamId, seed.appId, command(data));
    await op({ type: 'policy', stages: [], expectedVersion: 1 });
    await op({ type: 'task', id: 'task', name: 'Task', expectedHead: null });
    await op({
      type: 'upload',
      taskId: 'task',
      expectedHead: null,
      commits: [
        await sealCommit({
          id: 'commit-1',
          parent: null,
          authorId: owner.id,
          message: 'First',
          changes: diffRecords({}, { category: { entity: 'AssetCategory', fields: { name: 'Computers' } } })
        })
      ]
    });
    await op({ type: 'pr', id: 'pr', taskId: 'task', title: 'Review', description: '', target: 'shared' });
    await op({ type: 'pr_state', prId: 'pr', status: 'review', expectedRevision: 0 });
    const candidateId = String(
      (await op({ type: 'candidate', prId: 'pr', expectedRevision: 1, resolutions: [] }))['candidateId']
    );
    const merged = await op({
      type: 'merge',
      prId: 'pr',
      candidateId,
      expectedSource: 'commit-1',
      expectedTarget: null
    });
    return { seed, candidateId, head: String(merged['head']) };
  }
  it('serves a metadata-only summary and the heavy content through on-demand reads with the same authorization', async () => {
    const { seed, candidateId, head } = await mergedWorkspace('on-demand');
    try {
      const summary = await repository.read(admin, seed.teamId, seed.appId);
      expect(summary).not.toHaveProperty('records');
      expect(summary.head).toBe(head);
      expect(summary.auditCount).toBe(summary.audit.length);
      for (const commit of Object.values(summary.commits)) expect(commit).not.toHaveProperty('records');
      expect(summary.candidates[candidateId]).not.toHaveProperty('records');
      expect(Object.keys(summary.commits)).toEqual(['commit-1', head]);
      expect(summary.commits[head]).toMatchObject({ parent: null, mergeSource: 'commit-1', candidateId });

      const records = { category: { entity: 'AssetCategory', fields: { name: 'Computers' } } };
      await expect(repository.readRecords(admin, seed.teamId, seed.appId)).resolves.toEqual({ head, records });
      await expect(repository.readCommit(admin, seed.teamId, seed.appId, 'commit-1')).resolves.toEqual({
        id: 'commit-1',
        parent: null,
        authorId: admin.id,
        message: 'First',
        records
      });
      await expect(repository.readCommit(admin, seed.teamId, seed.appId, head)).resolves.toMatchObject({ records });
      await expect(repository.readCandidate(admin, seed.teamId, seed.appId, candidateId)).resolves.toMatchObject({
        id: candidateId,
        source: 'commit-1',
        records
      });
      const newest = await repository.readAudit(admin, seed.teamId, seed.appId, { limit: 2 });
      expect(newest.events.map(event => event.action)).toEqual(['merge', 'candidate']);
      expect(newest.nextBefore).toBe(newest.events[1].id);
      const rest = await repository.readAudit(admin, seed.teamId, seed.appId, { before: newest.nextBefore! });
      expect(rest.events.length + newest.events.length).toBe(summary.auditCount);
      expect(rest.nextBefore).toBeNull();
      const related = await repository.readAudit(admin, seed.teamId, seed.appId, { prId: 'pr' });
      expect(related.events.map(event => event.action)).toEqual(['merge', 'candidate', 'pr_state', 'pr']);

      await expect(repository.readCommit(admin, seed.teamId, seed.appId, 'missing')).rejects.toMatchObject({
        code: 'not_found'
      });
      await expect(repository.readCandidate(admin, seed.teamId, seed.appId, 'commit-1')).rejects.toMatchObject({
        code: 'not_found'
      });
      const outsider = { id: randomUUID(), email: 'outsider@example.test', verified: true };
      for (const read of [
        () => repository.read(outsider, seed.teamId, seed.appId),
        () => repository.readRecords(outsider, seed.teamId, seed.appId),
        () => repository.readCommit(outsider, seed.teamId, seed.appId, 'commit-1'),
        () => repository.readCandidate(outsider, seed.teamId, seed.appId, candidateId),
        () => repository.readAudit(outsider, seed.teamId, seed.appId, {})
      ])
        await expect(read()).rejects.toMatchObject({ code: 'forbidden' });
      await expect(repository.readCommit(admin, randomUUID(), 'other', 'commit-1')).rejects.toMatchObject({
        code: 'forbidden'
      });
    } finally {
      await removeWorkspace(seed);
    }
  });
  it('serves on-demand reads without waiting for an in-flight write lock', async () => {
    const { seed, candidateId } = await mergedWorkspace('on-demand-lock');
    const writer = await pool.connect();
    try {
      await writer.query('BEGIN');
      await writer.query('SELECT 1 FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2 FOR UPDATE', [
        seed.teamId,
        seed.appId
      ]);
      // 写事务持有行锁期间，按需读取同样基于已提交版本立即返回，不能排队等待写入结束
      const reads: Record<string, () => Promise<unknown>> = {
        records: () => repository.readRecords(admin, seed.teamId, seed.appId),
        commit: () => repository.readCommit(admin, seed.teamId, seed.appId, 'commit-1'),
        candidate: () => repository.readCandidate(admin, seed.teamId, seed.appId, candidateId),
        audit: () => repository.readAudit(admin, seed.teamId, seed.appId, { limit: 2 })
      };
      for (const [name, read] of Object.entries(reads))
        await expect(outcomeWithin(read(), 1000), name).resolves.toBe('resolved');
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
      await removeWorkspace(seed);
    }
  });
  it('does not let a presence heartbeat race past a concurrent revocation', async () => {
    const seed = { ...input, teamId: randomUUID(), appId: 'presence-race', bootstrapKey: randomUUID() };
    await repository.initialize(seed);
    try {
      const reviewer = { id: randomUUID(), email: 'presence-race@example.test', verified: true };
      await repository.operation(
        admin,
        seed.teamId,
        seed.appId,
        command({
          type: 'invite',
          id: 'race-invite',
          email: reviewer.email,
          permissions: ['read'],
          tokenHash: 'race-token',
          expiresAt: Date.now() + 60000,
          expectedVersion: 0
        })
      );
      await repository.operation(
        reviewer,
        seed.teamId,
        seed.appId,
        command({ type: 'accept_invite', id: 'race-invite', tokenHash: 'race-token' })
      );
      const writer = await pool.connect();
      let heartbeat: Promise<unknown> | undefined;
      let committed = false;
      try {
        await writer.query('BEGIN');
        await writer.query('SELECT 1 FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2 FOR UPDATE', [
          seed.teamId,
          seed.appId
        ]);
        heartbeat = repository.operation(
          reviewer,
          seed.teamId,
          seed.appId,
          command({ type: 'presence', sessionId: randomUUID(), prId: null, recordId: null, leave: false })
        );
        await expect(outcomeWithin(heartbeat, 300)).resolves.toBe('pending');
        // 与心跳并发提交的撤权：心跳必须等它提交并按新的成员关系授权，不能凭撤权前读到的状态写入在线记录
        await writer.query(
          `UPDATE admin_private.workspaces SET state = jsonb_set(state, ARRAY['members', $3::text, 'active'], 'false'::jsonb)
           WHERE team_id = $1 AND app_id = $2`,
          [seed.teamId, seed.appId, reviewer.id]
        );
        await writer.query('COMMIT');
        committed = true;
      } finally {
        if (!committed) await writer.query('ROLLBACK');
        writer.release();
      }
      await expect(heartbeat).rejects.toMatchObject({ code: 'forbidden' });
      const online = await pool.query(
        'SELECT 1 FROM public.admin_presence WHERE team_id = $1 AND app_id = $2 AND user_id = $3',
        [seed.teamId, seed.appId, reviewer.id]
      );
      expect(online.rowCount).toBe(0);
    } finally {
      await removeWorkspace(seed);
    }
  });
  it('serializes concurrent upload heads and preserves the losing branch locally for recovery', async () => {
    await repository.operation(
      admin,
      input.teamId,
      input.appId,
      command({ type: 'task', id: 'concurrent', name: 'Concurrent', expectedHead: null })
    );
    const upload = async (id: string) =>
      command({
        type: 'upload',
        taskId: 'concurrent',
        expectedHead: null,
        commits: [await signed(id, null, {}, { category: { entity: 'AssetCategory', fields: { name: id } } })]
      });
    const commands = [await upload('first'), await upload('second')];
    const results = await Promise.allSettled(
      commands.map(c => repository.operation(admin, input.teamId, input.appId, c))
    );
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const state = await repository.read(admin, input.teamId, input.appId);
    expect(Object.keys(state.commits)).toHaveLength(1);
    const winner = commands[results.findIndex(r => r.status === 'fulfilled')];
    await expect(repository.operation(admin, input.teamId, input.appId, winner)).resolves.toMatchObject({
      taskId: 'concurrent'
    });
  });
  it('rolls back shared records, merge commit, head, PR, receipt and audit when projection fails mid-transaction', async () => {
    await repository.operation(
      admin,
      input.teamId,
      input.appId,
      command({ type: 'policy', stages: [], expectedVersion: 1 })
    );
    await repository.operation(
      admin,
      input.teamId,
      input.appId,
      command({ type: 'pr', id: 'pr', taskId: 'concurrent', title: 'Atomic', description: '', target: 'shared' })
    );
    await repository.operation(
      admin,
      input.teamId,
      input.appId,
      command({ type: 'pr_state', prId: 'pr', status: 'review', expectedRevision: 0 })
    );
    await repository.operation(
      admin,
      input.teamId,
      input.appId,
      command({ type: 'candidate', prId: 'pr', expectedRevision: 1, resolutions: [] })
    );
    const before = await repository.read(admin, input.teamId, input.appId);
    const candidate = before.prs[0].candidateId!;
    const merge = command({
      type: 'merge',
      prId: 'pr',
      candidateId: candidate,
      expectedSource: before.candidates[candidate].source,
      expectedTarget: null
    });
    await pool.query(
      `CREATE FUNCTION admin_private.fail_merge() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'merge' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_merge BEFORE INSERT ON public.admin_audit FOR EACH ROW EXECUTE FUNCTION admin_private.fail_merge();`
    );
    await expect(repository.operation(admin, input.teamId, input.appId, merge)).rejects.toThrow(/injected failure/);
    const after = await repository.read(admin, input.teamId, input.appId);
    expect(after).toEqual(before);
    expect((await pool.query('SELECT head FROM public.admin_shared')).rows).toEqual([{ head: null }]);
    expect((await pool.query('SELECT count(*)::int AS count FROM public.shared_records')).rows[0].count).toBe(0);
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM admin_private.commits WHERE merge_source IS NOT NULL'))
        .rows[0].count
    ).toBe(0);
    await expect(repository.receipt(admin, input.teamId, input.appId, merge.operationId)).resolves.toEqual({
      status: 'unknown'
    });
    await pool.query('DROP TRIGGER fail_merge ON public.admin_audit');
    await expect(repository.operation(admin, input.teamId, input.appId, merge)).resolves.toMatchObject({
      candidateId: candidate
    });
  });
  it('rolls back every bootstrap projection after a late initialization failure and retries cleanly', async () => {
    const seed = { ...input, teamId: randomUUID(), bootstrapKey: randomUUID() };
    await pool.query(
      `CREATE FUNCTION admin_private.fail_bootstrap() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'bootstrap' THEN RAISE EXCEPTION 'bootstrap failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_bootstrap BEFORE INSERT ON public.admin_audit FOR EACH ROW EXECUTE FUNCTION admin_private.fail_bootstrap();`
    );
    try {
      await expect(repository.initialize(seed)).rejects.toThrow(/bootstrap failure/);
      for (const table of [
        'admin_private.workspaces',
        'admin_private.memberships',
        'public.admin_shared',
        'public.admin_audit',
        'public.admin_workspace_versions'
      ])
        expect((await pool.query(`SELECT * FROM ${table} WHERE team_id = $1`, [seed.teamId])).rows).toEqual([]);
    } finally {
      await pool.query('DROP TRIGGER fail_bootstrap ON public.admin_audit');
    }
    await repository.initialize(seed);
    const state = await repository.read(admin, seed.teamId, seed.appId);
    expect(state.head).toBeNull();
    await expect(repository.readRecords(admin, seed.teamId, seed.appId)).resolves.toEqual({ head: null, records: {} });
    expect(state.policy.stages).toMatchObject([{ minimum: 1 }]);
    expect(state.members).toMatchObject([{ id: admin.id, permissions: expect.arrayContaining(['manage']) }]);
  });
  it('serializes invitation acceptance against revocation and replacement without reviving membership', async () => {
    for (const replacement of [false, true]) {
      const seed = { ...input, teamId: randomUUID(), bootstrapKey: randomUUID() };
      await repository.initialize(seed);
      const user = { id: randomUUID(), email: 'invited@example.test', verified: true };
      const op = (data: Record<string, unknown>, actor = admin) =>
        repository.operation(actor, seed.teamId, seed.appId, command(data));
      const invite = {
        type: 'invite',
        id: 'invite',
        email: user.email,
        permissions: ['read'],
        tokenHash: 'old',
        expiresAt: Date.now() + 60000,
        expectedVersion: 0
      };
      await op(invite);
      const results = await Promise.allSettled([
        op({ type: 'accept_invite', id: 'invite', tokenHash: 'old' }, user),
        op(
          replacement ?
            { ...invite, tokenHash: 'new', expectedVersion: 1 }
          : { type: 'revoke_invite', id: 'invite', expectedVersion: 1 }
        )
      ]);
      expect(results.filter(value => value.status === 'fulfilled')).toHaveLength(1);
      const state = await repository.read(admin, seed.teamId, seed.appId);
      expect(state.members.some(member => member.id === user.id && member.active)).toBe(
        results[0].status === 'fulfilled'
      );
      if (results[0].status === 'fulfilled')
        await op({ type: 'member', userId: user.id, active: false, permissions: [], expectedGeneration: 1 });
      await expect(op({ type: 'accept_invite', id: 'invite', tokenHash: 'old' }, user)).rejects.toThrow();
    }
  });
  it('orders merge races with revocation, change requests, reopened threads, source edits and target merges', async () => {
    for (const race of ['revoke', 'review', 'thread', 'source', 'target']) {
      const seed = { ...input, teamId: randomUUID(), bootstrapKey: randomUUID() };
      await repository.initialize(seed);
      const user = { id: randomUUID(), email: 'reviewer@example.test', verified: true };
      const op = (data: Record<string, unknown>, actor = admin) =>
        repository.operation(actor, seed.teamId, seed.appId, command(data));
      await op({
        type: 'invite',
        id: 'invite',
        email: user.email,
        permissions: ['read', 'review', 'comment'],
        tokenHash: 'token',
        expiresAt: Date.now() + 60000,
        expectedVersion: 0
      });
      await op({ type: 'accept_invite', id: 'invite', tokenHash: 'token' }, user);
      await op({ type: 'policy', stages: [], expectedVersion: 1 });
      const readyPr = async (suffix: string) => {
        await op({ type: 'task', id: suffix, name: suffix, expectedHead: null });
        await op({
          type: 'upload',
          taskId: suffix,
          expectedHead: null,
          commits: [
            await signed(
              `commit-${suffix}`,
              null,
              {},
              { category: { entity: 'AssetCategory', fields: { name: suffix } } },
              suffix
            )
          ]
        });
        await op({ type: 'pr', id: suffix, taskId: suffix, title: suffix, description: '', target: 'shared' });
        await op({ type: 'pr_state', prId: suffix, status: 'review', expectedRevision: 0 });
        const result = await op({ type: 'candidate', prId: suffix, expectedRevision: 1, resolutions: [] });
        return {
          type: 'merge',
          prId: suffix,
          candidateId: result['candidateId'],
          expectedSource: `commit-${suffix}`,
          expectedTarget: null
        };
      };
      const merge = await readyPr('main');
      await op(
        {
          type: 'thread',
          id: 'required',
          prId: 'main',
          candidateId: merge.candidateId,
          recordId: 'category',
          field: 'name',
          body: 'Check',
          required: true,
          mentions: []
        },
        user
      );
      await op({ type: 'resolve_thread', threadId: 'required', resolved: true, expectedRevision: 0 }, user);
      const target = await readyPr('target');
      const update = await signed(
        'updated',
        'commit-main',
        { category: { entity: 'AssetCategory', fields: { name: 'main' } } },
        {},
        'Update'
      );
      const changes: Record<string, Record<string, unknown>> = {
        revoke: {
          type: 'member',
          userId: admin.id,
          permissions: ['read', 'edit', 'review', 'comment', 'manage'],
          active: true,
          expectedGeneration: 1
        },
        review: {
          type: 'review',
          prId: 'main',
          candidateId: merge.candidateId,
          expectedSource: 'commit-main',
          stageId: 'review',
          decision: 'request_changes',
          reason: 'Hold',
          expectedRevision: 0
        },
        thread: { type: 'resolve_thread', threadId: 'required', resolved: false, expectedRevision: 1 },
        source: {
          type: 'upload',
          taskId: 'main',
          expectedHead: 'commit-main',
          commits: [update]
        },
        target
      };
      const blocker = command(changes[race]);
      const merger = command(merge);
      const results = await Promise.allSettled([
        repository.operation(['review', 'thread'].includes(race) ? user : admin, seed.teamId, seed.appId, blocker),
        repository.operation(admin, seed.teamId, seed.appId, merger)
      ]);
      const state = await repository.read(admin, seed.teamId, seed.appId);
      const mergeIndex = state.audit.findIndex(event => event.operationId === merger.operationId);
      const blockerIndex = state.audit.findIndex(event => event.operationId === blocker.operationId);
      expect(mergeIndex >= 0).toBe(results[1].status === 'fulfilled');
      expect(blockerIndex >= 0).toBe(results[0].status === 'fulfilled');
      if (mergeIndex >= 0 && blockerIndex >= 0) expect(mergeIndex).toBeLessThan(blockerIndex);
      if (blockerIndex >= 0 && mergeIndex < 0) expect(state.prs.find(pr => pr.id === 'main')?.status).toBe('review');
      expect(results.some(value => value.status === 'fulfilled')).toBe(true);
    }
  });

  /** 数据库里与协作表有关的结构：列、索引、约束、策略、授权与行级安全开关，用来比较迁移前后是否有差异。 */
  async function schemaSignature() {
    const result = await pool.query<{ kind: string; name: string; detail: string }>(
      `WITH tables(schema_name, table_name) AS (
         VALUES ('admin_private','workspaces'),('admin_private','memberships'),('admin_private','commits'),
           ('admin_private','commit_changes'),('public','admin_shared'),('public','shared_records'),('public','admin_audit'),
           ('public','admin_changes'),('public','admin_workspace_versions'),('public','admin_presence')
       )
       SELECT 'column' AS kind, c.table_schema || '.' || c.table_name || '.' || c.column_name AS name,
         c.data_type || ':' || c.is_nullable || ':' || coalesce(c.column_default, '') || ':' || c.is_identity AS detail
       FROM information_schema.columns c JOIN tables t ON t.schema_name = c.table_schema AND t.table_name = c.table_name
       UNION ALL SELECT 'index', i.schemaname || '.' || i.indexname, i.indexdef
       FROM pg_indexes i JOIN tables t ON t.schema_name = i.schemaname AND t.table_name = i.tablename
       UNION ALL SELECT 'constraint', k.conrelid::regclass::text || '.' || k.conname, pg_get_constraintdef(k.oid)
       FROM pg_constraint k JOIN pg_class r ON r.oid = k.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace
       JOIN tables t ON t.schema_name = n.nspname AND t.table_name = r.relname
       UNION ALL SELECT 'policy', p.schemaname || '.' || p.tablename || '.' || p.policyname,
         p.cmd || ':' || p.roles::text || ':' || coalesce(p.qual, '')
       FROM pg_policies p JOIN tables t ON t.schema_name = p.schemaname AND t.table_name = p.tablename
       UNION ALL SELECT 'grant', g.table_schema || '.' || g.table_name || '.' || g.grantee, string_agg(g.privilege_type, ',' ORDER BY g.privilege_type)
       FROM information_schema.role_table_grants g JOIN tables t ON t.schema_name = g.table_schema AND t.table_name = g.table_name
       WHERE g.grantee IN ('anon', 'authenticated', 'PUBLIC')
       GROUP BY g.table_schema, g.table_name, g.grantee
       UNION ALL SELECT 'rls', n.nspname || '.' || r.relname, r.relrowsecurity::text
       FROM pg_class r JOIN pg_namespace n ON n.oid = r.relnamespace JOIN tables t ON t.schema_name = n.nspname AND t.table_name = r.relname
       ORDER BY 1, 2`
    );
    return result.rows;
  }
  it('runs every migration file in name order and is unchanged by running them again, in full or one by one', async () => {
    const migrations = await readMigrations();
    expect(migrations.map(migration => migration.name)).toEqual(migrations.map(migration => migration.name).sort());
    expect(migrations.map(migration => migration.name)).toEqual(
      expect.arrayContaining(['202611160001_collaboration.sql', '202611170001_commit_store.sql'])
    );
    const before = await schemaSignature();
    expect(
      before.filter(row => row.kind === 'column' && row.name.startsWith('public.admin_shared.')).map(row => row.name)
    ).toEqual(['public.admin_shared.app_id', 'public.admin_shared.head', 'public.admin_shared.team_id']);
    for (const table of ['admin_private.commits', 'admin_private.commit_changes', 'public.shared_records'])
      expect(
        before.some(row => row.kind === 'column' && row.name.startsWith(`${table}.`)),
        table
      ).toBe(true);
    expect(before).toContainEqual(expect.objectContaining({ kind: 'index', name: 'admin_private.commits_parent' }));
    expect(await applyMigrations(pool)).toEqual(migrations.map(migration => migration.name));
    expect(await schemaSignature()).toEqual(before);
    for (const migration of [...migrations].reverse()) await pool.query(migration.sql);
    expect(await schemaSignature()).toEqual(before);
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM admin_private.workspaces')).rows[0].count
    ).toBeGreaterThan(0);
  });
  it('lets readable members read the materialized shared records, nobody else, and nobody write them', async () => {
    const mine = await mergedWorkspace('records-rls');
    const other = { id: randomUUID(), email: 'other-admin@example.test', verified: true };
    const theirs = await mergedWorkspace('records-rls-other', other);
    const client = await pool.connect();
    const readRows = async (team: string) =>
      (await client.query('SELECT record_id, entity, fields FROM public.shared_records WHERE team_id = $1', [team]))
        .rows;
    try {
      await client.query('SET ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [admin.id]);
      expect(await readRows(mine.seed.teamId)).toEqual([
        { record_id: 'category', entity: 'AssetCategory', fields: { name: 'Computers' } }
      ]);
      expect(await readRows(theirs.seed.teamId)).toEqual([]);
      const visible = (
        await client.query<{ team_id: string }>('SELECT DISTINCT team_id FROM public.shared_records')
      ).rows.map(row => row.team_id);
      expect(visible).toContain(mine.seed.teamId);
      expect(visible).not.toContain(theirs.seed.teamId);
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [randomUUID()]);
      expect((await client.query('SELECT * FROM public.shared_records')).rows).toEqual([]);
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [admin.id]);
      for (const sql of [
        `INSERT INTO public.shared_records(team_id, app_id, record_id, entity, fields) VALUES ('${mine.seed.teamId}', 'records-rls', 'x', 'AssetCategory', '{}')`,
        `UPDATE public.shared_records SET fields = '{}'::jsonb`,
        'DELETE FROM public.shared_records'
      ])
        await expect(client.query(sql), sql).rejects.toThrow(/permission denied/);
      for (const table of ['commits', 'commit_changes'])
        await expect(client.query(`SELECT * FROM admin_private.${table}`), table).rejects.toThrow(/permission denied/);
    } finally {
      await client.query('RESET ROLE');
      client.release();
      await removeWorkspace(mine.seed);
      await removeWorkspace(theirs.seed);
    }
  });
  it('materializes the merged records so that the shared rows, the head and GET records agree, with no commits or records in the workspace row', async () => {
    const { seed, head } = await mergedWorkspace('materialized');
    try {
      const row = async () =>
        (
          await pool.query<{ state: Record<string, unknown> }>(
            'SELECT state FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2',
            [seed.teamId, seed.appId]
          )
        ).rows[0].state;
      const rows = async () =>
        Object.fromEntries(
          (
            await pool.query<{ record_id: string; entity: string; fields: unknown }>(
              'SELECT record_id, entity, fields FROM public.shared_records WHERE team_id = $1 AND app_id = $2',
              [seed.teamId, seed.appId]
            )
          ).rows.map(item => [item.record_id, { entity: item.entity, fields: item.fields }])
        );
      const op = (data: Record<string, unknown>) => repository.operation(admin, seed.teamId, seed.appId, command(data));
      const read = await repository.readRecords(admin, seed.teamId, seed.appId);
      expect(read).toEqual({ head, records: await rows() });
      expect((await pool.query('SELECT head FROM public.admin_shared WHERE team_id = $1', [seed.teamId])).rows).toEqual(
        [{ head }]
      );
      expect(await row()).toMatchObject({ head });
      expect(Object.keys(await row())).not.toEqual(expect.arrayContaining(['commits']));
      expect(await row()).not.toHaveProperty('commits');
      expect(await row()).not.toHaveProperty('records');

      // 第二次合并只改动一部分记录：共享行随之更新、新增与删除，没有改动的行保持不变
      const first = await repository.readCommit(admin, seed.teamId, seed.appId, head);
      const edited: Records = {
        category: { entity: 'AssetCategory', fields: { name: 'Computers', description: 'Edited' } },
        extra: { entity: 'AssetCategory', fields: { name: 'Extra' } }
      };
      await op({ type: 'task', id: 'edit', name: 'Edit', expectedHead: head });
      await op({
        type: 'upload',
        taskId: 'edit',
        expectedHead: head,
        commits: [await signed('edit-1', head, first.records, edited, 'Edit')]
      });
      await op({ type: 'pr', id: 'edit-pr', taskId: 'edit', title: 'Edit', description: '', target: 'shared' });
      await op({ type: 'pr_state', prId: 'edit-pr', status: 'review', expectedRevision: 0 });
      const candidate = await op({ type: 'candidate', prId: 'edit-pr', expectedRevision: 1, resolutions: [] });
      const merged = await op({
        type: 'merge',
        prId: 'edit-pr',
        candidateId: candidate['candidateId'],
        expectedSource: 'edit-1',
        expectedTarget: head
      });
      expect(await rows()).toEqual(edited);
      expect(await repository.readRecords(admin, seed.teamId, seed.appId)).toEqual({
        head: merged['head'],
        records: edited
      });
      expect((await pool.query('SELECT head FROM public.admin_shared WHERE team_id = $1', [seed.teamId])).rows).toEqual(
        [{ head: merged['head'] }]
      );
      const stored = await pool.query<{ operation: string; patch: unknown; inverse_patch: unknown }>(
        `SELECT operation, patch, inverse_patch FROM admin_private.commit_changes
         WHERE team_id = $1 AND app_id = $2 AND commit_id = $3 ORDER BY seq`,
        [seed.teamId, seed.appId, merged['head']]
      );
      expect(stored.rows).toEqual([
        { operation: 'update', patch: { description: 'Edited' }, inverse_patch: {} },
        { operation: 'insert', patch: { name: 'Extra' }, inverse_patch: null }
      ]);
      expect((await repository.readCommit(admin, seed.teamId, seed.appId, head)).records).toEqual(first.records);
      // 逐记录变更日志投影照旧：每次合并改动到的记录各一行，带合并前后的整行
      const log = await pool.query<{ merge_id: string; record_id: string; before_data: unknown; after_data: unknown }>(
        `SELECT merge_id, record_id, before_data, after_data FROM public.admin_changes
         WHERE team_id = $1 AND app_id = $2 ORDER BY merge_id, record_id`,
        [seed.teamId, seed.appId]
      );
      expect(log.rows.filter(row => row.merge_id === merged['head'])).toEqual([
        {
          merge_id: merged['head'],
          record_id: 'category',
          before_data: first.records['category'],
          after_data: edited['category']
        },
        { merge_id: merged['head'], record_id: 'extra', before_data: null, after_data: edited['extra'] }
      ]);
      expect(log.rows.filter(row => row.merge_id === head)).toEqual([
        { merge_id: head, record_id: 'category', before_data: null, after_data: first.records['category'] }
      ]);
    } finally {
      await removeWorkspace(seed);
    }
  });
  it('rejects a commit whose fingerprint does not match its content, whatever else is valid', async () => {
    const seed = { ...input, teamId: randomUUID(), appId: 'fingerprint', bootstrapKey: randomUUID() };
    await repository.initialize(seed);
    try {
      const op = (data: Record<string, unknown>) => repository.operation(admin, seed.teamId, seed.appId, command(data));
      await op({ type: 'task', id: 'task', name: 'Task', expectedHead: null });
      const honest = await signed('c1', null, {}, { a: { entity: 'AssetCategory', fields: { name: 'A' } } });
      await expect(
        op({ type: 'upload', taskId: 'task', expectedHead: null, commits: [{ ...honest, message: 'Tampered' }] })
      ).rejects.toMatchObject({ code: 'invalid', message: '提交指纹与内容不一致' });
      expect(
        (await pool.query('SELECT count(*)::int AS count FROM admin_private.commits WHERE team_id = $1', [seed.teamId]))
          .rows[0].count
      ).toBe(0);
      await op({ type: 'upload', taskId: 'task', expectedHead: null, commits: [honest] });
      const stored = await pool.query<{ fingerprint: string }>(
        'SELECT fingerprint FROM admin_private.commits WHERE team_id = $1',
        [seed.teamId]
      );
      expect(stored.rows).toEqual([{ fingerprint: await commitFingerprint(honest) }]);
    } finally {
      await removeWorkspace(seed);
    }
  });
  it('uploads one more commit onto a 500-commit chain with the same statements as onto a 3-commit chain, none of them walking the chain', async () => {
    const statements: string[] = [];
    const counted = {
      connect: async () => {
        const client = await pool.connect();
        return new Proxy(client, {
          get(target, property) {
            if (property === 'query')
              return (...args: unknown[]) => {
                statements.push(typeof args[0] === 'string' ? args[0] : '');
                return (target.query as (...values: unknown[]) => unknown)(...args);
              };
            const value: unknown = Reflect.get(target, property);
            return typeof value === 'function' ? (value as (...values: unknown[]) => unknown).bind(target) : value;
          }
        });
      },
      query: pool.query.bind(pool)
    } as unknown as pg.Pool;
    const counting = new CollaborationRepository(counted);
    const measure = async (length: number) => {
      const seed = { ...input, teamId: randomUUID(), appId: `chain-${length}`, bootstrapKey: randomUUID() };
      await repository.initialize(seed);
      try {
        const op = (data: Record<string, unknown>) =>
          repository.operation(admin, seed.teamId, seed.appId, command(data));
        await op({ type: 'task', id: 'task', name: 'Task', expectedHead: null });
        let parent: string | null = null;
        let head: string | null = null;
        let content: Records = {};
        const next = async (index: number) => {
          const after: Records = {
            ...content,
            [`r${index}`]: { entity: 'AssetCategory', fields: { name: `R${index}` } }
          };
          const commit = await sealCommit({
            id: uuidv7(),
            parent,
            authorId: admin.id,
            message: `c${index}`,
            changes: diffRecords(content, after)
          });
          parent = commit.id;
          content = after;
          return commit;
        };
        for (let offset = 0; offset < length; offset += 100) {
          const batch: Commit[] = [];
          for (let index = offset; index < Math.min(length, offset + 100); index++) batch.push(await next(index));
          await op({ type: 'upload', taskId: 'task', expectedHead: head, commits: batch });
          head = parent;
        }
        const last = await next(length);
        statements.length = 0;
        await counting.operation(
          admin,
          seed.teamId,
          seed.appId,
          command({ type: 'upload', taskId: 'task', expectedHead: head, commits: [last] })
        );
        return statements.map(sql => sql.replace(/\s+/g, ' ').trim());
      } finally {
        await removeWorkspace(seed);
      }
    };
    const short = await measure(3);
    const long = await measure(500);
    expect(long).toEqual(short);
    expect(long.filter(sql => /RECURSIVE/i.test(sql))).toEqual([]);
    expect(long.filter(sql => /admin_private\.commits\b/.test(sql))).toHaveLength(2);
  }, 60000);
  it('keeps the workspace row free of commit content: uploading a thousand changed records adds only an audit event and a receipt', async () => {
    const seed = { ...input, teamId: randomUUID(), appId: 'row-size', bootstrapKey: randomUUID() };
    await repository.initialize(seed);
    try {
      const op = (data: Record<string, unknown>) => repository.operation(admin, seed.teamId, seed.appId, command(data));
      const bytes = async () =>
        Number(
          (
            await pool.query(
              'SELECT octet_length(state::text) AS bytes FROM admin_private.workspaces WHERE team_id = $1',
              [seed.teamId]
            )
          ).rows[0].bytes
        );
      await op({ type: 'task', id: 'task', name: 'Task', expectedHead: null });
      const before = await bytes();
      const rows: Records = Object.fromEntries(
        Array.from({ length: 1000 }, (_, index) => [
          `r${index}`,
          { entity: 'AssetCategory' as const, fields: { name: `Record ${index}`, description: 'x'.repeat(200) } }
        ])
      );
      await op({ type: 'upload', taskId: 'task', expectedHead: null, commits: [await signed('big', null, {}, rows)] });
      expect(JSON.stringify(rows).length).toBeGreaterThan(250_000);
      expect((await bytes()) - before).toBeLessThan(2000);
      const row = (await pool.query('SELECT state FROM admin_private.workspaces WHERE team_id = $1', [seed.teamId]))
        .rows[0].state;
      expect(row).not.toHaveProperty('commits');
      expect(row).not.toHaveProperty('records');
      expect((await repository.readCommit(admin, seed.teamId, seed.appId, 'big')).records).toEqual(rows);
    } finally {
      await removeWorkspace(seed);
    }
  });
  it('validates presence records and discussion anchors against the materialized data', async () => {
    const { seed, candidateId, head } = await mergedWorkspace('anchors');
    try {
      const op = (data: Record<string, unknown>) => repository.operation(admin, seed.teamId, seed.appId, command(data));
      const presence = (recordId: string | null, prId: string | null) =>
        op({ type: 'presence', sessionId: 'session', prId, recordId, leave: false });
      await presence('category', null);
      await expect(presence('ghost', null)).rejects.toMatchObject({ code: 'not_found' });
      await op({ type: 'task', id: 'next', name: 'Next', expectedHead: head });
      const content = await repository.readCommit(admin, seed.teamId, seed.appId, head);
      const added: Records = { ...content.records, fresh: { entity: 'AssetCategory', fields: { name: 'Fresh' } } };
      await op({
        type: 'upload',
        taskId: 'next',
        expectedHead: head,
        commits: [await signed('next-1', head, content.records, added)]
      });
      await op({ type: 'pr', id: 'next-pr', taskId: 'next', title: 'Next', description: '', target: 'shared' });
      await expect(presence('fresh', null)).rejects.toMatchObject({ code: 'not_found' });
      await presence('fresh', 'next-pr');
      await op({ type: 'pr_state', prId: 'next-pr', status: 'review', expectedRevision: 0 });
      const made = await op({ type: 'candidate', prId: 'next-pr', expectedRevision: 1, resolutions: [] });
      const thread = (id: string, recordId: string, field: string | null) =>
        op({
          type: 'thread',
          id,
          prId: 'next-pr',
          candidateId: made['candidateId'],
          recordId,
          field,
          body: 'Look',
          required: false,
          mentions: []
        });
      await thread('on-new', 'fresh', 'name');
      await thread('on-old', 'category', null);
      await expect(thread('no-field', 'fresh', 'description')).rejects.toMatchObject({ code: 'not_found' });
      await expect(thread('no-record', 'ghost', null)).rejects.toMatchObject({ code: 'not_found' });
      expect(candidateId).not.toBe(made['candidateId']);
    } finally {
      await removeWorkspace(seed);
    }
  });
  /** 经 PostgreSQL 仓储回放随机历史的驱动：与内存用例同一套场景与全量快照对照。 */
  function repositoryDriver(seed: { teamId: string; appId: string }): HistoryDriver {
    return {
      run: command_ => repository.operation(historyAdmin, seed.teamId, seed.appId, command(command_)),
      summary: () => repository.read(historyAdmin, seed.teamId, seed.appId),
      records: () => repository.readRecords(historyAdmin, seed.teamId, seed.appId),
      commit: id => repository.readCommit(historyAdmin, seed.teamId, seed.appId, id),
      candidate: id => repository.readCandidate(historyAdmin, seed.teamId, seed.appId, id)
    };
  }
  it.each([3, 11, 27])(
    'replays random multi-task histories through PostgreSQL and matches the full-snapshot algorithm (seed %i)',
    async seed_ => {
      const seed = {
        ...input,
        teamId: randomUUID(),
        appId: `history-${seed_}`,
        bootstrapKey: randomUUID(),
        admin: historyAdmin
      };
      await repository.initialize(seed);
      try {
        const stats = await replayHistory(seed_, repositoryDriver(seed), 6);
        expect(stats.commits).toBeGreaterThan(5);
        const rows = await pool.query<{ record_id: string }>(
          'SELECT record_id FROM public.shared_records WHERE team_id = $1',
          [seed.teamId]
        );
        expect(rows.rowCount).toBe(
          Object.keys((await repository.readRecords(historyAdmin, seed.teamId, seed.appId)).records).length
        );
      } finally {
        await removeWorkspace(seed);
      }
    },
    60000
  );
});
