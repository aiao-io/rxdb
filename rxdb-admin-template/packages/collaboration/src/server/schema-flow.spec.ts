import { describe, expect, it } from 'vitest';
import { diffRecords } from '../changes.js';
import { checkRecords, type RecordCheck } from '../checks.js';
import { taskCommit } from '../commit.testing.js';
import type { ChangeSet, Command, Commit, DataRow, Identity, Records, SchemaManifest } from '../model.js';
import { manifestOf, Milestone, planningSchema, Project, Tag } from '../planning.testing.js';
import { namespaceOf, recordKeys } from '../schema.js';
import { assetSchema } from '../schema.testing.js';
import type { EngineOptions } from './engine.js';
import { MemoryWorkspace } from './memory.testing.js';

const admin: Identity = { id: 'admin', email: 'admin@example.test', verified: true };
const editor: Identity = { id: 'editor', email: 'editor@example.test', verified: true };
let serial = 0;
const env = () => ({ now: 1000, id: () => `generated-${++serial}` });

/** 一个免审批策略的工作区，数据模式为 `schema`。 */
async function open(schema: SchemaManifest = planningSchema, options: EngineOptions = {}) {
  const workspace = MemoryWorkspace.create(
    { teamId: 'team', appId: 'app', name: 'Team', bootstrapKey: 'seed', admin, schema },
    env(),
    options
  );
  await act(workspace, { type: 'policy', stages: [], expectedVersion: 1 });
  return workspace;
}
const act = (
  workspace: MemoryWorkspace,
  command: Omit<Command, 'operationId'> | Record<string, unknown>,
  actor = admin
) => workspace.run(actor, { ...command, operationId: `operation-${++serial}` } as Command, env());
const codeOf = async (work: Promise<unknown>) => {
  try {
    await work;
    return 'ok';
  } catch (error) {
    return (error as { code?: string; message: string }).code ?? (error as Error).message;
  }
};
/** 提交内容 `after` 相对 `before` 的整单提交。 */
const sealed = (workspace: MemoryWorkspace, id: string, parent: string, before: Records, after: Records) =>
  taskCommit({
    id,
    parent,
    authorId: admin.id,
    message: id,
    changes: diffRecords(before, after, namespaceOf(workspace.state.schema))
  });
/** 从当前共享头建任务并依次上传每份内容（每份一个提交）。返回各提交。 */
async function started(workspace: MemoryWorkspace, task: string, contents: Records[]) {
  const base = workspace.state.head;
  await act(workspace, { type: 'task', id: task, name: task, expectedHead: base });
  let before = (await workspace.commit(admin, base)).records;
  let parent = base;
  const commits: Commit[] = [];
  for (const [index, after] of contents.entries()) {
    commits.push(sealed(workspace, `${task}-c${index + 1}`, parent, before, after));
    parent = commits.at(-1)!.commitId;
    before = after;
  }
  await act(workspace, { type: 'upload', taskId: task, expectedHead: base, commits });
  return commits;
}
/** 为任务建 PR、请求审核并生成候选；返回候选。 */
async function candidateOf(workspace: MemoryWorkspace, task: string, resolutions: unknown[] = []) {
  const pr = `pr-${task}`;
  if (!workspace.state.prs[pr]) {
    await act(workspace, { type: 'pr', id: pr, taskId: task, title: task, description: '', target: 'shared' });
    await act(workspace, { type: 'pr_state', prId: pr, status: 'review', expectedRevision: 0 });
  }
  const revision = workspace.state.prs[pr].revision;
  const result = await act(workspace, { type: 'candidate', prId: pr, expectedRevision: revision, resolutions });
  return workspace.candidate(admin, String(result['candidateId']));
}
async function merge(workspace: MemoryWorkspace, task: string) {
  const candidate = await candidateOf(workspace, task);
  expect(candidate.checks).toEqual([]);
  return act(workspace, {
    type: 'merge',
    prId: `pr-${task}`,
    candidateId: candidate.id,
    expectedSource: candidate.source,
    expectedTarget: candidate.target
  });
}
const project = (title: string, fields: DataRow['fields'] = {}): DataRow => ({
  entity: 'Project',
  fields: { title, ...fields }
});
const milestone = (name: string, projectId: string, fields: DataRow['fields'] = {}): DataRow => ({
  entity: 'Milestone',
  fields: { name, dueOn: '2026-05-01', projectId, ...fields }
});
const tag = (label: string): DataRow => ({ entity: 'Tag', fields: { label } });
/** 去掉几条记录后的副本。 */
const without = (records: Records, ...ids: string[]): Records =>
  Object.fromEntries(Object.entries(records).filter(([id]) => !ids.includes(id)));
