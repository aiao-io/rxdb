import { getEntityMetadata, type EntityType, type RxDB } from '@aiao/rxdb';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Identity, Records, SchemaManifest } from '../model.js';
import { assetSchema } from '../schema.testing.js';
import { MemoryWorkspace } from '../server/memory.testing.js';
import { importOrder } from './import-anonymous.js';
import { TaskLedger, type Context } from './task-ledger.js';
import { openTeamDatabase } from './team-database.js';
import { assetEntities, manifestOf, pgliteTeamFactory, planningEntities } from './team-entities.testing.js';
import { memoryCommand, memoryDownload } from './team-server.testing.js';
import { TeamTasks } from './team-tasks.js';
import { memoryStorage } from './team.testing.js';

/**
 * 团队任务在真实平台 working-tree 上的本机动作（Node + PGlite 内存库 + history + working-tree），服务端是内存实现
 * （与 PostgreSQL 实现同一个引擎与校验：父链、作者、指纹与前像）。PGlite 与浏览器里 sqlite-wasm 的落库形态不同，
 * 这里的结论只证明协议与提交身份；取值形态以 e2e（真实浏览器 + sqlite-wasm）为准。
 */
const admin: Identity = { id: crypto.randomUUID(), email: 'admin@example.test', verified: true };
const opened: TeamTasks[] = [];
afterEach(async () => {
  for (const tasks of opened.splice(0)) await tasks.logout();
});

async function workspace(schema: SchemaManifest = assetSchema, appId = 'assets') {
  const space = MemoryWorkspace.create(
    { teamId: 'team', appId, name: 'Team', bootstrapKey: 'seed', admin, schema },
    { now: Date.now(), id: () => crypto.randomUUID() }
  );
  const act = memoryCommand(space);
  await act(admin, { type: 'policy', stages: [], expectedVersion: 1 });
  return { space, act, download: memoryDownload(space) };
}
/** 一台设备：自己的账本与团队库（PGlite 内存库），以 admin 登录。 */
async function device(entities: readonly EntityType[] = assetEntities, storage = memoryStorage(), directory?: string) {
  const factory = pgliteTeamFactory(entities, directory);
  const tasks = new TeamTasks(new TaskLedger(storage), scope => openTeamDatabase(factory, scope));
  opened.push(tasks);
  await tasks.login(admin.id);
  return tasks;
}
const contextOf = (taskId: string, appId = 'assets'): Context => ({ userId: admin.id, teamId: 'team', appId, taskId });
const rxdbOf = (tasks: TeamTasks): RxDB => tasks.database!.rxdb;
const typeOf = (rxdb: RxDB, entity: string) =>
  rxdb.config.entities.find(type => getEntityMetadata(type).name === entity)!;
