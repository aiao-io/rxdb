import { getEntityMetadata, type RxDB } from '@aiao/rxdb';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';
import { firstValueFrom } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Command, Identity } from '../model.js';
import { assetSchema } from '../schema.testing.js';
import { applyMigrations } from '../server/migrate.js';
import { pgReads } from '../server/reads.testing.js';
import { installRealtime } from '../server/realtime-fixture.js';
import { CollaborationRepository } from '../server/repository.js';
import { TaskLedger, type Context } from './task-ledger.js';
import { openTeamDatabase } from './team-database.js';
import { assetEntities, pgliteTeamFactory } from './team-entities.testing.js';
import { TeamTasks, type ExchangeDownload } from './team-tasks.js';
import { memoryStorage } from './team.testing.js';

/**
 * ADMIN-US-221 客户端与真实服务端之间的协议：团队库是 Node 里启用了 working-tree 的 PGlite（history + working-tree），
 * 服务端是临时 Docker PostgreSQL 上的协作仓储（迁移、专用的命令事务），下发经与浏览器同一个 `CollaborationReader`
 * 以 authenticated 角色读 `admin_commit_exchange()`。证明的是协议与提交身份：服务端接受本机提交（指纹、前像、作者都过），
 * 下发的记录能原样导入，第二台设备的提交 ID、父链与作者与服务端一致。PGlite 与浏览器里 sqlite-wasm 的落库形态不同，
 * 取值形态以 e2e（真实浏览器 + sqlite-wasm）为准。
 */
const run = promisify(execFile);
const container = `admin-team-exchange-${randomUUID()}`;
let pool: pg.Pool;
let repository: CollaborationRepository;
let started = false;
const admin: Identity = { id: randomUUID(), email: 'team-exchange@example.test', verified: true };
const teamId = randomUUID();
const appId = 'assets';
let root = '';
const command = (data: Record<string, unknown>) => ({ operationId: randomUUID(), ...data }) as Command;
const op = (data: Record<string, unknown>) => repository.operation(admin, teamId, appId, command(data));
const contextOf = (taskId: string): Context => ({ userId: admin.id, teamId, appId, taskId });
/** 与浏览器同一个读取器：每页至多 `limit` 个提交（给小页时也走一遍分页）。 */
const download =
  (limit?: number): ExchangeDownload =>
  (branch, known) =>
    pgReads(pool).reader(admin).exchange({ teamId, appId, name: teamId }, branch, known, limit);
const remoteTask = async (id: string) =>
  (await pgReads(pool).read(admin, teamId, appId)).tasks.find(task => task.id === id)!;

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
  await repository.initialize({
    teamId,
    appId,
    name: 'Exchange',
    bootstrapKey: randomUUID(),
    admin,
    schema: assetSchema
  });
  await op({ type: 'policy', stages: [], expectedVersion: 1 });
  root = (await pgReads(pool).branch(admin, teamId, appId)).root;
}, 90000);
afterAll(async () => {
  await pool?.end();
  if (started) await run('docker', ['stop', container]);
}, 20000);

const devices: TeamTasks[] = [];
afterEach(async () => {
  for (const tasks of devices.splice(0)) await tasks.logout();
});
/** 一台设备：自己的账本与团队库。 */
async function device() {
  const factory = pgliteTeamFactory(assetEntities);
  const tasks = new TeamTasks(new TaskLedger(memoryStorage()), scope => openTeamDatabase(factory, scope));
  devices.push(tasks);
  await tasks.login(admin.id);
  return tasks;
}
const rxdbOf = (tasks: TeamTasks): RxDB => tasks.database!.rxdb;
const typeOf = (rxdb: RxDB, entity: string) =>
  rxdb.config.entities.find(type => getEntityMetadata(type).name === entity)!;