/** 候选检查的简写：`记录.字段: 文案`。 */
const issues = (checks: { recordId: string; field: string; message: string }[]) =>
  checks.map(check => `${check.recordId}.${check.field}: ${check.message}`);

describe('非资产清单走完整流程（AC#7）', () => {
  it('任务提交 → 候选检出违规 → 修正 → 审批 → 合并，规则全部来自清单', async () => {
    const workspace = MemoryWorkspace.create(
      { teamId: 'team', appId: 'app', name: 'Team', bootstrapKey: 'seed', admin, schema: planningSchema },
      env()
    );
    await act(workspace, {
      type: 'invite',
      id: 'invite',
      email: editor.email,
      permissions: ['read', 'review', 'comment'],
      tokenHash: 'token',
      expiresAt: 5000,
      expectedVersion: 0
    });
    await act(workspace, { type: 'accept_invite', id: 'invite', tokenHash: 'token' }, editor);
    const broken: Records = {
      p1: project('Apollo', { code: 'AP', budget: 100, stage: 'plan' }),
      p2: project('Apollo', { code: 'AP', budget: -1, stage: 'late' }),
      t1: tag('urgent'),
      m1: milestone('Kickoff', 'p1', { tagId: 't1', weight: 3 }),
      m2: milestone('Review', 'missing', { weight: 0.5 }),
      m3: { entity: 'Milestone', fields: { name: '  ', projectId: 'p1' } }
    };
    await started(workspace, 'plan', [broken]);
    const first = await candidateOf(workspace, 'plan');
    expect(issues(first.checks)).toEqual([
      'm2.projectId: 关联记录不存在',
      'm2.weight: 必须为整数',
      'm3.name: 必填文本不能为空',
      'm3.dueOn: 日期不能为空',
      'p2.title: 名称必须唯一',
      'p2.code: 取值必须唯一',
      'p2.budget: 必须为非负数',
      'p2.stage: 取值不在允许范围内'
    ]);
    // 检查未通过的候选不能批准
    expect(
      await codeOf(
        act(
          workspace,
          {
            type: 'review',
            prId: 'pr-plan',
            candidateId: first.id,
            expectedSource: first.source,
            stageId: 'review',
            decision: 'approve',
            reason: '',
            expectedRevision: 0
          },
          editor
        )
      )
    ).toBe('checks');
    const fixed: Records = {
      ...broken,
      p2: project('Gemini', { code: 'GE', budget: 5, stage: 'build' }),
      m2: milestone('Review', 'p2', { weight: 2 }),
      m3: milestone('Launch', 'p1')
    };
    await act(workspace, {
      type: 'upload',
      taskId: 'plan',
      expectedHead: 'plan-c1',
      commits: [sealed(workspace, 'plan-c2', 'plan-c1', broken, fixed)]
    });
    const second = await candidateOf(workspace, 'plan');
    expect(second.checks).toEqual([]);
    await act(
      workspace,
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
      editor
    );
    const merged = await act(workspace, {
      type: 'merge',
      prId: 'pr-plan',
      candidateId: second.id,
      expectedSource: second.source,
      expectedTarget: second.target
    });
    expect((await workspace.records(admin)).records).toEqual(fixed);
    expect(
      (await workspace.commit(admin, String(merged['head']))).changes.every(change => change.namespace === 'planning')
    ).toBe(true);
    // 键索引与共享记录一致：唯一键与外键都按清单维护
    expect(workspace.store.indexRows().map(key => `${key.recordId}:${key.kind}:${key.field}=${key.value}`)).toEqual(
      Object.entries(fixed)
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([id, row]) =>
          recordKeys(planningSchema, row).map(key => `${id}:${key.kind}:${key.field}=${key.value}`)
        )
    );
  });

  it('删除仍被引用的记录：未改动的引用方在候选里报关联记录不存在，可空关联同样不能悬空', async () => {
    const workspace = await open();
    const records: Records = {
      p1: project('Apollo'),
      t1: tag('urgent'),
      m1: milestone('Kickoff', 'p1', { tagId: 't1' }),
      m2: milestone('Review', 'p1')
    };
    await started(workspace, 'seed', [records]);
    await merge(workspace, 'seed');
    await started(workspace, 'remove', [without(records, 'p1', 't1')]);
    expect(issues((await candidateOf(workspace, 'remove')).checks)).toEqual([
      'm1.projectId: 关联记录不存在',
      'm1.tagId: 关联记录不存在',
      'm2.projectId: 关联记录不存在'
    ]);
  });

  it('改名撞上未改动记录的唯一值：按记录标识排在后面的报错，即使那是没改动的一方', async () => {
    const workspace = await open();
    await started(workspace, 'seed', [{ b: tag('alpha'), c: tag('beta') }]);
    await merge(workspace, 'seed');
    await started(workspace, 'rename', [{ b: tag('alpha'), c: tag('beta'), a: tag('beta'), d: tag('alpha') }]);
    expect(issues((await candidateOf(workspace, 'rename')).checks)).toEqual([
      'c.label: 名称必须唯一',
      'd.label: 名称必须唯一'
    ]);
  });
});

