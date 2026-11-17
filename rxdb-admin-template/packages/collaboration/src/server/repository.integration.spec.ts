import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { diffRecords } from '../changes.js';
import { commitFingerprint, sealCommit, uuidv7 } from '../commit.js';
import { receiptRetentionMs, type Command, type Commit, type Identity, type Records } from '../model.js';
import { planningNamespaces, planningSchema } from '../planning.testing.js';
import { assetSchema, diffAssets } from '../schema.testing.js';
import { historyAdmin, replayHistory, type HistoryDriver } from './history.testing.js';
import { applyMigrations, readMigrations } from './migrate.js';
import { advance, emptyState, PgWorkspaceWriter, receiptSweepLimit } from './pg-workspace.js';
import { noEffects } from './plan.js';
import { pgReads } from './reads.testing.js';
import { installRealtime } from './realtime.testing.js';
import { CollaborationRepository } from './repository.js';
import { stateChanges } from './state-changes.js';
const run = promisify(execFile);
const container = `admin-collaboration-${randomUUID()}`;
const admin: Identity = { id: randomUUID(), email: 'admin@example.test', verified: true };
let pool: pg.Pool;
let repository: CollaborationRepository;
/** 读取经浏览器同一条路径：public 下的只读投影与读取函数，以 authenticated 角色加 JWT 声明读取（见 reads.testing.ts）。 */
let projected: ReturnType<typeof pgReads>;
let started = false;
const input = {
  teamId: randomUUID(),
  appId: 'assets',
  name: 'Isolation test',
  bootstrapKey: randomUUID(),
  admin,
  schema: assetSchema
};
/** admin_private 下的全部表：普通登录用户一律不能读写。 */
const privateTables = [
  'workspaces',
  'memberships',
  'policies',
  'tasks',
  'refs',
  'prs',
  'candidates',
  'reviews',
  'threads',
  'comments',
  'notifications',
  'invitations',
  'operations',
  'commits',
  'commit_changes',
  'schemas',
  'record_keys'
];
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
  sealCommit({ id, parent, authorId: admin.id, message, changes: diffAssets(before, after) });