/** 在当前分支上经 RxDB 新建一条记录（与实体列表的保存同一条写路径）。 */
async function create(tasks: TeamTasks, entity: string, fields: Record<string, unknown>) {
  const rxdb = rxdbOf(tasks);
  const instance = rxdb.entityManager.instantiate(typeOf(rxdb, entity), fields as never);
  await rxdb.entityManager.save(instance);
  return String((instance as unknown as { id: string }).id);
}
/** 当前分支上一个实体的全部记录，只取给定字段。 */
async function rows(tasks: TeamTasks, entity: string, fields: readonly string[]) {
  const rxdb = rxdbOf(tasks);
  const found = await firstValueFrom(
    rxdb.entityManager.getRepository(typeOf(rxdb, entity)).findAll({ where: { combinator: 'and', rules: [] } })
  );
  return found
    .map(row => row as unknown as Record<string, unknown>)
    .map(row => Object.fromEntries(['id', ...fields].map(field => [field, row[field]])))
    .sort((a, b) => String(a['id']).localeCompare(String(b['id'])));
}
/** 改一条记录的字段并保存。 */
async function update(tasks: TeamTasks, entity: string, id: string, fields: Record<string, unknown>) {
  const rxdb = rxdbOf(tasks);
  const found = await firstValueFrom(rxdb.entityManager.getRepository(typeOf(rxdb, entity)).get(id as never));
  Object.assign(found as object, fields);
  await rxdb.entityManager.save(found);
}
/** 把本机已提交的改动上传到内存服务端（与控制器的同步同一个顺序：取待上传、发上传、确认）。 */
async function upload(tasks: TeamTasks, context: Context, act: ReturnType<typeof memoryCommand>) {
  const next = await tasks.nextUpload(context);
  if (!next) return undefined;
  const result = await act(admin, {
    type: 'upload',
    taskId: context.taskId,
    operationId: next.upload.operationId,
    expectedHead: next.upload.expectedHead,
    commits: next.commits
  });
  await tasks.acknowledge(context, next.upload.operationId, String(result['head']), tasks.epoch);
  return { next, result };
}
async function sync(tasks: TeamTasks, context: Context, act: ReturnType<typeof memoryCommand>, message: string) {
  await tasks.commit(context, message);
  return upload(tasks, context, act);
}
/** 服务端合并一个任务（免审批策略：生成候选即可合并），返回合并提交。 */
async function merge(space: MemoryWorkspace, act: ReturnType<typeof memoryCommand>, taskId: string) {
  const prId = `${taskId}-pr`;
  await act(admin, { type: 'pr', id: prId, taskId, title: taskId, description: '', target: 'shared' });
  await act(admin, { type: 'pr_state', prId, status: 'review', expectedRevision: 0 });
  const candidate = await act(admin, { type: 'candidate', prId, expectedRevision: 1, resolutions: [] });
  const merged = await act(admin, {
    type: 'merge',
    prId,
    candidateId: candidate['candidateId'],
    expectedSource: space.state.tasks[taskId].head,
    expectedTarget: space.state.head
  });
  return String(merged['head']);
}
/** 服务端新建一个从当前共享头起步的任务，返回打开它要用的任务行。 */
async function task(space: MemoryWorkspace, act: ReturnType<typeof memoryCommand>, id: string) {
  await act(admin, { type: 'task', id, name: id, expectedHead: space.state.head });
  return space.state.tasks[id];
}

// 每个用例都要起 PGlite（WASM）：全量并行跑时冷启动会超过默认的 5 秒
vi.setConfig({ testTimeout: 30000 });
describe('打开任务：镜像共享分支、从共同起点建任务分支、导入任务的已有提交', () => {
  it('第二台设备打开同一任务：提交 ID、父链与作者与服务端一致，工作树干净，不记成拉取者的新提交（AC#1）', async () => {
    const { space, act, download } = await workspace();
    const remote = await task(space, act, 't');
    const first = await device();
    const context = contextOf('t');
    const opened = await first.prepare(context, remote, download);
    expect(opened).toMatchObject({ localHead: space.state.root, remoteHead: space.state.root, saved: 0, unpushed: 0 });
    const category = await create(first, 'AssetCategory', { name: '电脑' });
    expect((await first.view(context)).saved).toBe(1);
    const sent = await sync(first, context, act, '采购电脑');
    expect(sent?.result['head']).toBe(sent?.next.upload.head);
    const head = space.state.tasks['t'].head;
    expect(space.store.record(head)).toMatchObject({
      authorId: admin.id,
      parentIds: [space.state.root],
      kind: 'normal'
    });

    const second = await device();
    const pulled = await second.prepare(context, space.state.tasks['t'], download);
    expect(pulled).toMatchObject({ localHead: head, remoteHead: head, saved: 0, unpushed: 0 });
    expect(pulled.commits).toEqual([
      { id: head, parentId: space.state.root, authorId: admin.id, message: '采购电脑', synced: true }
    ]);
    expect(await rows(second, 'AssetCategory', ['name'])).toEqual([{ id: category, name: '电脑' }]);

    await update(second, 'AssetCategory', category, { name: '笔记本' });
    const continued = await sync(second, context, act, '采购电脑');
    expect(space.store.record(String(continued?.result['head']))).toMatchObject({
      parentIds: [head],
      authorId: admin.id
    });
  });

  it('下发的共享分支导入之后，任务分支起点的业务数据与服务端的共享记录一致', async () => {
    const { space, act, download } = await workspace();
    const first = await device();
    await first.prepare(contextOf('t'), await task(space, act, 't'), download);
    const category = await create(first, 'AssetCategory', { name: '电脑' });
    await create(first, 'Asset', { name: '工作站', categoryId: category, purchasePrice: 120 });
    await sync(first, contextOf('t'), act, '采购');
    await merge(space, act, 't');
    const shared = (await space.records(admin)).records;

    const other = await device();
    const view = await other.prepare(contextOf('u'), await task(space, act, 'u'), download);
    expect(view.localHead).toBe(space.state.head);
    const local = [
      ...(await rows(other, 'AssetCategory', ['name'])),
      ...(await rows(other, 'Asset', ['name', 'categoryId', 'purchasePrice']))
    ];
    const remote = Object.entries(shared).map(([id, row]) => ({
      id,
      ...Object.fromEntries(
        Object.entries(row.fields).filter(([field]) => ['name', 'categoryId', 'purchasePrice'].includes(field))
      )
    }));
    const byId = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      String(a['id']).localeCompare(String(b['id']));
    expect(local.sort(byId)).toEqual(remote.sort(byId));
  });
});