describe('上传时校验变更能应用到父内容', () => {
  /** 共享分支有 p1、t1，任务从共享头起步并已上传一个提交（改了 t1）。 */
  async function seeded() {
    const workspace = await open();
    const shared: Records = { p1: project('Apollo', { budget: 10 }), t1: tag('urgent') };
    await started(workspace, 'seed', [shared]);
    await merge(workspace, 'seed');
    const edited: Records = { ...shared, t1: tag('later') };
    await started(workspace, 'task', [edited]);
    return { workspace, edited };
  }
  const change = (patch: Partial<ChangeSet>): ChangeSet => ({
    namespace: 'planning',
    entity: 'Project',
    entityId: 'p1',
    operation: 'update',
    patch: { budget: 20 },
    inversePatch: { budget: 10 },
    ...patch
  });
  const upload = async (workspace: MemoryWorkspace, changes: ChangeSet[][]) => {
    const commits: Commit[] = [];
    let parent = 'task-c1';
    for (const [index, list] of changes.entries()) {
      commits.push(
        taskCommit({ id: `next-${index}`, parent, authorId: admin.id, message: `next-${index}`, changes: list })
      );
      parent = commits.at(-1)!.commitId;
    }
    return act(workspace, { type: 'upload', taskId: 'task', expectedHead: 'task-c1', commits });
  };
  it('吻合的变更正常接受：修改按原值核对，新增的记录原来不存在，删除带整行', async () => {
    const { workspace } = await seeded();
    await upload(workspace, [
      [change({})],
      [change({ entity: 'Tag', entityId: 't2', operation: 'insert', patch: { label: 'new' }, inversePatch: null })],
      [change({ entity: 'Tag', entityId: 't1', operation: 'delete', patch: null, inversePatch: { label: 'later' } })]
    ]);
    expect(workspace.state.tasks['task'].head).toBe('next-2');
  });
  it.each([
    ['修改的原值不符', [change({ inversePatch: { budget: 99 } })]],
    ['修改新增的字段原来已存在', [change({ patch: { title: 'Other' }, inversePatch: {} })]],
    ['修改的记录不存在', [change({ entityId: 'nobody' })]],
    ['修改的记录是另一种实体', [change({ entityId: 't1' })]],
    ['新增的记录已存在', [change({ operation: 'insert', patch: { title: 'Apollo', budget: 10 }, inversePatch: null })]],
    ['删除的整行不符', [change({ operation: 'delete', patch: null, inversePatch: { title: 'Apollo' } })]],
    [
      '删除用的是共享分支上的旧值（任务已改过它）',
      [change({ entity: 'Tag', entityId: 't1', operation: 'delete', patch: null, inversePatch: { label: 'urgent' } })]
    ]
  ])('不吻合时整批 invalid、零写入：%s', async (_name, changes) => {
    const { workspace } = await seeded();
    const before = structuredClone(workspace.state);
    const fine = [change({})];
    expect(await codeOf(upload(workspace, [fine, changes]))).toBe('invalid');
    expect(workspace.state.tasks).toEqual(before.tasks);
    expect((await workspace.store.commits(['next-0', 'next-1'])).size).toBe(0);
  });
  it.each([
    ['实体不在清单里', change({ entity: 'Asset' }), '实体不受支持'],
    ['命名空间与清单不符', change({ namespace: 'assets' }), '实体不受支持'],
    ['字段不在清单里', change({ patch: { owner: 'x' }, inversePatch: {} }), '字段不受支持'],
    ['主键不进补丁（它是单元的 entityId）', change({ patch: { id: 'x' }, inversePatch: {} }), '字段不受支持']
  ])('网络输入的实体与字段按清单白名单拒绝：%s', async (_name, wrong, message) => {
    const { workspace } = await seeded();
    await expect(upload(workspace, [[wrong]])).rejects.toMatchObject({ code: 'invalid', message });
  });
  it('系统字段按落库形态收下：working-tree 的修改单元带着这一刻的 updatedAt，与服务端记录里的值不比', async () => {
    const { workspace } = await seeded();
    await upload(workspace, [
      [
        change({
          patch: { budget: 20, updatedAt: '2026-11-18T02:00:00.000Z', updatedBy: admin.id },
          inversePatch: { budget: 10, updatedAt: '2026-11-18T01:00:00.000Z', updatedBy: null }
        })
      ]
    ]);
    expect((await workspace.commit(admin, 'next-0')).records['p1'].fields).toMatchObject({
      budget: 20,
      updatedAt: '2026-11-18T02:00:00.000Z',
      updatedBy: admin.id
    });
  });
  it('任务在共享分支推进之前起步：父内容由共享头反向应用之后的合并得到，按起步时的值核对', async () => {
    const workspace = await open();
    await started(workspace, 'seed', [{ p1: project('Apollo', { budget: 10 }) }]);
    await merge(workspace, 'seed');
    await act(workspace, { type: 'task', id: 'early', name: 'early', expectedHead: workspace.state.head });
    await started(workspace, 'bump', [{ p1: project('Apollo', { budget: 30 }) }]);
    await merge(workspace, 'bump');
    const base = workspace.state.tasks['early'].base;
    const commit = (inverse: number) =>
      taskCommit({
        id: `early-${inverse}`,
        parent: base,
        authorId: admin.id,
        message: 'early',
        changes: [change({ inversePatch: { budget: inverse } })]
      });
    const send = async (inverse: number) =>
      act(workspace, { type: 'upload', taskId: 'early', expectedHead: base, commits: [commit(inverse)] });
    expect(await codeOf(send(30))).toBe('invalid');
    expect(await codeOf(send(10))).toBe('ok');
  });
  it('另存分叉：新提交按原任务路径上它的父提交时的内容核对', async () => {
    const { workspace, edited } = await seeded();
    const second = sealed(workspace, 'task-c2', 'task-c1', edited, {
      ...edited,
      p1: project('Apollo', { budget: 50 })
    });
    await act(workspace, { type: 'upload', taskId: 'task', expectedHead: 'task-c1', commits: [second] });
    const carried = workspace.store.record('task-c1')!;
    const fork = (inverse: number) =>
      taskCommit({
        id: `fork-${inverse}`,
        parent: 'task-c1',
        authorId: admin.id,
        message: 'fork',
        changes: [change({ patch: { budget: 70 }, inversePatch: { budget: inverse } })]
      });
    const send = async (inverse: number) =>
      act(workspace, {
        type: 'fork',
        id: `forked-${inverse}`,
        name: 'forked',
        taskId: 'task',
        expectedHead: workspace.state.tasks['task'].base,
        commits: [carried, fork(inverse)]
      });
    expect(await codeOf(send(50))).toBe('invalid');
    expect(await codeOf(send(10))).toBe('ok');
  });
});