/** 工作区的全部表，按外键依赖从叶到根排列：删除时依次清空。 */
const workspaceTables = [
  'public.admin_changes',
  'public.admin_audit',
  'public.admin_workspace_versions',
  'public.admin_shared',
  'admin_private.record_keys',
  'public.shared_records',
  'admin_private.comments',
  'admin_private.notifications',
  'admin_private.threads',
  'admin_private.reviews',
  'admin_private.candidates',
  'admin_private.prs',
  'admin_private.refs',
  'admin_private.tasks',
  'admin_private.commit_changes',
  'admin_private.commits',
  'admin_private.invitations',
  'admin_private.operations',
  'admin_private.policies',
  'admin_private.schemas',
  'admin_private.memberships',
  'admin_private.workspaces'
];
/** 删除测试自建的工作区及其全部行，避免影响按行数断言的 RLS 用例。 */
async function removeWorkspace(workspace: { teamId: string; appId: string }) {
  for (const table of workspaceTables) {
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
    const connection = { host: '127.0.0.1', port, password, database: 'postgres', connectionTimeoutMillis: 2000 };
    pool = new pg.Pool({ ...connection, user: 'postgres', max: 5 });
    await vi.waitFor(
      async () => {
        await pool.query('SELECT 1');
      },
      { timeout: 45000, interval: 500 }
    );
    // Realtime 的消息表与 realtime.send()：迁移在它上面建频道策略，命令事务经它广播（见 realtime.testing.ts）
    const superuser = new pg.Client({ ...connection, user: 'supabase_admin' });
    await superuser.connect();
    try {
      await installRealtime(superuser);
    } finally {
      await superuser.end();
    }
    await applyMigrations(pool);
    repository = new CollaborationRepository(pool);
    projected = pgReads(pool);
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
      // ADMIN-US-203 验收 5：绕过 PR 直接插入共享数据、共享头、合并审计、变更日志与版本同样被拒（在线状态已不写库）。
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
        ]
      ];
      for (const [table, sql, params] of forgedInserts)
        await expect(client.query(sql, params), `INSERT INTO ${table}`).rejects.toThrow(/permission denied/);
      for (const table of privateTables)
        await expect(client.query(`SELECT * FROM admin_private.${table}`), table).rejects.toThrow(/permission denied/);
      await expect(client.query('UPDATE admin_private.refs SET head = NULL'), 'refs').rejects.toThrow(
        /permission denied/
      );
      await expect(
        client.query(`INSERT INTO admin_private.operations(team_id, app_id, operation_id, actor_id, fingerprint, result, at)
          VALUES ('${input.teamId}', '${input.appId}', 'forged', '${admin.id}', 'x', '{}', 0)`),
        'operations'
      ).rejects.toThrow(/permission denied/);
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
      await expect(outcomeWithin(projected.read(admin, input.teamId, input.appId), 1000)).resolves.toBe('resolved');
      await expect(
        outcomeWithin(projected.receipt(admin, input.teamId, input.appId, randomUUID()), 1000)
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
          changes: diffAssets({}, { category: { entity: 'AssetCategory', fields: { name: 'Computers' } } })
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
      const summary = await projected.read(admin, seed.teamId, seed.appId);
      expect(summary).not.toHaveProperty('records');
      expect(summary.head).toBe(head);
      expect(summary.auditCount).toBe(summary.audit.length);
      // 提交元数据不在摘要里，按分支分页读取：共享分支只有合并提交，任务分支是上传的提交
      expect(summary).not.toHaveProperty('commits');
      expect(summary.candidates[candidateId]).not.toHaveProperty('records');
      const shared = await projected.readHistory(admin, seed.teamId, seed.appId, { branch: 'shared' });
      expect(shared).toEqual({
        commits: [
          { id: head, parent: null, authorId: admin.id, message: 'Merge Review', mergeSource: 'commit-1', candidateId }
        ],
        nextBefore: null
      });
      for (const query of [{ taskId: 'task' }, { prId: 'pr' }])
        await expect(projected.readHistory(admin, seed.teamId, seed.appId, query)).resolves.toEqual({
          commits: [{ id: 'commit-1', parent: null, authorId: admin.id, message: 'First' }],
          nextBefore: null
        });

      const records: Records = { category: { entity: 'AssetCategory', fields: { name: 'Computers' } } };
      await expect(projected.readRecords(admin, seed.teamId, seed.appId)).resolves.toEqual({ head, records });
      await expect(projected.readCommit(admin, seed.teamId, seed.appId, 'commit-1')).resolves.toEqual({
        id: 'commit-1',
        parent: null,
        authorId: admin.id,
        message: 'First',
        changes: diffAssets({}, records),
        records
      });
      await expect(projected.readCommit(admin, seed.teamId, seed.appId, head)).resolves.toMatchObject({ records });
      await expect(projected.readCandidate(admin, seed.teamId, seed.appId, candidateId)).resolves.toMatchObject({
        id: candidateId,
        source: 'commit-1',
        records
      });
      const newest = await projected.readAudit(admin, seed.teamId, seed.appId, { limit: 2 });
      expect(newest.events.map(event => event.action)).toEqual(['merge', 'candidate']);
      expect(newest.nextBefore).toBe(newest.events[1].id);
      const rest = await projected.readAudit(admin, seed.teamId, seed.appId, { before: newest.nextBefore! });
      expect(rest.events.length + newest.events.length).toBe(summary.auditCount);
      expect(rest.nextBefore).toBeNull();
      const related = await projected.readAudit(admin, seed.teamId, seed.appId, { prId: 'pr' });
      expect(related.events.map(event => event.action)).toEqual(['merge', 'candidate', 'pr_state', 'pr']);

      await expect(projected.readCommit(admin, seed.teamId, seed.appId, 'missing')).rejects.toMatchObject({
        code: 'not_found'
      });
      await expect(projected.readCandidate(admin, seed.teamId, seed.appId, 'commit-1')).rejects.toMatchObject({
        code: 'not_found'
      });
      const outsider = { id: randomUUID(), email: 'outsider@example.test', verified: true };
      for (const read of [
        () => projected.read(outsider, seed.teamId, seed.appId),
        () => projected.readRecords(outsider, seed.teamId, seed.appId),
        () => projected.readCommit(outsider, seed.teamId, seed.appId, 'commit-1'),
        () => projected.readCandidate(outsider, seed.teamId, seed.appId, candidateId),
        () => projected.readHistory(outsider, seed.teamId, seed.appId, { branch: 'shared' })
      ])
        await expect(read()).rejects.toMatchObject({ code: 'forbidden' });
      // 审计是带 RLS 的公开表：非成员读到的是空页，不是错误（跨团队、跨应用读取返回空）
      await expect(projected.readAudit(outsider, seed.teamId, seed.appId, {})).resolves.toEqual({
        events: [],
        nextBefore: null
      });
      await expect(projected.readAudit(admin, seed.teamId, seed.appId, {})).resolves.toMatchObject({
        events: expect.arrayContaining([expect.objectContaining({ action: 'merge' })])
      });
      await expect(projected.readCommit(admin, randomUUID(), 'other', 'commit-1')).rejects.toMatchObject({
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
        records: () => projected.readRecords(admin, seed.teamId, seed.appId),
        commit: () => projected.readCommit(admin, seed.teamId, seed.appId, 'commit-1'),
        candidate: () => projected.readCandidate(admin, seed.teamId, seed.appId, candidateId),
        history: () => projected.readHistory(admin, seed.teamId, seed.appId, { branch: 'shared' }),
        audit: () => projected.readAudit(admin, seed.teamId, seed.appId, { limit: 2 })
      };
      for (const [name, read] of Object.entries(reads))
        await expect(outcomeWithin(read(), 1000), name).resolves.toBe('resolved');
    } finally {
      await writer.query('ROLLBACK');
      writer.release();
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
    const history = await projected.readHistory(admin, input.teamId, input.appId, { taskId: 'concurrent' });
    expect(history.commits).toHaveLength(1);
    // 负者得到明确的冲突错误（与客户端已有的「任务已分叉」处理一致），并带上胜者推进后的远端头
    const loser = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(loser.reason).toMatchObject({ code: 'diverged', details: { remoteHead: history.commits[0].id } });
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
    const before = await projected.read(admin, input.teamId, input.appId);
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
    const after = await projected.read(admin, input.teamId, input.appId);
    expect(after).toEqual(before);
    expect((await pool.query('SELECT head FROM public.admin_shared')).rows).toEqual([{ head: null }]);
    expect((await pool.query('SELECT count(*)::int AS count FROM public.shared_records')).rows[0].count).toBe(0);
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM admin_private.commits WHERE merge_source IS NOT NULL'))
        .rows[0].count
    ).toBe(0);
    await expect(projected.receipt(admin, input.teamId, input.appId, merge.operationId)).resolves.toEqual({
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
        'admin_private.policies',
        'admin_private.refs',
        'public.admin_shared',
        'public.admin_audit',
        'public.admin_workspace_versions'
      ])
        expect((await pool.query(`SELECT * FROM ${table} WHERE team_id = $1`, [seed.teamId])).rows).toEqual([]);
    } finally {
      await pool.query('DROP TRIGGER fail_bootstrap ON public.admin_audit');
    }
    await repository.initialize(seed);
    const state = await projected.read(admin, seed.teamId, seed.appId);
    expect(state.head).toBeNull();
    await expect(projected.readRecords(admin, seed.teamId, seed.appId)).resolves.toEqual({ head: null, records: {} });
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
      const state = await projected.read(admin, seed.teamId, seed.appId);
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
      const state = await projected.read(admin, seed.teamId, seed.appId);
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
           ('admin_private','commit_changes'),('admin_private','policies'),('admin_private','tasks'),('admin_private','refs'),
           ('admin_private','prs'),('admin_private','candidates'),('admin_private','reviews'),('admin_private','threads'),
           ('admin_private','comments'),('admin_private','notifications'),('admin_private','invitations'),
           ('admin_private','operations'),('admin_private','schemas'),('admin_private','record_keys'),
           ('public','admin_shared'),('public','shared_records'),('public','admin_audit'),
           ('public','admin_changes'),('public','admin_workspace_versions'),('public','admin_workspaces'),
           ('public','admin_members'),('public','admin_invitations'),('public','admin_tasks'),('public','admin_prs'),
           ('public','admin_candidates'),('public','admin_reviews'),('public','admin_threads'),('public','admin_comments'),
           ('public','admin_notifications'),('public','admin_receipts'),('public','admin_commits'),('public','admin_schemas'),
           ('realtime','messages')
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
      expect.arrayContaining([
        '202611160001_collaboration.sql',
        '202611170001_commit_store.sql',
        '202611170002_workspace_tables.sql',
        '202611170003_schema_manifests.sql',
        '202611170004_supabase_native.sql'
      ])
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
    // 治理行只剩治理字段，整行状态列已删除；成员表按用户有索引，审计按写入顺序、PR 与线程有索引
    expect(
      before
        .filter(row => row.kind === 'column' && row.name.startsWith('admin_private.workspaces.'))
        .map(row => row.name)
    ).toEqual(
      ['app_id', 'bootstrap_key', 'initial_admin_id', 'name', 'policy_version', 'schema_version', 'team_id'].map(
        column => `admin_private.workspaces.${column}`
      )
    );
    for (const index of [
      'admin_private.memberships_user',
      'admin_private.prs_task',
      'admin_private.reviews_pr',
      'admin_private.threads_pr',
      'admin_private.comments_thread',
      'admin_private.notifications_user',
      'admin_private.operations_age',
      'public.admin_audit_order',
      'public.admin_audit_pr',
      'public.admin_audit_thread',
      'admin_private.record_keys_value'
    ])
      expect(before, index).toContainEqual(expect.objectContaining({ kind: 'index', name: index }));
    for (const table of privateTables)
      expect(before, table).toContainEqual({ kind: 'rls', name: `admin_private.${table}`, detail: 'true' });
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
      for (const table of privateTables)
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
          await pool.query<Record<string, unknown>>(
            'SELECT * FROM admin_private.workspaces WHERE team_id = $1 AND app_id = $2',
            [seed.teamId, seed.appId]
          )
        ).rows[0];
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
      const read = await projected.readRecords(admin, seed.teamId, seed.appId);
      expect(read).toEqual({ head, records: await rows() });
      expect((await pool.query('SELECT head FROM public.admin_shared WHERE team_id = $1', [seed.teamId])).rows).toEqual(
        [{ head }]
      );
      // 共享头在引用表里，治理行只剩治理字段，不含状态、提交与记录
      expect(
        (await pool.query("SELECT head FROM admin_private.refs WHERE team_id = $1 AND ref = 'shared'", [seed.teamId]))
          .rows
      ).toEqual([{ head }]);
      expect(Object.keys(await row()).sort()).toEqual([
        'app_id',
        'bootstrap_key',
        'initial_admin_id',
        'name',
        'policy_version',
        'schema_version',
        'team_id'
      ]);

      // 第二次合并只改动一部分记录：共享行随之更新、新增与删除，没有改动的行保持不变
      const first = await projected.readCommit(admin, seed.teamId, seed.appId, head);
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
      expect(await projected.readRecords(admin, seed.teamId, seed.appId)).toEqual({
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
      expect((await projected.readCommit(admin, seed.teamId, seed.appId, head)).records).toEqual(first.records);
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
  it('uploads one more commit onto a 500-commit chain with the same statements as onto a 3-commit chain; only the task path is walked', async () => {
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
            changes: diffAssets(content, after)
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
    // 不再沿祖先链做环检测；为核对父内容只沿任务自己在共同起点之后的提交走一次，读它们对被改动记录的变更
    expect(long.filter(sql => /RECURSIVE/i.test(sql))).toHaveLength(1);
    expect(long.filter(sql => /admin_private\.commit_changes\b/.test(sql) && /entity_id = ANY/.test(sql))).toHaveLength(
      1
    );
    expect(long.filter(sql => /admin_private\.commits\b/.test(sql))).toHaveLength(3);
  }, 60000);
  it('keeps the workspace rows free of commit content: uploading a thousand changed records adds only a small audit event and receipt', async () => {
    const seed = { ...input, teamId: randomUUID(), appId: 'row-size', bootstrapKey: randomUUID() };
    await repository.initialize(seed);
    try {
      const op = (data: Record<string, unknown>) => repository.operation(admin, seed.teamId, seed.appId, command(data));
      /** 治理行、任务引用、本次的审计事件与回执的落盘字节数。 */
      const bytes = async (operationId?: string) =>
        Number(
          (
            await pool.query(
              `SELECT (SELECT pg_column_size(w.*) FROM admin_private.workspaces w WHERE team_id = $1)
                 + (SELECT pg_column_size(r.*) FROM admin_private.refs r WHERE team_id = $1 AND ref = 'tasks/task')
                 + coalesce((SELECT pg_column_size(o.*) FROM admin_private.operations o WHERE team_id = $1 AND operation_id = $2), 0)
                 + coalesce((SELECT pg_column_size(a.*) FROM public.admin_audit a
                     WHERE team_id = $1 AND details->>'operationId' = $2), 0) AS bytes`,
              [seed.teamId, operationId ?? '']
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
      const upload = command({
        type: 'upload',
        taskId: 'task',
        expectedHead: null,
        commits: [await signed('big', null, {}, rows)]
      });
      await repository.operation(admin, seed.teamId, seed.appId, upload);
      expect(JSON.stringify(rows).length).toBeGreaterThan(250_000);
      expect((await bytes(upload.operationId)) - before).toBeLessThan(2000);
      expect((await projected.readCommit(admin, seed.teamId, seed.appId, 'big')).records).toEqual(rows);
    } finally {
      await removeWorkspace(seed);
    }
  });
  it('validates discussion anchors against the materialized data', async () => {
    const { seed, candidateId, head } = await mergedWorkspace('anchors');
    try {
      const op = (data: Record<string, unknown>) => repository.operation(admin, seed.teamId, seed.appId, command(data));
      await op({ type: 'task', id: 'next', name: 'Next', expectedHead: head });
      const content = await projected.readCommit(admin, seed.teamId, seed.appId, head);
      const added: Records = { ...content.records, fresh: { entity: 'AssetCategory', fields: { name: 'Fresh' } } };
      await op({
        type: 'upload',
        taskId: 'next',
        expectedHead: head,
        commits: [await signed('next-1', head, content.records, added)]
      });
      await op({ type: 'pr', id: 'next-pr', taskId: 'next', title: 'Next', description: '', target: 'shared' });
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
      summary: () => projected.read(historyAdmin, seed.teamId, seed.appId),
      records: () => projected.readRecords(historyAdmin, seed.teamId, seed.appId),
      commit: id => projected.readCommit(historyAdmin, seed.teamId, seed.appId, id),
      candidate: id => projected.readCandidate(historyAdmin, seed.teamId, seed.appId, id),
      history: query => projected.readHistory(historyAdmin, seed.teamId, seed.appId, query)
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
          Object.keys((await projected.readRecords(historyAdmin, seed.teamId, seed.appId)).records).length
        );
      } finally {
        await removeWorkspace(seed);
      }
    },
    60000
  );
  /**
   * 挂起点：在 admin_audit 插入满足 `condition` 的事件时，让写入它的事务等在一把咨询锁上，直到测试释放。
   * 审计写在命令事务的末尾（业务行与引用已写、版本行未动），所以一条真实命令会停在事务中途、持有它已取得的全部行锁。
   */
  async function suspend(name: string, condition: string) {
    const key = Math.floor(Math.random() * 2 ** 31);
    const holder = await pool.connect();
    await holder.query('SELECT pg_advisory_lock($1)', [key]);
    await pool.query(
      `CREATE FUNCTION admin_private.${name}() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN PERFORM pg_advisory_xact_lock(${key}); RETURN NEW; END $$`
    );
    await pool.query(
      `CREATE TRIGGER ${name} BEFORE INSERT ON public.admin_audit FOR EACH ROW WHEN (${condition})
       EXECUTE FUNCTION admin_private.${name}()`
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
        await pool.query(`DROP TRIGGER IF EXISTS ${name} ON public.admin_audit`);
        await pool.query(`DROP FUNCTION IF EXISTS admin_private.${name}()`);
      }
    };
  }
  /** 一个只有初始管理员的新工作区，带便捷的命令入口。 */
  async function freshWorkspace(appId: string) {
    const seed = { ...input, teamId: randomUUID(), appId, bootstrapKey: randomUUID() };
    await repository.initialize(seed);
    const op = (data: Record<string, unknown>, actor: Identity = admin) =>
      repository.operation(actor, seed.teamId, seed.appId, command(data));
    return { seed, op };
  }
  /** 一个新任务：建任务并上传一个新增一条分类的提交，返回任务头。 */
  async function seededTask(op: (data: Record<string, unknown>) => Promise<Record<string, unknown>>, id: string) {
    await op({ type: 'task', id, name: id, expectedHead: null });
    const commit = await signed(`${id}-1`, null, {}, { [id]: { entity: 'AssetCategory', fields: { name: id } } });
    await op({ type: 'upload', taskId: id, expectedHead: null, commits: [commit] });
    return commit.id;
  }
  const comment = (prId: string, body: string) => ({
    type: 'thread',
    id: randomUUID(),
    prId,
    candidateId: null,
    recordId: null,
    field: null,
    body,
    required: false,
    mentions: []
  });

  it('runs uploads to different tasks and comments on different PRs in parallel, and serializes comments on the same PR', async () => {
    const { seed, op } = await freshWorkspace('parallel');
    const uploads = await suspend(
      'pause_upload',
      `NEW.action = 'upload' AND NEW.details->'details'->>'taskId' = 'slow'`
    );
    try {
      for (const id of ['slow', 'fast']) await op({ type: 'task', id, name: id, expectedHead: null });
      const upload = async (taskId: string) =>
        op({
          type: 'upload',
          taskId,
          expectedHead: null,
          commits: [
            await signed(`${taskId}-1`, null, {}, { [taskId]: { entity: 'AssetCategory', fields: { name: taskId } } })
          ]
        });
      const slow = upload('slow');
      // 上传 slow 停在事务中途，已持有治理行共享锁与 slow 的任务引用排他锁
      await expect(outcomeWithin(slow, 300)).resolves.toBe('pending');
      // 另一个任务的上传不排在它后面：只共享治理行，各锁各的任务引用
      await expect(outcomeWithin(upload('fast'), 3000)).resolves.toBe('resolved');
      await expect(outcomeWithin(slow, 100)).resolves.toBe('pending');
      await uploads.release();
      await expect(slow).resolves.toMatchObject({ taskId: 'slow', head: 'slow-1' });
    } finally {
      await uploads.drop();
    }
    for (const id of ['slow', 'fast'])
      await op({ type: 'pr', id: `pr-${id}`, taskId: id, title: id, description: '', target: 'shared' });
    const comments = await suspend(
      'pause_comment',
      `NEW.action = 'thread' AND NEW.details->'details'->>'body' = 'slow'`
    );
    try {
      const slow = op(comment('pr-slow', 'slow'));
      await expect(outcomeWithin(slow, 300)).resolves.toBe('pending');
      // 别的 PR 上的评论立即完成；同一个 PR 上的评论排在 PR 行锁后面
      await expect(outcomeWithin(op(comment('pr-fast', 'fast')), 3000)).resolves.toBe('resolved');
      const same = op(comment('pr-slow', 'same PR'));
      await expect(outcomeWithin(same, 500)).resolves.toBe('pending');
      await comments.release();
      await expect(slow).resolves.toMatchObject({ threadId: expect.any(String) });
      await expect(same).resolves.toMatchObject({ threadId: expect.any(String) });
      const summary = await projected.read(admin, seed.teamId, seed.appId);
      expect(summary.threads.map(thread => thread.comments[0].body).sort()).toEqual(['fast', 'same PR', 'slow']);
    } finally {
      await comments.drop();
      await removeWorkspace(seed);
    }
  });

  it('makes a revocation wait for an in-flight approval, and rejects approvals and comments that wait behind a revocation', async () => {
    const { seed, op } = await freshWorkspace('governance-locks');
    const reviewer = { id: randomUUID(), email: 'locks-reviewer@example.test', verified: true };
    try {
      await op({
        type: 'invite',
        id: 'invite',
        email: reviewer.email,
        permissions: ['read', 'review', 'comment'],
        tokenHash: 'token',
        expiresAt: Date.now() + 60000,
        expectedVersion: 0
      });
      await op({ type: 'accept_invite', id: 'invite', tokenHash: 'token' }, reviewer);
      const source = await seededTask(op, 'task');
      await op({ type: 'pr', id: 'pr', taskId: 'task', title: 'PR', description: '', target: 'shared' });
      await op({ type: 'pr_state', prId: 'pr', status: 'review', expectedRevision: 0 });
      const { candidateId } = await op({ type: 'candidate', prId: 'pr', expectedRevision: 1, resolutions: [] });
      const approve = (expectedRevision: number) =>
        op(
          {
            type: 'review',
            prId: 'pr',
            candidateId,
            expectedSource: source,
            stageId: 'review',
            decision: 'approve',
            reason: '',
            expectedRevision
          },
          reviewer
        );
      const grant = (permissions: string[], expectedGeneration: number) =>
        op({ type: 'member', userId: reviewer.id, permissions, active: true, expectedGeneration });

      // 1. 批准停在事务中途（持有治理行共享锁）：撤权要排他锁，必须等批准提交
      const reviews = await suspend('pause_review', `NEW.action = 'review'`);
      try {
        const approval = approve(0);
        await expect(outcomeWithin(approval, 300)).resolves.toBe('pending');
        const revoke = grant(['read'], 1);
        await expect(outcomeWithin(revoke, 500)).resolves.toBe('pending');
        await reviews.release();
        await expect(approval).resolves.toMatchObject({ reviewId: expect.any(String) });
        await expect(revoke).resolves.toMatchObject({ generation: 2 });
      } finally {
        await reviews.drop();
      }
      const audit = (await projected.read(admin, seed.teamId, seed.appId)).audit.map(event => event.action);
      expect(audit.indexOf('review')).toBeLessThan(audit.lastIndexOf('member'));
      // 撤权在批准之后提交，批准随授权代次一起失效
      await expect(
        op({ type: 'merge', prId: 'pr', candidateId, expectedSource: source, expectedTarget: null })
      ).rejects.toMatchObject({ code: 'approval' });

      // 2. 撤权停在事务中途（持有治理行排他锁）：等在它后面的批准与评论，按撤权后的成员关系裁决，一律拒绝
      await grant(['read', 'review', 'comment'], 2);
      const members = await suspend('pause_member', `NEW.action = 'member'`);
      try {
        const revoked = grant(['read'], 3);
        await expect(outcomeWithin(revoked, 300)).resolves.toBe('pending');
        const late = approve(1);
        const remark = op(comment('pr', 'after revocation'), reviewer);
        await expect(outcomeWithin(late, 300)).resolves.toBe('pending');
        await expect(outcomeWithin(remark, 100)).resolves.toBe('pending');
        await members.release();
        await expect(revoked).resolves.toMatchObject({ generation: 4 });
        await expect(late).rejects.toMatchObject({ code: 'forbidden' });
        await expect(remark).rejects.toMatchObject({ code: 'forbidden' });
      } finally {
        await members.drop();
      }
      // 撤权已提交：之后的批准、评论与合并同样被拒
      await expect(approve(1)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(op(comment('pr', 'later'), reviewer)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(
        op({ type: 'merge', prId: 'pr', candidateId, expectedSource: source, expectedTarget: null }, reviewer)
      ).rejects.toMatchObject({ code: 'forbidden' });
    } finally {
      await removeWorkspace(seed);
    }
  });

  it('advances a ref only from the expected head, and reports a clear conflict when the compare-and-swap fails', async () => {
    const { seed, op } = await freshWorkspace('ref-cas');
    try {
      const head = await seededTask(op, 'task');
      const scope: [string, string] = [seed.teamId, seed.appId];
      expect(await advance(pool, scope, 'tasks/task', { from: null, to: null })).toBe(head);
      expect(await advance(pool, scope, 'shared', { from: head, to: null })).toBeNull();
      const refs = await pool.query<{ ref: string; head: string | null; revision: string }>(
        'SELECT ref, head, revision FROM admin_private.refs WHERE team_id = $1 ORDER BY ref',
        [seed.teamId]
      );
      expect(refs.rows).toEqual([
        { ref: 'shared', head: null, revision: '0' },
        { ref: 'tasks/task', head, revision: '1' }
      ]);
      const empty = stateChanges(emptyState(seed.teamId, seed.appId), emptyState(seed.teamId, seed.appId));
      const writer = new PgWorkspaceWriter(pool, seed.teamId, seed.appId);
      await expect(
        writer.save({ ...empty, heads: { task: { from: null, to: head } } }, noEffects(), Date.now())
      ).rejects.toMatchObject({ code: 'diverged', details: { remoteHead: head } });
      await expect(
        writer.save({ ...empty, shared: { from: head, to: null } }, noEffects(), Date.now())
      ).rejects.toMatchObject({ code: 'stale', details: { current: null } });
    } finally {
      await removeWorkspace(seed);
    }
  });

  it('re-reads the PRs of a task after locking its ref, so an upload never misses a PR created while it waited', async () => {
    const { seed, op } = await freshWorkspace('upload-recheck');
    const holder = await pool.connect();
    try {
      const head = await seededTask(op, 'task');
      await holder.query('BEGIN');
      await holder.query(
        "SELECT 1 FROM admin_private.refs WHERE team_id = $1 AND app_id = $2 AND ref = 'tasks/task' FOR UPDATE",
        [seed.teamId, seed.appId]
      );
      const next = await signed(
        'task-2',
        head,
        { task: { entity: 'AssetCategory', fields: { name: 'task' } } },
        { task: { entity: 'AssetCategory', fields: { name: 'renamed' } } }
      );
      // 上传已锁定任务名下（此时为空）的 PR，正等任务引用；等待期间有人在这个任务上建了 PR 并提交
      const upload = op({ type: 'upload', taskId: 'task', expectedHead: head, commits: [next] });
      await expect(outcomeWithin(upload, 300)).resolves.toBe('pending');
      await holder.query(
        `INSERT INTO admin_private.prs(team_id, app_id, id, task_id, author_id, title, description, target, status, revision)
         VALUES ($1, $2, 'late-pr', 'task', $3, 'Late', '', 'shared', 'draft', 0)`,
        [seed.teamId, seed.appId, admin.id]
      );
      await holder.query('COMMIT');
      // 上传发现 PR 集合变了，整体重来：新 PR 同样被锁定并随上传过期，修订号前进
      await expect(upload).resolves.toMatchObject({ head: 'task-2' });
      const pr = await pool.query<{ revision: number; candidate_id: string | null }>(
        "SELECT revision, candidate_id FROM admin_private.prs WHERE team_id = $1 AND id = 'late-pr'",
        [seed.teamId]
      );
      expect(pr.rows).toEqual([{ revision: 1, candidate_id: null }]);
    } finally {
      holder.release();
      await removeWorkspace(seed);
    }
  });

  it('builds a candidate only after an in-flight merge has committed, on the merged head', async () => {
    const { seed, op } = await freshWorkspace('candidate-waits-merge');
    try {
      await op({ type: 'policy', stages: [], expectedVersion: 1 });
      const prepared: Record<string, string> = {};
      for (const id of ['first', 'second']) {
        prepared[id] = await seededTask(op, id);
        await op({ type: 'pr', id, taskId: id, title: id, description: '', target: 'shared' });
        await op({ type: 'pr_state', prId: id, status: 'review', expectedRevision: 0 });
      }
      const { candidateId } = await op({ type: 'candidate', prId: 'first', expectedRevision: 1, resolutions: [] });
      const merges = await suspend('pause_merge', `NEW.action = 'merge'`);
      try {
        // 合并停在事务中途：已锁定共享引用、写好共享记录与合并提交，尚未提交
        const merge = op({
          type: 'merge',
          prId: 'first',
          candidateId,
          expectedSource: prepared['first'],
          expectedTarget: null
        });
        await expect(outcomeWithin(merge, 300)).resolves.toBe('pending');
        // 另一个 PR 生成候选要读共享内容：对共享引用加共享锁，等合并提交，不会读到合并到一半的共享分支
        const candidate = op({ type: 'candidate', prId: 'second', expectedRevision: 1, resolutions: [] });
        await expect(outcomeWithin(candidate, 500)).resolves.toBe('pending');
        await merges.release();
        const { head } = await merge;
        const made = await candidate;
        const content = await projected.readCandidate(admin, seed.teamId, seed.appId, String(made['candidateId']));
        expect(content.target).toBe(head);
        expect(Object.keys(content.records).sort()).toEqual(['first', 'second']);
      } finally {
        await merges.drop();
      }
    } finally {
      await removeWorkspace(seed);
    }
  });

  /** 一条命令产生的 WAL 字节数。 */
  async function walOf(work: () => Promise<unknown>): Promise<number> {
    const before = (await pool.query<{ lsn: string }>('SELECT pg_current_wal_lsn() AS lsn')).rows[0].lsn;
    await work();
    const after = (await pool.query<{ lsn: string }>('SELECT pg_current_wal_lsn() AS lsn')).rows[0].lsn;
    return Number((await pool.query('SELECT pg_wal_lsn_diff($1, $2) AS bytes', [after, before])).rows[0].bytes);
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

  it('keeps the WAL of an ordinary command bounded and the touched rows the same size however long the history grows', async () => {
    const { seed, op } = await freshWorkspace('bounded-wal');
    try {
      let head = await seededTask(op, 'task');
      let content: Records = { task: { entity: 'AssetCategory', fields: { name: 'task' } } };
      await op({ type: 'pr', id: 'pr', taskId: 'task', title: 'PR', description: '', target: 'shared' });
      const sample = async () => {
        const values: number[] = [];
        for (let index = 0; index < 7; index++) values.push(await walOf(() => op(comment('pr', 'measured'))));
        return median(values);
      };
      const governance = async () =>
        Number(
          (
            await pool.query('SELECT pg_column_size(w.*) AS bytes FROM admin_private.workspaces w WHERE team_id = $1', [
              seed.teamId
            ])
          ).rows[0].bytes
        );
      const early = await sample();
      const earlyRow = await governance();
      // 历史再长 150 条命令：50 次上传与 100 条评论
      for (let index = 0; index < 50; index++) {
        const next: Records = { ...content, [`r${index}`]: { entity: 'AssetCategory', fields: { name: `R${index}` } } };
        const commit = await signed(uuidv7(), head, content, next);
        await op({ type: 'upload', taskId: 'task', expectedHead: head, commits: [commit] });
        head = commit.id;
        content = next;
      }
      for (let index = 0; index < 100; index++) await op(comment('pr', `filler ${index}`));
      const late = await sample();
      expect(late).toBeLessThan(50_000);
      expect(late - early).toBeLessThan(3_000);
      expect(await governance()).toBe(earlyRow);
      const pr = await pool.query(
        "SELECT pg_column_size(p.*) AS bytes FROM admin_private.prs p WHERE team_id = $1 AND id = 'pr'",
        [seed.teamId]
      );
      expect(Number(pr.rows[0].bytes)).toBeLessThan(1_000);
    } finally {
      await removeWorkspace(seed);
    }
  }, 60000);

  it('replays a receipt within the retention period, treats an expired one as a new request without duplicating commits, and sweeps expired receipts in bounded batches', async () => {
    const { seed, op } = await freshWorkspace('retention');
    const age = (where: string, params: unknown[] = []) =>
      pool.query(`UPDATE admin_private.operations SET at = at - $2 WHERE team_id = $1 AND ${where}`, [
        seed.teamId,
        receiptRetentionMs + 60_000,
        ...params
      ]);
    const count = async (sql: string) => Number((await pool.query(sql, [seed.teamId])).rows[0].count);
    try {
      await op({ type: 'task', id: 'task', name: 'Task', expectedHead: null });
      const upload = command({
        type: 'upload',
        taskId: 'task',
        expectedHead: null,
        commits: [await signed('c1', null, {}, { a: { entity: 'AssetCategory', fields: { name: 'A' } } })]
      });
      const first = await repository.operation(admin, seed.teamId, seed.appId, upload);
      const audited = await count('SELECT count(*) FROM public.admin_audit WHERE team_id = $1');
      // 保留期内：同一操作 ID 原样返回原结果，不再写任何行
      await expect(repository.operation(admin, seed.teamId, seed.appId, upload)).resolves.toEqual(first);
      await expect(projected.receipt(admin, seed.teamId, seed.appId, upload.operationId)).resolves.toEqual({
        status: 'accepted',
        value: first
      });
      expect(await count('SELECT count(*) FROM public.admin_audit WHERE team_id = $1')).toBe(audited);
      // 过期：回执不再可读，重试按新请求裁决——任务头已前进，报分叉，提交按 ID 去重、没有重复
      await age('operation_id = $3', [upload.operationId]);
      await expect(projected.receipt(admin, seed.teamId, seed.appId, upload.operationId)).resolves.toEqual({
        status: 'unknown'
      });
      await expect(repository.operation(admin, seed.teamId, seed.appId, upload)).rejects.toMatchObject({
        code: 'diverged'
      });
      expect(await count("SELECT count(*) FROM admin_private.commits WHERE team_id = $1 AND id = 'c1'")).toBe(1);
      expect(await count('SELECT count(*) FROM admin_private.commits WHERE team_id = $1')).toBe(1);
      // 过期回执由之后的普通写事务顺手清掉：下一条命令就删除了上传那条过期回执
      await op({ type: 'task', id: 't0', name: 'T0', expectedHead: null });
      expect(
        await count(
          `SELECT count(*) FROM admin_private.operations WHERE team_id = $1 AND operation_id = '${upload.operationId}'`
        )
      ).toBe(0);
      // 有界清理：积压 25 条过期回执，每个写事务最多清理 receiptSweepLimit 条，最旧的先清
      for (let index = 1; index < 24; index++)
        await op({ type: 'task', id: `t${index}`, name: `T${index}`, expectedHead: null });
      await age('true');
      const expired = 'SELECT count(*) FROM admin_private.operations WHERE team_id = $1 AND at <= $2';
      const expiredCount = async () =>
        Number((await pool.query(expired, [seed.teamId, Date.now() - receiptRetentionMs])).rows[0].count);
      expect(await expiredCount()).toBe(25);
      await op({ type: 'task', id: 'sweep-1', name: 'Sweep', expectedHead: null });
      expect(await expiredCount()).toBe(25 - receiptSweepLimit);
      await op({ type: 'task', id: 'sweep-2', name: 'Sweep', expectedHead: null });
      expect(await expiredCount()).toBe(0);
      expect(await count('SELECT count(*) FROM admin_private.operations WHERE team_id = $1')).toBe(2);
    } finally {
      await removeWorkspace(seed);
    }
  }, 60000);

  it('serves a summary whose size does not depend on how many commits the workspace holds', async () => {
    const summaryBytes = async (commits: number) => {
      const { seed, op } = await freshWorkspace(`summary-${commits}`);
      try {
        await op({ type: 'task', id: 'task', name: 'Task', expectedHead: null });
        let head: string | null = null;
        let content: Records = {};
        let serialNumber = 0;
        for (const size of [commits / 2, commits / 2]) {
          const batch: Commit[] = [];
          for (let index = 0; index < size; index++) {
            const id = `r${serialNumber++}`;
            const next: Records = { ...content, [id]: { entity: 'AssetCategory', fields: { name: id } } };
            batch.push(await signed(uuidv7(), batch.at(-1)?.id ?? head, content, next));
            content = next;
          }
          await op({ type: 'upload', taskId: 'task', expectedHead: head, commits: batch });
          head = batch.at(-1)!.id;
        }
        await op({ type: 'pr', id: 'pr', taskId: 'task', title: 'PR', description: '', target: 'shared' });
        await op(comment('pr', 'Size'));
        return Buffer.byteLength(JSON.stringify(await projected.read(admin, seed.teamId, seed.appId)));
      } finally {
        await removeWorkspace(seed);
      }
    };
    const few = await summaryBytes(10);
    const many = await summaryBytes(200);
    expect(many).toBeLessThan(50_000);
    expect(Math.abs(many - few)).toBeLessThan(100);
  }, 60000);

  /** 一个记录每条 SQL 与参数的连接池：命令事务与只读查询都经它执行，用来对实际发出的查询做执行计划检查。 */
  function recordingPool(statements: { sql: string; params: unknown[] }[]): pg.Pool {
    const recorded =
      (target: { query: (...values: unknown[]) => unknown }) =>
      (...args: unknown[]) => {
        if (typeof args[0] === 'string') statements.push({ sql: args[0], params: (args[1] as unknown[]) ?? [] });
        return target.query(...args);
      };
    return {
      connect: async () => {
        const client = await pool.connect();
        return new Proxy(client, {
          get(target, property) {
            if (property === 'query') return recorded(target as never);
            const value: unknown = Reflect.get(target, property);
            return typeof value === 'function' ? (value as (...values: unknown[]) => unknown).bind(target) : value;
          }
        });
      },
      query: recorded(pool as never)
    } as unknown as pg.Pool;
  }
  interface PlanNode {
    'Node Type': string;
    'Relation Name'?: string;
    'Index Name'?: string;
    Plans?: PlanNode[];
  }
  const flatten = (node: PlanNode): PlanNode[] => [node, ...(node.Plans ?? []).flatMap(flatten)];
  /** 关掉顺序扫描再取执行计划：还剩顺序扫描说明没有能用的索引。 */
  async function planOf(sql: string, params: unknown[]): Promise<PlanNode[]> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL enable_seqscan = off');
      const result = await client.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(`EXPLAIN (FORMAT JSON) ${sql}`, params);
      return flatten(result.rows[0]['QUERY PLAN'][0].Plan);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  it('lists my workspaces and the members of a workspace through indexes, never scanning the membership table', async () => {
    const { seed } = await freshWorkspace('indexed-members');
    try {
      const statements: { sql: string; params: unknown[] }[] = [];
      const recording = pgReads(recordingPool(statements));
      const reads = (view: string) =>
        statements.filter(statement => new RegExp(`FROM public\\.${view}\\b`).test(statement.sql));
      const mine = await recording.list(admin);
      expect(mine).toContainEqual({ teamId: seed.teamId, appId: seed.appId, name: input.name });
      const listing = reads('admin_workspaces');
      expect(listing).toHaveLength(1);
      // 「我的工作区」从本人的成员行出发，只按用户索引读，不扫其他团队
      const listPlan = await planOf(listing[0].sql, listing[0].params);
      expect(listPlan.filter(node => node['Node Type'] === 'Seq Scan').map(node => node['Relation Name'])).toEqual([]);
      expect(listPlan.map(node => node['Index Name'])).toContain('memberships_user');

      statements.length = 0;
      await recording.read(admin, seed.teamId, seed.appId);
      const members = [...reads('admin_members'), ...reads('admin_workspaces')];
      expect(members.length).toBeGreaterThan(1);
      for (const statement of members) {
        const plan = await planOf(statement.sql, statement.params);
        expect(
          plan.filter(node => node['Node Type'] === 'Seq Scan' && node['Relation Name'] === 'memberships')
        ).toEqual([]);
        expect(plan.some(node => node['Index Name']?.startsWith('memberships_'))).toBe(true);
      }
    } finally {
      await removeWorkspace(seed);
    }
  });
  /** 非资产清单（项目 / 里程碑 / 标签）的工作区，免审批策略。 */
  async function planningWorkspace(appId: string) {
    const seed = { ...input, teamId: randomUUID(), appId, bootstrapKey: randomUUID(), schema: planningSchema };
    await repository.initialize(seed);
    const op = (data: Record<string, unknown>, actor: Identity = admin) =>
      repository.operation(actor, seed.teamId, seed.appId, command(data));
    return { seed, op };
  }
  const planned = (id: string, parent: string | null, before: Records, after: Records) =>
    sealCommit({
      id,
      parent,
      authorId: admin.id,
      message: id,
      changes: diffRecords(before, after, planningNamespaces)
    });
  const without = (records: Records, ...ids: string[]): Records =>
    Object.fromEntries(Object.entries(records).filter(([id]) => !ids.includes(id)));
  const errorOf = async (work: Promise<unknown>) => {
    try {
      await work;
      return null;
    } catch (error) {
      return error as { code?: string; message: string; details?: Record<string, unknown> };
    }
  };
  const project = (title: string, fields: Records[string]['fields'] = {}) => ({
    entity: 'Project',
    fields: { title, ...fields }
  });
  const milestone = (name: string, projectId: string) => ({
    entity: 'Milestone',
    fields: { name, dueOn: '2026-05-01', projectId }
  });
  /** 建 PR、请求审核并生成候选（若 PR 已存在只生成候选），返回候选的完整内容。 */
  async function plannedCandidate(
    seed: { teamId: string; appId: string },
    op: (data: Record<string, unknown>) => Promise<Record<string, unknown>>,
    task: string,
    revision: number
  ) {
    if (revision === 1) {
      await op({ type: 'pr', id: `pr-${task}`, taskId: task, title: task, description: '', target: 'shared' });
      await op({ type: 'pr_state', prId: `pr-${task}`, status: 'review', expectedRevision: 0 });
    }
    const result = await op({ type: 'candidate', prId: `pr-${task}`, expectedRevision: revision, resolutions: [] });
    return projected.readCandidate(admin, seed.teamId, seed.appId, String(result['candidateId']));
  }

  it('walks the whole flow on a non-asset schema: the schema finds the violations, the fixed candidate is approved and merged (AC#7)', async () => {
    const { seed, op } = await planningWorkspace('planning-flow');
    const reviewer = { id: randomUUID(), email: 'planning-reviewer@example.test', verified: true };
    try {
      expect(await projected.readSchema(admin, seed.teamId, seed.appId, 1)).toEqual(planningSchema);
      await op({
        type: 'invite',
        id: 'invite',
        email: reviewer.email,
        permissions: ['read', 'review'],
        tokenHash: 'token',
        expiresAt: Date.now() + 60000,
        expectedVersion: 0
      });
      await op({ type: 'accept_invite', id: 'invite', tokenHash: 'token' }, reviewer);
      await op({ type: 'task', id: 'plan', name: 'Plan', expectedHead: null });
      const broken: Records = {
        p1: project('Apollo', { code: 'AP', budget: 10 }),
        p2: project('Apollo', { code: 'AP', budget: -1, stage: 'late' }),
        m1: milestone('Kickoff', 'p1'),
        m2: milestone('Review', 'missing')
      };
      await op({
        type: 'upload',
        taskId: 'plan',
        expectedHead: null,
        commits: [await planned('plan-1', null, {}, broken)]
      });
      const first = await plannedCandidate(seed, op, 'plan', 1);
      expect(first.checks.map(check => `${check.recordId}.${check.field}: ${check.message}`)).toEqual([
        'm2.projectId: 关联记录不存在',
        'p2.title: 名称必须唯一',
        'p2.code: 取值必须唯一',
        'p2.budget: 必须为非负数',
        'p2.stage: 取值不在允许范围内'
      ]);
      const fixed: Records = {
        ...broken,
        p2: project('Gemini', { code: 'GE', budget: 1 }),
        m2: milestone('Review', 'p2')
      };
      await op({
        type: 'upload',
        taskId: 'plan',
        expectedHead: 'plan-1',
        commits: [await planned('plan-2', 'plan-1', broken, fixed)]
      });
      const second = await plannedCandidate(seed, op, 'plan', 3);
      expect(second.checks).toEqual([]);
      await op(
        {
          type: 'review',
          prId: 'pr-plan',
          candidateId: second.id,
          expectedSource: second.source,
          stageId: 'review',
          decision: 'approve',
          reason: '',
          expectedRevision: 0
        },
        reviewer
      );
      await op({
        type: 'merge',
        prId: 'pr-plan',
        candidateId: second.id,
        expectedSource: 'plan-2',
        expectedTarget: null
      });
      expect((await projected.readRecords(admin, seed.teamId, seed.appId)).records).toEqual(fixed);
      const keys = await pool.query<{ record_id: string; kind: string; field: string; value: string }>(
        'SELECT record_id, kind, field, value FROM admin_private.record_keys WHERE team_id = $1 ORDER BY record_id, kind, field',
        [seed.teamId]
      );
      expect(keys.rows).toEqual([
        { record_id: 'm1', kind: 'reference', field: 'projectId', value: 'p1' },
        { record_id: 'm2', kind: 'reference', field: 'projectId', value: 'p2' },
        { record_id: 'p1', kind: 'unique', field: 'code', value: '"AP"' },
        { record_id: 'p1', kind: 'unique', field: 'title', value: '"Apollo"' },
        { record_id: 'p2', kind: 'unique', field: 'code', value: '"GE"' },
        { record_id: 'p2', kind: 'unique', field: 'title', value: '"Gemini"' }
      ]);
      // 删除仍被引用的项目：未改动的里程碑经键索引被找出来，报关联记录不存在
      await op({
        type: 'task',
        id: 'drop',
        name: 'Drop',
        expectedHead: (await projected.read(admin, seed.teamId, seed.appId)).head
      });
      const head = (await projected.read(admin, seed.teamId, seed.appId)).head;
      await op({
        type: 'upload',
        taskId: 'drop',
        expectedHead: head,
        commits: [await planned('drop-1', head, fixed, without(fixed, 'p1'))]
      });
      const dropped = await plannedCandidate(seed, op, 'drop', 1);
      expect(dropped.checks.map(check => `${check.recordId}.${check.field}: ${check.message}`)).toEqual([
        'm1.projectId: 关联记录不存在'
      ]);
    } finally {
      await removeWorkspace(seed);
    }
  }, 60000);

  it('rejects an upload whose changes do not fit the parent content, as a whole batch and without writing anything', async () => {
    const { seed, op } = await planningWorkspace('planning-upload');
    try {
      await op({ type: 'task', id: 'task', name: 'Task', expectedHead: null });
      const first = await planned('c1', null, {}, { p1: project('Apollo', { budget: 10 }) });
      await op({ type: 'upload', taskId: 'task', expectedHead: null, commits: [first] });
      const fine = await planned(
        'c2',
        'c1',
        { p1: project('Apollo', { budget: 10 }) },
        { p1: project('Apollo', { budget: 20 }) }
      );
      const forged = await sealCommit({
        id: 'c3',
        parent: 'c2',
        authorId: admin.id,
        message: 'forged',
        changes: [
          {
            namespace: 'planning',
            entity: 'Project',
            entityId: 'p1',
            operation: 'update',
            patch: { budget: 30 },
            inversePatch: { budget: 99 }
          }
        ]
      });
      const rejected = await errorOf(
        op({ type: 'upload', taskId: 'task', expectedHead: 'c1', commits: [fine, forged] })
      );
      expect(rejected).toMatchObject({ code: 'invalid', message: '提交内容与其父提交不一致' });
      const stored = await pool.query('SELECT id FROM admin_private.commits WHERE team_id = $1 ORDER BY id', [
        seed.teamId
      ]);
      expect(stored.rows.map(row => row['id'])).toEqual(['c1']);
      const unknown = await sealCommit({
        id: 'c4',
        parent: 'c1',
        authorId: admin.id,
        message: 'unknown field',
        changes: [{ ...forged.changes[0], patch: { owner: 'x' }, inversePatch: {} }]
      });
      expect(
        await errorOf(op({ type: 'upload', taskId: 'task', expectedHead: 'c1', commits: [unknown] }))
      ).toMatchObject({
        code: 'invalid',
        message: '字段不受支持'
      });
      await op({ type: 'upload', taskId: 'task', expectedHead: 'c1', commits: [fine] });
    } finally {
      await removeWorkspace(seed);
    }
  });

  it('builds candidates and merges from the changed records only: the same statements and lookup sizes for 300 and 3000 shared records', async () => {
    const reads = async (count: number) => {
      const { seed, op } = await planningWorkspace(`planning-reads-${count}`);
      try {
        const records: Records = {};
        for (let index = 0; index < count; index++) {
          records[`p${index}`] = project(`Project ${index}`, { code: `C${index}` });
          records[`m${index}a`] = milestone(`A ${index}`, `p${index}`);
          records[`m${index}b`] = milestone(`B ${index}`, `p${index}`);
        }
        await op({ type: 'policy', stages: [], expectedVersion: 1 });
        await op({ type: 'task', id: 'seed', name: 'Seed', expectedHead: null });
        await op({
          type: 'upload',
          taskId: 'seed',
          expectedHead: null,
          commits: [await planned('seed-1', null, {}, records)]
        });
        const seedCandidate = await plannedCandidate(seed, op, 'seed', 1);
        await op({
          type: 'merge',
          prId: 'pr-seed',
          candidateId: seedCandidate.id,
          expectedSource: 'seed-1',
          expectedTarget: null
        });
        const head = (await projected.read(admin, seed.teamId, seed.appId)).head;
        const edited: Records = {
          ...without(records, 'p3'),
          p1: project('Renamed', { code: 'C1' }),
          extra: milestone('Extra', 'p2')
        };
        await op({ type: 'task', id: 'edit', name: 'Edit', expectedHead: head });
        await op({
          type: 'upload',
          taskId: 'edit',
          expectedHead: head,
          commits: [await planned('edit-1', head, records, edited)]
        });
        await op({ type: 'pr', id: 'pr-edit', taskId: 'edit', title: 'edit', description: '', target: 'shared' });
        await op({ type: 'pr_state', prId: 'pr-edit', status: 'review', expectedRevision: 0 });
        const statements: { sql: string; params: unknown[] }[] = [];
        const recording = new CollaborationRepository(recordingPool(statements));
        const result = await recording.operation(
          admin,
          seed.teamId,
          seed.appId,
          command({ type: 'candidate', prId: 'pr-edit', expectedRevision: 1, resolutions: [] })
        );
        const candidate = await projected.readCandidate(admin, seed.teamId, seed.appId, String(result['candidateId']));
        expect(candidate.checks.map(check => `${check.recordId}.${check.field}`)).toEqual([
          'm3a.projectId',
          'm3b.projectId'
        ]);
        const candidateReads = statements.filter(statement =>
          /public\.shared_records|admin_private\.record_keys/.test(statement.sql)
        );
        statements.length = 0;
        // 共享数据还没有改动，仍按同一份候选合并：重新核对同样只读改动过的记录
        const fixedEdit = { ...edited, m3a: milestone('A 3', 'p2'), m3b: milestone('B 3', 'p2') };
        await op({
          type: 'upload',
          taskId: 'edit',
          expectedHead: 'edit-1',
          commits: [await planned('edit-2', 'edit-1', edited, fixedEdit)]
        });
        const clean = await plannedCandidate(seed, op, 'edit', 3);
        expect(clean.checks).toEqual([]);
        statements.length = 0;
        await recording.operation(
          admin,
          seed.teamId,
          seed.appId,
          command({
            type: 'merge',
            prId: 'pr-edit',
            candidateId: clean.id,
            expectedSource: 'edit-2',
            expectedTarget: head
          })
        );
        const mergeReads = statements.filter(
          statement =>
            /SELECT/.test(statement.sql) && /public\.shared_records|admin_private\.record_keys/.test(statement.sql)
        );
        // 每条读取都带记录或键的过滤，从不整表读取共享记录；按键查询走 record_keys 的索引
        for (const statement of [...candidateReads, ...mergeReads])
          if (/FROM public\.shared_records/.test(statement.sql) && !/IN \(/.test(statement.sql))
            expect(statement.params[2], statement.sql).not.toBeNull();
        for (const statement of candidateReads.filter(item => /admin_private\.record_keys/.test(item.sql))) {
          const plan = await planOf(statement.sql, statement.params);
          expect(plan.filter(node => node['Node Type'] === 'Seq Scan').map(node => node['Relation Name'])).toEqual([]);
        }
        const shape = (list: typeof statements) =>
          list.map(statement => [
            statement.sql.replace(/\s+/g, ' ').trim(),
            ...statement.params.slice(2).map(param => (Array.isArray(param) ? param.length : typeof param))
          ]);
        return { candidate: shape(candidateReads), merge: shape(mergeReads) };
      } finally {
        await removeWorkspace(seed);
      }
    };
    const small = await reads(100);
    const large = await reads(1000);
    expect(large).toEqual(small);
    expect(small.candidate.length).toBeGreaterThan(2);
  }, 120000);

  it('registers a new schema version only for managers and only when every shared record passes it; the key index is rebuilt', async () => {
    const { seed, op } = await planningWorkspace('planning-schema');
    try {
      await op({ type: 'policy', stages: [], expectedVersion: 1 });
      await op({ type: 'task', id: 'seed', name: 'Seed', expectedHead: null });
      const shared: Records = { p1: project('Apollo'), p2: project('Zeus') };
      await op({
        type: 'upload',
        taskId: 'seed',
        expectedHead: null,
        commits: [await planned('seed-1', null, {}, shared)]
      });
      const seedCandidate = await plannedCandidate(seed, op, 'seed', 1);
      await op({
        type: 'merge',
        prId: 'pr-seed',
        candidateId: seedCandidate.id,
        expectedSource: 'seed-1',
        expectedTarget: null
      });
      const required = structuredClone({ ...planningSchema, schemaVersion: 2 });
      Object.assign(
        required.entities[0].fields.find(field => field.field === 'code')!,
        { required: true }
      );
      expect(await errorOf(op({ type: 'schema', schema: required, expectedVersion: 1 }))).toMatchObject({
        code: 'checks',
        details: {
          checks: [
            { recordId: 'p1', field: 'code', message: '必填文本不能为空' },
            { recordId: 'p2', field: 'code', message: '必填文本不能为空' }
          ],
          total: 2
        }
      });
      const unique = structuredClone({ ...planningSchema, schemaVersion: 2 });
      Object.assign(
        unique.entities[0].fields.find(field => field.field === 'stage')!,
        { unique: true }
      );
      expect(await op({ type: 'schema', schema: unique, expectedVersion: 1 })).toEqual({ schemaVersion: 2 });
      const versions = await pool.query(
        'SELECT version FROM admin_private.schemas WHERE team_id = $1 ORDER BY version',
        [seed.teamId]
      );
      expect(versions.rows.map(row => row['version'])).toEqual([1, 2]);
      expect((await projected.read(admin, seed.teamId, seed.appId)).schemaVersion).toBe(2);
      expect(await projected.readSchema(admin, seed.teamId, seed.appId, 2)).toEqual(unique);
      expect(await errorOf(projected.readSchema(admin, seed.teamId, seed.appId, 3))).toMatchObject({
        code: 'not_found'
      });
      expect(
        await errorOf(op({ type: 'schema', schema: { ...unique, schemaVersion: 3 }, expectedVersion: 1 }))
      ).toMatchObject({
        code: 'stale'
      });
    } finally {
      await removeWorkspace(seed);
    }
  });
});
