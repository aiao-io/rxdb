import {
  checkCommitExchangeBatch,
  computeCommitExchangeRecordFingerprint,
  parseCommitExchangeRecord
} from '@aiao/rxdb-plugin-working-tree/exchange';
import { describe, expect, it } from 'vitest';
import { taskCommit } from '../commit.testing.js';
import type { ChangeSet, Command, Commit, Identity, Records } from '../model.js';
import { assetSchema, diffAssets } from '../schema.testing.js';
import { MemoryWorkspace } from './memory.testing.js';

/**
 * 协作提交协议切换为平台 working-tree 交换格式（ADMIN-US-221 第一部分）：共享分支从 baseline 根起步，
 * 任务提交是普通提交，合并提交有两个父，服务端存的、下发的都是同一份交换记录，并且都过得了平台导入的批次规则。
 */
const admin: Identity = { id: 'admin', email: 'admin@example.test', verified: true };
const other: Identity = { id: 'other', email: 'other@example.test', verified: true };
let serial = 0;
/** 服务端标识生成器：与生产一样产出 UUID（合并提交与单元 ID 由它给出），用例里按序号可读。 */
const env = () => ({
  now: Date.UTC(2026, 10, 18),
  id: () => `0193c4e0-0000-7000-8000-${String(++serial).padStart(12, '0')}`
});
const act = (space: MemoryWorkspace, command: Record<string, unknown>, actor = admin) =>
  space.run(actor, { operationId: `operation-${++serial}`, ...command } as Command, env());
/** 新工作区，审批策略改成免审批（合并只看检查与冲突）。 */
async function create() {
  const space = MemoryWorkspace.create(
    { teamId: 'team', appId: 'assets', name: 'Team', bootstrapKey: 'seed', admin, schema: assetSchema },
    env()
  );
  await act(space, { type: 'policy', stages: [], expectedVersion: 1 });
  return space;
}
const content = async (space: MemoryWorkspace, id: string) => (await space.commit(admin, id)).records;
/** 把记录从提交 `parent` 的内容改成 `after` 的普通提交。 */
async function commitOf(space: MemoryWorkspace, id: string, parent: string, after: Records, author = admin) {
  return taskCommit({
    id,
    parent,
    authorId: author.id,
    message: id,
    changes: diffAssets(await content(space, parent), after)
  });
}
/** 线上往返之后交给平台的批次判定：createdAt 还原成 Date。 */
const asRecords = (commits: readonly Commit[]) =>
  commits.map(commit => parseCommitExchangeRecord(JSON.parse(JSON.stringify(commit))));
const category = (name: string): Records => ({ c: { entity: 'AssetCategory', fields: { name } } });

async function mergedTask(space: MemoryWorkspace, task: string, after: Records) {
  const base = space.state.head;
  await act(space, { type: 'task', id: task, name: task, expectedHead: base });
  const commit = await commitOf(space, `${task}-1`, base, after);
  await act(space, { type: 'upload', taskId: task, expectedHead: base, commits: [commit] });
  await act(space, { type: 'pr', id: `${task}-pr`, taskId: task, title: task, description: '', target: 'shared' });
  await act(space, { type: 'pr_state', prId: `${task}-pr`, status: 'review', expectedRevision: 0 });
  await act(space, { type: 'candidate', prId: `${task}-pr`, expectedRevision: 1, resolutions: [] });
  const pr = space.state.prs[`${task}-pr`];
  const merged = await act(space, {
    type: 'merge',
    prId: pr.id,
    candidateId: pr.candidateId,
    expectedSource: commit.commitId,
    expectedTarget: base
  });
  return { base, commit, merge: String(merged['head']) };
}

describe('共享分支根：初始化写下一个 baseline 提交作为共享头的初值', () => {
  it('根没有父、没有作者、没有单元，消息非空，指纹由平台函数计算；共享头与根相同，内容为空记录', async () => {
    const space = await create();
    const root = space.store.record(space.state.root)!;
    expect(space.state.head).toBe(space.state.root);
    expect(root).toMatchObject({ kind: 'baseline', parentIds: [], authorId: null, units: [] });
    expect(root.message.trim()).not.toBe('');
    expect(root.contentFingerprint).toBe(computeCommitExchangeRecordFingerprint(root));
    expect(checkCommitExchangeBatch(asRecords([root]))).toBeUndefined();
    expect(await content(space, root.commitId)).toEqual({});
    expect((await space.records(admin)).head).toBe(root.commitId);
  });
  it('新任务从根分叉：共同起点与任务头都是根，任务分支上还没有提交', async () => {
    const space = await create();
    await act(space, { type: 'task', id: 't', name: 't', expectedHead: space.state.root });
    expect(space.state.tasks['t']).toMatchObject({ base: space.state.root, head: space.state.root });
    await expect(act(space, { type: 'task', id: 'u', name: 'u', expectedHead: 'elsewhere' })).rejects.toThrow(/版本/);
  });
});