describe('读取量只与改动有关', () => {
  /** 共享分支有 `count` 个项目与其各两个里程碑，再有 `merges` 次各改一个项目预算的合并。 */
  async function populated(count: number, merges = 0) {
    const workspace = await open();
    const records: Records = {};
    for (let index = 0; index < count; index++) {
      records[`p${index}`] = project(`Project ${index}`, { code: `C${index}`, budget: index });
      records[`m${index}a`] = milestone(`A ${index}`, `p${index}`);
      records[`m${index}b`] = milestone(`B ${index}`, `p${index}`);
    }
    await started(workspace, 'seed', [records]);
    await merge(workspace, 'seed');
    let current = records;
    for (let round = 0; round < merges; round++) {
      const next = {
        ...current,
        [`p${round % count}`]: project(`Project ${round % count}`, { code: `C${round % count}`, budget: 1000 + round })
      };
      await started(workspace, `bump${round}`, [next]);
      await merge(workspace, `bump${round}`);
      current = next;
    }
    return { workspace, records: current };
  }
  /** 一个任务改几条记录：改名、删掉一个被引用的项目、新增引用已有项目的里程碑；统计生成候选与合并各自的读取。 */
  async function readsFor(count: number) {
    const { workspace, records } = await populated(count);
    const edited: Records = {
      ...without(records, 'p3'),
      p1: project('Renamed', { code: 'C1', budget: 1 }),
      extra: milestone('Extra', 'p2')
    };
    await started(workspace, 'edit', [edited]);
    await act(workspace, {
      type: 'pr',
      id: 'pr-edit',
      taskId: 'edit',
      title: 'edit',
      description: '',
      target: 'shared'
    });
    await act(workspace, { type: 'pr_state', prId: 'pr-edit', status: 'review', expectedRevision: 0 });
    workspace.store.resetStats();
    const result = await act(workspace, { type: 'candidate', prId: 'pr-edit', expectedRevision: 1, resolutions: [] });
    const candidate = { ...workspace.store.stats, calls: [...workspace.store.stats.calls] };
    const stored = await workspace.candidate(admin, String(result['candidateId']));
    expect(stored.checks.map(check => `${check.recordId}.${check.field}`)).toEqual(['m3a.projectId', 'm3b.projectId']);
    // 与在完整的合并结果上检查相同
    expect(stored.checks).toEqual(checkRecords(planningSchema, stored.records));
    return { candidate };
  }
  it('生成候选只读改动过的记录与跨记录检查需要的记录：共享记录 300 条与 3000 条时读取量相同', async () => {
    const small = await readsFor(100);
    const large = await readsFor(1000);
    expect(large).toEqual(small);
    expect(small.candidate.records).toBeLessThan(20);
  });
  it('合并重新核对同样只读改动过的记录', async () => {
    const reads = async (count: number) => {
      const { workspace, records } = await populated(count);
      await started(workspace, 'edit', [{ ...records, p0: project('Changed', { code: 'C0' }) }]);
      const candidate = await candidateOf(workspace, 'edit');
      workspace.store.resetStats();
      await act(workspace, {
        type: 'merge',
        prId: 'pr-edit',
        candidateId: candidate.id,
        expectedSource: candidate.source,
        expectedTarget: candidate.target
      });
      return { ...workspace.store.stats, calls: [...workspace.store.stats.calls] };
    };
    const small = await reads(100);
    expect(await reads(1000)).toEqual(small);
    expect(small.records).toBeLessThan(10);
  });
  it('上传只按被改动记录推导父内容：读取量与共享分支的合并次数、其他任务都无关', async () => {
    const reads = async (merges: number) => {
      const { workspace, records } = await populated(20, merges);
      const [first] = await started(workspace, 'mine', [{ ...records, p5: project('Five', { code: 'C5' }) }]);
      const next = sealed(
        workspace,
        'mine-c2',
        first.commitId,
        { ...records, p5: project('Five', { code: 'C5' }) },
        {
          ...records,
          p5: project('Five', { code: 'C5', budget: 7 })
        }
      );
      workspace.store.resetStats();
      await act(workspace, { type: 'upload', taskId: 'mine', expectedHead: first.commitId, commits: [next] });
      return { ...workspace.store.stats, calls: [...workspace.store.stats.calls] };
    };
    const few = await reads(2);
    expect(await reads(40)).toEqual(few);
    expect(few.records).toBe(1);
  });
});

