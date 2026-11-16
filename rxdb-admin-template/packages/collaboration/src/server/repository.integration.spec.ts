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
  it('denies ordinary authenticated admins direct writes and cross-team reads', async () => {
    const client = await pool.connect();
    try {
      await client.query('SET ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [admin.id]);
      expect((await client.query('SELECT * FROM public.admin_shared')).rows).toHaveLength(1);
      expect((await client.query('SELECT * FROM public.admin_workspace_versions')).rows).toHaveLength(1);
      await expect(client.query('UPDATE public.admin_workspace_versions SET revision = 999')).rejects.toThrow(/permission denied/);
      await expect(client.query("UPDATE public.admin_shared SET records = '{}'::jsonb")).rejects.toThrow(
        /permission denied/
      );
      await expect(client.query('DELETE FROM public.admin_audit')).rejects.toThrow(/permission denied/);
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
});