describe('任务提交：平台交换记录，首个新提交的第一父是任务头', () => {
  it('按原样存下上传的记录：提交 ID、父、种类、消息、作者、时间、指纹与每个单元都不改写', async () => {
    const space = await create();
    const root = space.state.root;
    await act(space, { type: 'task', id: 't', name: 't', expectedHead: root });
    const first = await commitOf(space, 'a', root, category('电脑'));
    const second = taskCommit({
      id: 'b',
      parent: 'a',
      authorId: admin.id,
      message: 'b',
      changes: diffAssets(category('电脑'), category('笔记本'))
    });
    expect(await act(space, { type: 'upload', taskId: 't', expectedHead: root, commits: [first, second] })).toEqual({
      taskId: 't',
      head: 'b'
    });
    expect(space.store.record('a')).toEqual(first);
    expect(space.store.record('b')).toEqual(second);
    expect(await content(space, 'b')).toEqual(category('笔记本'));
  });
  it('按协作的规则拒绝：不是普通提交、父链不接任务头、作者不是本人、指纹不符、单元超出清单或与父内容不符', async () => {
    const space = await create();
    const root = space.state.root;
    await act(space, { type: 'task', id: 't', name: 't', expectedHead: root });
    const good = await commitOf(space, 'a', root, category('电脑'));
    const upload = (commit: Commit) =>
      act(space, { type: 'upload', taskId: 't', expectedHead: root, commits: [commit] });
    const resealed = (commit: Omit<Commit, 'contentFingerprint'>): Commit => ({
      ...commit,
      contentFingerprint: computeCommitExchangeRecordFingerprint(commit)
    });
    const unit = good.units[0];
    const cases: [Commit, Record<string, unknown>][] = [
      [
        resealed({ ...good, kind: 'merge', parentIds: [root, 'x'] }),
        { code: 'invalid', message: '任务提交必须是普通提交' }
      ],
      [resealed({ ...good, parentIds: [] }), { code: 'ancestry', message: '提交父链不连续' }],
      [resealed({ ...good, parentIds: ['elsewhere'] }), { code: 'ancestry', message: '提交父链不连续' }],
      [
        await commitOf(space, 'a', root, category('电脑'), other),
        { code: 'forbidden', message: '新提交作者必须是当前用户' }
      ],
      [
        { ...good, message: 'tampered' },
        { code: 'invalid', message: '提交指纹与内容不一致', details: { commitId: 'a' } }
      ],
      [
        resealed({ ...good, units: [{ ...unit, patch: { unknown: 'x' } }] }),
        { code: 'invalid', message: '字段不受支持' }
      ],
      [resealed({ ...good, units: [{ ...unit, namespace: 'other' }] }), { code: 'invalid', message: '实体不受支持' }],
      [
        resealed({ ...good, units: [{ ...unit, operation: 'update', inversePatch: { name: '台式机' } }] }),
        { code: 'invalid', message: '提交内容与其父提交不一致' }
      ]
    ];
    for (const [commit, error] of cases)
      await expect(upload(commit), JSON.stringify(error)).rejects.toMatchObject(error);
    expect(space.state.tasks['t'].head).toBe(root);
    expect(space.store.record('a')).toBeUndefined();
  });
  it('同 ID 同指纹的重传不重复写入，同 ID 不同内容拒绝', async () => {
    const space = await create();
    const root = space.state.root;
    await act(space, { type: 'task', id: 't', name: 't', expectedHead: root });
    const first = await commitOf(space, 'a', root, category('电脑'));
    await act(space, { type: 'upload', taskId: 't', expectedHead: root, commits: [first] });
    await act(space, {
      type: 'fork',
      id: 'f',
      name: 'f',
      taskId: 't',
      expectedHead: root,
      commits: [
        first,
        taskCommit({
          id: 'f1',
          parent: 'a',
          authorId: admin.id,
          message: 'f1',
          changes: diffAssets(category('电脑'), category('平板'))
        })
      ]
    });
    expect(space.state.tasks['f']).toMatchObject({ base: root, head: 'f1' });
    const changed = taskCommit({ id: 'a', parent: root, authorId: admin.id, message: 'other', changes: first.units });
    await expect(
      act(space, { type: 'fork', id: 'g', name: 'g', taskId: 't', expectedHead: root, commits: [changed] })
    ).rejects.toMatchObject({ code: 'idempotency' });
  });
});