describe('登记新的数据模式版本', () => {
  const version = (schemaVersion: number, entities = [Project, Milestone, Tag]) => manifestOf(entities, schemaVersion);
  it('只有成员管理者能登记，版本必须更高；登记后候选过期、旧版本仍可按版本读取', async () => {
    const workspace = await open();
    await act(workspace, {
      type: 'invite',
      id: 'invite',
      email: editor.email,
      permissions: ['read', 'edit'],
      tokenHash: 'token',
      expiresAt: 5000,
      expectedVersion: 0
    });
    await act(workspace, { type: 'accept_invite', id: 'invite', tokenHash: 'token' }, editor);
    await started(workspace, 'seed', [{ p1: project('Apollo') }]);
    const candidate = await candidateOf(workspace, 'seed');
    expect(await codeOf(act(workspace, { type: 'schema', schema: version(2), expectedVersion: 1 }, editor))).toBe(
      'forbidden'
    );
    expect(await codeOf(act(workspace, { type: 'schema', schema: version(1), expectedVersion: 1 }))).toBe('invalid');
    expect(await codeOf(act(workspace, { type: 'schema', schema: version(3), expectedVersion: 2 }))).toBe('stale');
    expect(await act(workspace, { type: 'schema', schema: version(3), expectedVersion: 1 })).toEqual({
      schemaVersion: 3
    });
    expect(workspace.state.schemaVersion).toBe(3);
    expect((await workspace.summary(admin)).schemaVersion).toBe(3);
    expect(await workspace.schema(admin, 1)).toEqual(planningSchema);
    expect((await workspace.schema(admin, 3)).schemaVersion).toBe(3);
    expect(await codeOf(workspace.schema(admin, 2))).toBe('not_found');
    expect(JSON.stringify(workspace.state.audit.at(-1))).not.toContain('"entities"');
    expect(
      await codeOf(
        act(workspace, {
          type: 'merge',
          prId: 'pr-seed',
          candidateId: candidate.id,
          expectedSource: candidate.source,
          expectedTarget: candidate.target
        })
      )
    ).toBe('stale');
  });
  it('新清单必须让当前共享记录全部通过，否则拒绝并给出违规明细；通过后按新清单重建键索引', async () => {
    const workspace = await open();
    const shared: Records = { p1: project('Apollo'), p2: project('Zeus'), t1: tag('urgent') };
    await started(workspace, 'seed', [shared]);
    await merge(workspace, 'seed');
    // 新版本不再有标签实体：现有的 t1 不再合法
    const withoutTags = structuredClone(version(2));
    withoutTags.entities = withoutTags.entities
      .filter(entity => entity.entity !== 'Tag')
      .map(entity => ({ ...entity, fields: entity.fields.filter(field => field.field !== 'tag') }));
    await expect(act(workspace, { type: 'schema', schema: withoutTags, expectedVersion: 1 })).rejects.toMatchObject({
      code: 'checks',
      message: '共享数据不符合新的数据模式',
      details: { checks: [{ recordId: 't1', field: '$record', message: '实体不受支持' }], total: 1 }
    });
    // 新版本把项目代号改成必填：两个项目都没有代号
    const required = structuredClone(version(2));
    const code = required.entities[0].fields.find(field => field.field === 'code')!;
    Object.assign(code, { required: true });
    await expect(act(workspace, { type: 'schema', schema: required, expectedVersion: 1 })).rejects.toMatchObject({
      details: {
        checks: [
          { recordId: 'p1', field: 'code', message: '必填文本不能为空' },
          { recordId: 'p2', field: 'code', message: '必填文本不能为空' }
        ],
        total: 2
      }
    });
    expect(workspace.state.schemaVersion).toBe(1);
    // 新版本让标签的颜色唯一：现有数据通过，键索引按新清单重建（多出颜色以外没有新键，标签名仍是唯一键）
    const unique = structuredClone(version(2));
    Object.assign(
      unique.entities[2].fields.find(field => field.field === 'color')!,
      { unique: true }
    );
    await act(workspace, { type: 'schema', schema: unique, expectedVersion: 1 });
    expect(workspace.store.indexRows().map(key => `${key.recordId}:${key.kind}:${key.field}`)).toEqual([
      'p1:unique:title',
      'p2:unique:title',
      't1:unique:label'
    ]);
    // 之后的合并按新清单检查
    await started(workspace, 'colors', [
      {
        ...shared,
        t1: { entity: 'Tag', fields: { label: 'urgent', color: 'red' } },
        t2: { entity: 'Tag', fields: { label: 'later', color: 'red' } }
      }
    ]);
    expect(issues((await candidateOf(workspace, 'colors')).checks)).toEqual(['t2.color: 取值必须唯一']);
  });
  it('清单的格式严格解析，资产清单与非资产清单都能登记', async () => {
    const workspace = await open();
    expect(await codeOf(act(workspace, { type: 'schema', schema: { schemaVersion: 2 }, expectedVersion: 1 }))).toBe(
      'invalid'
    );
    await act(workspace, { type: 'schema', schema: { ...assetSchema, schemaVersion: 2 }, expectedVersion: 1 });
    expect(workspace.state.schema.entities.map(entity => entity.entity)).toEqual([
      'AssetCategory',
      'Asset',
      'AssetEvent'
    ]);
  });
});

