import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Command, Identity } from '../model.js';
import { CollaborationRepository } from './repository.js';
const run = promisify(execFile);
const container = `admin-collaboration-${randomUUID()}`;
const admin: Identity = { id: randomUUID(), email: 'admin@example.test', verified: true };
let pool: pg.Pool;
let repository: CollaborationRepository;
let started = false;
const input = { teamId: randomUUID(), appId: 'assets', name: 'Isolation test', bootstrapKey: randomUUID(), admin };
const command = (data: Record<string, unknown>) => ({ operationId: randomUUID(), ...data }) as Command;
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
    await pool.query(
      await readFile(new URL('../../../../supabase/migrations/202611160001_collaboration.sql', import.meta.url), 'utf8')
    );
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
      for (const table of [
        'public.admin_presence',
        'public.admin_changes',
        'public.admin_audit',
        'public.admin_workspace_versions',
        'public.admin_shared',
        'admin_private.memberships',
        'admin_private.workspaces'
      ]) {
        await pool.query(`DELETE FROM ${table} WHERE team_id = $1 AND app_id = $2`, [seed.teamId, seed.appId]);
      }
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
      await expect(client.query("UPDATE public.admin_shared SET records = '{}'::jsonb")).rejects.toThrow(
        /permission denied/
      );
      await expect(client.query('DELETE FROM public.admin_audit')).rejects.toThrow(/permission denied/);
      // ADMIN-US-203 验收 5：绕过 PR 直接插入共享数据、共享头、合并审计、变更日志、版本和在线状态同样被拒。
      // 用不带 ON CONFLICT 的纯 INSERT：只要 INSERT 授权被放开，错误就不再是 permission denied（RLS 拒绝或主键冲突），用例随即变红。
      const own = [input.teamId, input.appId];
      const forgedInserts: [table: string, sql: string, params: string[]][] = [
        [
          'admin_shared',
          `INSERT INTO public.admin_shared(team_id, app_id, head, records) VALUES ($1, $2, 'forged', '{}'::jsonb)`,
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
      await expect(client.query('SELECT * FROM admin_private.workspaces')).rejects.toThrow(/permission denied/);
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [randomUUID()]);
      expect((await client.query('SELECT * FROM public.admin_shared')).rows).toHaveLength(0);
      expect((await client.query('SELECT * FROM public.admin_workspace_versions')).rows).toHaveLength(0);
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  });
  it('serializes concurrent upload heads and preserves the losing branch locally for recovery', async () => {
    await repository.operation(
      admin,
      input.teamId,
      input.appId,
      command({ type: 'task', id: 'concurrent', name: 'Concurrent', expectedHead: null })
    );
    const upload = (id: string) =>
      command({
        type: 'upload',
        taskId: 'concurrent',
        expectedHead: null,
        commits: [
          {
            id,
            parent: null,
            authorId: admin.id,
            message: id,
            records: { category: { entity: 'AssetCategory', fields: { name: id } } }
          }
        ]
      });
    const commands = [upload('first'), upload('second')];
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
  it('rolls back shared records, head, PR, receipt and audit when projection fails mid-transaction', async () => {
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
    expect((await pool.query('SELECT head, records FROM public.admin_shared')).rows).toEqual([
      { head: null, records: {} }
    ]);
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
    expect(state.records).toEqual({});
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
            {
              id: `commit-${suffix}`,
              parent: null,
              authorId: admin.id,
              message: suffix,
              records: { category: { entity: 'AssetCategory', fields: { name: suffix } } }
            }
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
          commits: [{ id: 'updated', parent: 'commit-main', authorId: admin.id, message: 'Update', records: {} }]
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
});