async function create(tasks: TeamTasks, entity: string, fields: Record<string, unknown>) {
  const rxdb = rxdbOf(tasks);
  const instance = rxdb.entityManager.instantiate(typeOf(rxdb, entity), fields as never);
  await rxdb.entityManager.save(instance);
  return String((instance as unknown as { id: string }).id);
}
async function update(tasks: TeamTasks, entity: string, id: string, fields: Record<string, unknown>) {
  const rxdb = rxdbOf(tasks);
  const found = await firstValueFrom(rxdb.entityManager.getRepository(typeOf(rxdb, entity)).get(id as never));
  Object.assign(found as object, fields);
  await rxdb.entityManager.save(found);
}
/** 当前分支上全部业务记录的业务字段（与服务端记录比较时只看清单里的属性与外键，系统字段是每台设备自己的簿记）。 */
async function businessRows(tasks: TeamTasks) {
  const rxdb = rxdbOf(tasks);
  const tracked: Record<string, readonly string[]> = {
    AssetCategory: ['name', 'description'],
    Asset: ['name', 'status', 'purchasePrice', 'categoryId'],
    AssetEvent: ['summary', 'cost', 'assetId']
  };
  const rows: Record<string, { entity: string; fields: Record<string, unknown> }> = {};
  for (const [entity, fields] of Object.entries(tracked)) {
    const found = await firstValueFrom(
      rxdb.entityManager.getRepository(typeOf(rxdb, entity)).findAll({ where: { combinator: 'and', rules: [] } })
    );
    for (const row of found.map(item => item as unknown as Record<string, unknown>))
      rows[String(row['id'])] = {
        entity,
        fields: Object.fromEntries(fields.map(field => [field, row[field] ?? null]))
      };
  }
  return rows;
}
/** 服务端的共享记录，只取同样的业务字段（缺失按 null，与落库时可空列为 NULL 一致）。 */
async function sharedRows() {
  const { records } = await pgReads(pool).readRecords(admin, teamId, appId);
  const tracked: Record<string, readonly string[]> = {
    AssetCategory: ['name', 'description'],
    Asset: ['name', 'status', 'purchasePrice', 'categoryId'],
    AssetEvent: ['summary', 'cost', 'assetId']
  };
  return Object.fromEntries(
    Object.entries(records).map(([id, row]) => [
      id,
      {
        entity: row.entity,
        fields: Object.fromEntries(tracked[row.entity].map(field => [field, row.fields[field] ?? null]))
      }
    ])
  );
}
/** 本机已提交的改动经真实命令事务上传，并确认。 */
async function upload(tasks: TeamTasks, context: Context) {
  const next = await tasks.nextUpload(context);
  if (!next) return undefined;
  const result = await repository.operation(admin, teamId, appId, {
    type: 'upload',
    taskId: context.taskId,
    operationId: next.upload.operationId,
    expectedHead: next.upload.expectedHead,
    commits: next.commits
  });
  await tasks.acknowledge(context, next.upload.operationId, String(result['head']), tasks.epoch);
  return String(result['head']);
}
/** 服务端合并一个任务（免审批）。 */
async function merge(taskId: string) {
  const prId = `${taskId}-pr`;
  const task = await remoteTask(taskId);
  await op({ type: 'pr', id: prId, taskId, title: taskId, description: '', target: 'shared' });
  await op({ type: 'pr_state', prId, status: 'review', expectedRevision: 0 });
  const candidate = await op({ type: 'candidate', prId, expectedRevision: 1, resolutions: [] });
  const { head } = await pgReads(pool).branch(admin, teamId, appId);
  const merged = await op({
    type: 'merge',
    prId,
    candidateId: candidate['candidateId'],
    expectedSource: task.head,
    expectedTarget: head
  });
  return String(merged['head']);
}
/** 服务端的提交元数据（只读投影 `admin_commits`）。 */
async function serverCommit(id: string) {
  const rows = await pgReads(pool).readCommit(admin, teamId, appId, id);
  return { id: rows.id, parentIds: rows.parentIds, authorId: rows.authorId, kind: rows.kind };
}