describe('已保存、已提交、已同步三种状态与上传', () => {
  it('保存进工作树，同步形成作者为当前用户的提交，服务端确认后远端头前进；待确认的上传重试交出同一批提交与同一个幂等键', async () => {
    const { space, act, download } = await workspace();
    const tasks = await device();
    const context = contextOf('t');
    await tasks.prepare(context, await task(space, act, 't'), download);
    expect(await tasks.commit(context, '空')).toBeUndefined();
    await create(tasks, 'AssetCategory', { name: '电脑' });
    expect(await tasks.view(context)).toMatchObject({ saved: 1, unpushed: 0 });
    const commitId = await tasks.commit(context, '采购');
    expect(await tasks.view(context)).toMatchObject({ saved: 0, unpushed: 1, localHead: commitId });
    const first = await tasks.nextUpload(context);
    const again = await tasks.nextUpload(context);
    expect(again).toEqual(first);
    expect(first?.commits.map(commit => commit.commitId)).toEqual([commitId]);
    expect(first?.commits[0]).toMatchObject({ authorId: admin.id, parentIds: [space.state.root], kind: 'normal' });
    await expect(tasks.acknowledge(context, first!.upload.operationId, 'other', tasks.epoch)).rejects.toThrow(
      '服务端回执与提交不一致'
    );
    const accepted = await act(admin, {
      type: 'upload',
      taskId: 't',
      operationId: first!.upload.operationId,
      expectedHead: first!.upload.expectedHead,
      commits: first!.commits
    });
    const synced = await tasks.acknowledge(context, first!.upload.operationId, String(accepted['head']), tasks.epoch);
    expect(synced).toMatchObject({ saved: 0, unpushed: 0, remoteHead: commitId, uploads: [] });
    expect(await tasks.nextUpload(context)).toBeUndefined();
  });

  it('多个本机提交按序一次上传，第一个接上远端头', async () => {
    const { space, act, download } = await workspace();
    const tasks = await device();
    const context = contextOf('t');
    await tasks.prepare(context, await task(space, act, 't'), download);
    const category = await create(tasks, 'AssetCategory', { name: '电脑' });
    const first = await tasks.commit(context, '一');
    await update(tasks, 'AssetCategory', category, { name: '笔记本' });
    const second = await tasks.commit(context, '二');
    const next = await tasks.nextUpload(context);
    expect(next?.commits.map(commit => [commit.commitId, commit.parentIds[0]])).toEqual([
      [first, space.state.root],
      [second, first]
    ]);
    await act(admin, {
      type: 'upload',
      taskId: 't',
      operationId: next!.upload.operationId,
      expectedHead: next!.upload.expectedHead,
      commits: next!.commits
    });
    expect(space.state.tasks['t'].head).toBe(second);
  });
});