describe('合并提交：两个父，单元相对第一父（共享头），平台函数算指纹', () => {
  it('第一次合并以根为第一父、任务头为第二父；与任务提交一起过得了平台导入的批次规则', async () => {
    const space = await create();
    const { base, commit, merge } = await mergedTask(space, 't', category('电脑'));
    const record = space.store.record(merge)!;
    expect(record).toMatchObject({
      kind: 'merge',
      parentIds: [base, commit.commitId],
      authorId: admin.id,
      message: 'Merge t'
    });
    expect(record.contentFingerprint).toBe(computeCommitExchangeRecordFingerprint(record));
    // 单元相对第一父：根是空记录，所以这次合并就是新增这条分类；整次合并是一笔原子写
    expect(record.units).toEqual([
      {
        unitId: merge,
        transactionId: null,
        namespace: 'assets',
        entity: 'AssetCategory',
        entityId: 'c',
        operation: 'insert',
        patch: { name: '电脑' },
        inversePatch: null,
        origin: 'local'
      }
    ]);
    const root = space.store.record(base)!;
    expect(checkCommitExchangeBatch(asRecords([root, commit, record]))).toBeUndefined();
    expect(space.state.head).toBe(merge);
  });
  it('后续合并以上一个共享头为第一父；单元是合并结果相对它的增量', async () => {
    const space = await create();
    const first = await mergedTask(space, 't', category('电脑'));
    const second = await mergedTask(space, 'u', category('笔记本'));
    const record = space.store.record(second.merge)!;
    expect(record.parentIds).toEqual([first.merge, second.commit.commitId]);
    expect(record.units.map(({ operation, patch, inversePatch }) => ({ operation, patch, inversePatch }))).toEqual([
      { operation: 'update', patch: { name: '笔记本' }, inversePatch: { name: '电脑' } }
    ]);
    expect(checkCommitExchangeBatch(asRecords([second.commit, record]))).toBeUndefined();
  });
});

describe('落库形态：sqlite-wasm 上 working-tree 捕获的单元带系统字段，服务端原样收下、不因簿记字段冲突', () => {
  it('两个任务各改同一条记录的不同字段，单元都带自己的 updatedAt：合并没有冲突', async () => {
    const space = await create();
    const root = space.state.root;
    const row = {
      name: '电脑',
      description: '旧',
      createdAt: '2026-11-18T01:00:00.000Z',
      updatedAt: '2026-11-18T01:00:00.000Z',
      createdBy: admin.id,
      updatedBy: admin.id
    };
    const insert: ChangeSet = {
      namespace: 'assets',
      entity: 'AssetCategory',
      entityId: 'c',
      operation: 'insert',
      patch: row,
      inversePatch: null
    };
    const seed = taskCommit({ id: 's1', parent: root, authorId: admin.id, message: 's1', changes: [insert] });
    await act(space, { type: 'task', id: 's', name: 's', expectedHead: root });
    await act(space, { type: 'upload', taskId: 's', expectedHead: root, commits: [seed] });
    await act(space, { type: 'pr', id: 'sp', taskId: 's', title: 's', description: '', target: 'shared' });
    await act(space, { type: 'pr_state', prId: 'sp', status: 'review', expectedRevision: 0 });
    await act(space, { type: 'candidate', prId: 'sp', expectedRevision: 1, resolutions: [] });
    await act(space, {
      type: 'merge',
      prId: 'sp',
      candidateId: space.state.prs['sp'].candidateId,
      expectedSource: 's1',
      expectedTarget: root
    });
    const base = space.state.head;
    const edit = (id: string, field: string, value: string, at: string): Commit =>
      taskCommit({
        id,
        parent: base,
        authorId: admin.id,
        message: id,
        changes: [
          {
            ...insert,
            operation: 'update',
            patch: { [field]: value, updatedAt: at },
            // 设备上的 updatedAt 是它导入那一刻写下的，与服务端记录不同：核对不比系统字段
            inversePatch: { [field]: row[field as 'name' | 'description'], updatedAt: '2026-11-18T01:30:00.000Z' }
          }
        ]
      });
    for (const [task, commit] of [
      ['n', edit('n1', 'name', '台式机', '2026-11-18T02:00:00.000Z')],
      ['d', edit('d1', 'description', '新', '2026-11-18T03:00:00.000Z')]
    ] as const) {
      await act(space, { type: 'task', id: task, name: task, expectedHead: base });
      await act(space, { type: 'upload', taskId: task, expectedHead: base, commits: [commit] });
      await act(space, { type: 'pr', id: `${task}p`, taskId: task, title: task, description: '', target: 'shared' });
      await act(space, { type: 'pr_state', prId: `${task}p`, status: 'review', expectedRevision: 0 });
    }
    for (const task of ['n', 'd']) {
      const pr = space.state.prs[`${task}p`];
      await act(space, { type: 'candidate', prId: pr.id, expectedRevision: pr.revision, resolutions: [] });
      const candidate = space.state.candidates[space.state.prs[pr.id].candidateId!];
      expect(candidate.conflicts).toEqual([]);
      await act(space, {
        type: 'merge',
        prId: pr.id,
        candidateId: candidate.id,
        expectedSource: candidate.source,
        expectedTarget: space.state.head
      });
    }
    expect((await space.records(admin)).records['c'].fields).toMatchObject({ name: '台式机', description: '新' });
  });
});