describe('特殊业务检查的扩展点', () => {
  it('默认没有；注入后对合并改动过的记录追加检查，结果进候选，也在合并时重新核对', async () => {
    const seen: string[][] = [];
    let strict = true;
    const noBuildWithoutBudget: RecordCheck = ({ schema, changed }) => {
      expect(schema.schemaVersion).toBe(1);
      seen.push(changed.map(item => item.id));
      return changed.flatMap(item =>
        (
          strict &&
          item.after?.entity === 'Project' &&
          item.after.fields['stage'] === 'build' &&
          item.after.fields['budget'] == null
        ) ?
          [{ recordId: item.id, field: 'budget', message: '必填项不能为空' }]
        : []
      );
    };
    const plain = await open();
    await started(plain, 'task', [{ p1: project('Apollo', { stage: 'build' }) }]);
    expect((await candidateOf(plain, 'task')).checks).toEqual([]);
    const workspace = await open(planningSchema, { checks: noBuildWithoutBudget });
    await started(workspace, 'seed', [{ p0: project('Base') }]);
    await merge(workspace, 'seed');
    await started(workspace, 'task', [{ p0: project('Base'), p1: project('Apollo', { stage: 'build' }) }]);
    const candidate = await candidateOf(workspace, 'task');
    expect(issues(candidate.checks)).toEqual(['p1.budget: 必填项不能为空']);
    expect(seen.at(-1)).toEqual(['p1']);
    strict = false;
    const relaxed = await candidateOf(workspace, 'task');
    expect(relaxed.checks).toEqual([]);
    strict = true;
    // 合并时重新核对：扩展检查的结果变了，候选内容与重新检查的结果不一致
    expect(
      await codeOf(
        act(workspace, {
          type: 'merge',
          prId: 'pr-task',
          candidateId: relaxed.id,
          expectedSource: relaxed.source,
          expectedTarget: relaxed.target
        })
      )
    ).toBe('checks');
  });
});