describe('放弃与恢复回写业务表', () => {
  it('放弃草稿：业务表回到任务头，工作树干净（AC#3）', async () => {
    const { space, act, download } = await workspace();
    const tasks = await device();
    const context = contextOf('t');
    await tasks.prepare(context, await task(space, act, 't'), download);
    const category = await create(tasks, 'AssetCategory', { name: '电脑' });
    await sync(tasks, context, act, '采购');
    await update(tasks, 'AssetCategory', category, { name: '草稿里的改名' });
    await create(tasks, 'AssetCategory', { name: '草稿里的新分类' });
    expect((await tasks.view(context)).saved).toBe(2);
    expect(await tasks.discard(context)).toBe(2);
    expect(await rows(tasks, 'AssetCategory', ['name'])).toEqual([{ id: category, name: '电脑' }]);
    expect(await tasks.view(context)).toMatchObject({ saved: 0, restoring: false, unpushed: 0 });
  });

  it('恢复历史版本：业务表变成那个版本的数据，差异成为未提交改动，任务头不动；侧枝上的提交被平台拒绝（AC#5）', async () => {
    const { space, act, download } = await workspace();
    const first = await device();
    await first.prepare(contextOf('t'), await task(space, act, 't'), download);
    await create(first, 'AssetCategory', { name: '电脑' });
    await sync(first, contextOf('t'), act, '采购');
    const taskCommit = space.state.tasks['t'].head;
    const before = space.state.head;
    await merge(space, act, 't');
    const restorer = await device();
    const context = contextOf('restore');
    const opened = await restorer.prepare(context, await task(space, act, 'restore'), download);
    expect(await rows(restorer, 'AssetCategory', ['name'])).toHaveLength(1);
    const restored = await restorer.restore(context, before);
    expect(restored).toMatchObject({ ok: true, restoredCount: 1 });
    expect(await rows(restorer, 'AssetCategory', ['name'])).toEqual([]);
    expect(await restorer.view(context)).toMatchObject({ saved: 1, restoring: true, localHead: opened.localHead });
    await restorer.discard(context);
    expect(await restorer.restore(context, taskCommit)).toEqual({ ok: false, reason: 'side_branch_target' });
  });
});

describe('另存为新任务与跟随远端（ADMIN-US-206 AC#8、AC#9）', () => {
  it('分叉另存保留本机提交与作者；原任务之后从远端头另起分支并快进到另一台设备的版本', async () => {
    const { space, act, download } = await workspace();
    const context = contextOf('t');
    const deviceA = await device();
    await deviceA.prepare(context, await task(space, act, 't'), download);
    const category = await create(deviceA, 'AssetCategory', { name: '共同起点' });
    await sync(deviceA, context, act, '起点');
    const start = space.state.tasks['t'].head;
    const deviceB = await device();
    await deviceB.prepare(context, space.state.tasks['t'], download);
    await update(deviceB, 'AssetCategory', category, { name: '设备乙版本' });
    await sync(deviceB, context, act, '乙');
    await update(deviceA, 'AssetCategory', category, { name: '设备甲版本' });
    await deviceA.commit(context, '甲');
    await expect(upload(deviceA, context, act)).rejects.toThrow('任务已分叉，请另存为新任务');
    await expect(deviceA.fastForward(context, download)).rejects.toThrow('本机有修改，请先保留或另存为新任务');

    const plan = await deviceA.forkPlan(context);
    expect(plan.expectedHead).toBe(start);
    const forked = await act(admin, { type: 'fork', id: 'f', name: '保留设备甲', taskId: 't', ...plan });
    await deviceA.adoptFork(context, { id: 'f', name: '保留设备甲' }, String(forked['head']));
    await deviceA.adoptFork(context, { id: 'f', name: '保留设备甲' }, String(forked['head']));
    const fork = await deviceA.prepare(contextOf('f'), space.state.tasks['f'], download);
    expect(fork).toMatchObject({ localHead: forked['head'], remoteHead: forked['head'], unpushed: 0 });
    expect(space.store.record(String(forked['head']))).toMatchObject({ authorId: admin.id, parentIds: [start] });
    expect(await rows(deviceA, 'AssetCategory', ['name'])).toEqual([{ id: category, name: '设备甲版本' }]);

    await deviceA.prepare(context, space.state.tasks['t'], download);
    const followed = await deviceA.fastForward(context, download);
    expect(followed).toMatchObject({ localHead: space.state.tasks['t'].head, unpushed: 0, uploads: [] });
    expect(followed.forkArchive).toBeUndefined();
    expect(await rows(deviceA, 'AssetCategory', ['name'])).toEqual([{ id: category, name: '设备乙版本' }]);
  });
});