describe('团队库与服务端交换提交（ADMIN-US-221，真实 PostgreSQL 服务端）', () => {
  it('本机编辑经 commit → exportCommits 上传，服务端接受；第二台设备导入同一任务，提交 ID、父链与作者与服务端一致（AC#1）', async () => {
    const { head: base } = await pgReads(pool).branch(admin, teamId, appId);
    await op({ type: 'task', id: 'identity', name: 'Identity', expectedHead: base });
    const context = contextOf('identity');
    const deviceA = await device();
    await deviceA.prepare(context, await remoteTask('identity'), download(1));
    const category = await create(deviceA, 'AssetCategory', { name: '电脑' });
    const asset = await create(deviceA, 'Asset', { name: '工作站', categoryId: category, purchasePrice: 120 });
    await deviceA.commit(context, '采购');
    const first = await upload(deviceA, context);
    expect(first).toBeDefined();
    expect(await serverCommit(first!)).toEqual({ id: first, parentIds: [base], authorId: admin.id, kind: 'normal' });

    const deviceB = await device();
    // 小页下发：共享分支与任务分支都按「已知提交 → 分支头」一页一页导入
    const pulled = await deviceB.prepare(context, await remoteTask('identity'), download(1));
    expect(pulled).toMatchObject({ localHead: first, remoteHead: first, saved: 0, unpushed: 0 });
    expect(pulled.commits).toEqual([{ id: first, parentId: base, authorId: admin.id, message: '采购', synced: true }]);
    expect(await businessRows(deviceB)).toEqual(await businessRows(deviceA));

    await update(deviceB, 'Asset', asset, { purchasePrice: 130 });
    await deviceB.commit(context, '采购');
    const second = await upload(deviceB, context);
    expect(await serverCommit(second!)).toEqual({ id: second, parentIds: [first], authorId: admin.id, kind: 'normal' });
    expect((await remoteTask('identity')).head).toBe(second);
  });

  it('合并之后下发的共享分支导入团队库：任务起点的业务数据与服务端共享记录逐条一致', async () => {
    await merge('identity');
    const { head } = await pgReads(pool).branch(admin, teamId, appId);
    await op({ type: 'task', id: 'mirror', name: 'Mirror', expectedHead: head });
    const tasks = await device();
    // 每页一个提交：共享分支要分两页（根；两个任务提交与把它们带进来的合并提交是一组，不拆开）
    const pages = vi.fn(download(1));
    const view = await tasks.prepare(contextOf('mirror'), await remoteTask('mirror'), pages);
    expect(pages.mock.calls.filter(([branch]) => 'branch' in branch)).toHaveLength(2);
    expect(view).toMatchObject({ base: head, localHead: head, saved: 0 });
    expect(await businessRows(tasks)).toEqual(await sharedRows());
  });

  it('放弃草稿回到任务头；恢复历史版本形成未提交改动，同步后服务端接受（前像与父内容一致），共享头与历史不动（AC#3、AC#5）', async () => {
    const { head } = await pgReads(pool).branch(admin, teamId, appId);
    await op({ type: 'task', id: 'restore', name: 'Restore', expectedHead: head });
    const context = contextOf('restore');
    const tasks = await device();
    await tasks.prepare(context, await remoteTask('restore'), download());
    const shared = await sharedRows();
    const [categoryId] = Object.entries(shared).find(([, row]) => row.entity === 'AssetCategory')!;
    await update(tasks, 'AssetCategory', categoryId, { name: '草稿里的改名' });
    await create(tasks, 'AssetCategory', { name: '草稿里的新分类' });
    expect(await tasks.discard(context)).toBe(2);
    expect(await businessRows(tasks)).toEqual(shared);

    const restored = await tasks.restore(context, root);
    expect(restored).toMatchObject({ ok: true });
    expect(await businessRows(tasks)).toEqual({});
    expect(await tasks.view(context)).toMatchObject({ restoring: true, localHead: head });
    await tasks.commit(context, '恢复到起点');
    const accepted = await upload(tasks, context);
    expect(await serverCommit(accepted!)).toMatchObject({ parentIds: [head], authorId: admin.id });
    // 同步只推进任务分支：共享头与共享记录都没动，历史一条没删
    expect((await pgReads(pool).branch(admin, teamId, appId)).head).toBe(head);
    expect(await sharedRows()).toEqual(shared);
    const history = await pgReads(pool).readHistory(admin, teamId, appId, { branch: 'shared' });
    expect(history.commits.map(commit => commit.id)).toContain(head);
  });
});