describe('匿名数据导入与会话锁定', () => {
  it('按引用顺序把记录写进任务分支：保留记录标识，进入工作树，同步后服务端检查通过（ADMIN-US-204 AC#2）', async () => {
    const { space, act, download } = await workspace();
    const tasks = await device();
    const context = contextOf('import');
    await tasks.prepare(context, await task(space, act, 'import'), download);
    const [asset, category] = [crypto.randomUUID(), crypto.randomUUID()];
    // 资产排在分类前面：写入顺序由 `order` 决定（被引用的实体在前），不取决于记录表的键顺序
    const records: Records = {
      [asset]: { entity: 'Asset', fields: { name: '本机电脑', categoryId: category, purchasePrice: 99 } },
      [category]: { entity: 'AssetCategory', fields: { name: '本机分类' } }
    };
    await tasks.write(context, records, ['AssetCategory', 'Asset', 'AssetEvent']);
    expect(await tasks.view(context)).toMatchObject({ saved: 2, unpushed: 0 });
    expect(await rows(tasks, 'Asset', ['name', 'categoryId'])).toEqual([
      { id: asset, name: '本机电脑', categoryId: category }
    ]);
    await sync(tasks, context, act, '导入');
    await merge(space, act, 'import');
    expect(Object.keys((await space.records(admin)).records).sort()).toEqual([asset, category].sort());
  });

  it('退出锁定账本里的全部任务并关库；冷启动只解锁验证过且未锁定的任务，授权过期即拒绝', async () => {
    const { space, act, download } = await workspace();
    const directory = await mkdtemp(join(tmpdir(), 'team-tasks-'));
    const tasks = await device(assetEntities, memoryStorage(), directory);
    const context = contextOf('t');
    await tasks.prepare(context, await task(space, act, 't'), download);
    await create(tasks, 'AssetCategory', { name: '保留的草稿' });
    await tasks.logout();
    expect(tasks.database).toBeUndefined();
    expect(() => tasks.assert(context)).toThrow('团队草稿已锁定');
    expect(tasks.ledger.list(admin.id).map(entry => entry.locked)).toEqual([true]);
    expect(await tasks.coldRestore(admin.id, Date.now() + 60000, Date.now())).toEqual([]);
    await expect(tasks.coldRestore(admin.id, 1, Date.now())).rejects.toThrow('会话已过期，请联网登录');
    await tasks.login(admin.id);
    const reopened = await tasks.prepare(context, space.state.tasks['t'], download);
    // 重开同一个团队库：退出之前保存的草稿还在任务分支的工作树里
    expect(reopened.saved).toBe(1);
    expect((await rows(tasks, 'AssetCategory', ['name'])).map(row => row['name'])).toEqual(['保留的草稿']);
    const restored = await tasks.coldRestore(admin.id, Date.now() + 60000, Date.now());
    expect(restored.map(entry => [entry.context.taskId, entry.locked])).toEqual([['t', false]]);
    await tasks.logout();
    await rm(directory, { recursive: true, force: true });
  });
});

describe('换一套业务实体：协作代码不改即可编辑、同步与合并（ADMIN-US-221 AC#4）', () => {
  it('项目与里程碑：布尔、整数与日期的取值经提交上传、服务端检查通过、合并后另一台设备导入得到同一份数据', async () => {
    const schema = manifestOf(planningEntities);
    expect(importOrder(schema)).toEqual(['Project', 'Milestone']);
    const { space, act, download } = await workspace(schema, 'planning');
    const context = contextOf('plan', 'planning');
    const tasks = await device(planningEntities);
    await tasks.prepare(context, await task(space, act, 'plan'), download);
    const project = await create(tasks, 'Project', { title: '发布 1.0', active: true });
    await create(tasks, 'Milestone', {
      label: '冻结',
      points: 3,
      due: new Date('2026-12-01T00:00:00.000Z'),
      projectId: project
    });
    await sync(tasks, context, act, '计划');
    await merge(space, act, 'plan');
    const shared = Object.values((await space.records(admin)).records).map(row => row.entity);
    expect(shared.sort()).toEqual(['Milestone', 'Project']);

    const other = await device(planningEntities);
    await other.prepare(contextOf('next', 'planning'), await task(space, act, 'next'), download);
    expect(await rows(other, 'Project', ['title', 'active'])).toEqual([
      { id: project, title: '发布 1.0', active: true }
    ]);
    expect(await rows(other, 'Milestone', ['label', 'points', 'projectId'])).toMatchObject([
      { label: '冻结', points: 3, projectId: project }
    ]);
  });
});
