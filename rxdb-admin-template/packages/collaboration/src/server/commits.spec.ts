import { describe, expect, it, vi } from 'vitest';
import { diffRecords } from '../changes.js';
import { commitFingerprint, sealCommit, uuidv7 } from '../commit.js';
import type { Command, Commit, DataRow, Identity, Records } from '../model.js';
import { execute, plan } from './engine.js';
import { MemoryWorkspace } from './memory.testing.js';

const admin: Identity = { id: 'admin', email: 'admin@example.test', verified: true };
let serial = 0;
const env = () => ({ now: 1000, id: () => `generated-${++serial}` });
const create = () =>
  MemoryWorkspace.create({ teamId: 'team', appId: 'assets', name: 'Team', bootstrapKey: 'seed', admin }, env());
const act = (workspace: MemoryWorkspace, command: Omit<Command, 'operationId'> | Record<string, unknown>) =>
  workspace.run(admin, { ...command, operationId: `operation-${++serial}` } as Command, env());
/** 相对 `parent` 的提交内容换算成字段级变更并封上指纹；`parent` 的内容由服务端推导，所以它必须已经上传。 */
async function commit(
  workspace: MemoryWorkspace,
  id: string,
  parent: string | null,
  after: Records,
  message = id
): Promise<Commit> {
  const before = parent === null ? {} : (await workspace.commit(admin, parent)).records;
  return sealCommit({ id, parent, authorId: admin.id, message, changes: diffRecords(before, after) });
}
const category = (name: string, description?: string): DataRow => ({
  entity: 'AssetCategory',
  fields: description === undefined ? { name } : { name, description }
});
/** 一个任务加上它的第一个提交。 */
async function started(workspace: MemoryWorkspace, task: string, commits: Records[]) {
  const base = workspace.state.head;
  await act(workspace, { type: 'task', id: task, name: task, expectedHead: base });
  const sealed: Commit[] = [];
  let parent = base;
  let before: Records = base === null ? {} : (await workspace.commit(admin, base)).records;
  for (const [index, records] of commits.entries()) {
    const next = await sealCommit({
      id: `${task}-c${index + 1}`,
      parent,
      authorId: admin.id,
      message: `${task}-c${index + 1}`,
      changes: diffRecords(before, records)
    });
    sealed.push(next);
    parent = next.id;
    before = records;
  }
  await act(workspace, { type: 'upload', taskId: task, expectedHead: base, commits: sealed });
  return sealed;
}
/** 把任务合并进共享分支（免审批策略）。 */
async function merge(workspace: MemoryWorkspace, task: string) {
  const pr = `pr-${task}`;
  await act(workspace, { type: 'pr', id: pr, taskId: task, title: task, description: '', target: 'shared' });
  await act(workspace, { type: 'pr_state', prId: pr, status: 'review', expectedRevision: 0 });
  const revision = workspace.state.prs[pr].revision;
  const candidate = await act(workspace, { type: 'candidate', prId: pr, expectedRevision: revision, resolutions: [] });
  const stored = workspace.state.candidates[String(candidate['candidateId'])];
  return act(workspace, {
    type: 'merge',
    prId: pr,
    candidateId: stored.id,
    expectedSource: stored.source,
    expectedTarget: stored.target
  });
}
async function open() {
  const workspace = create();
  await act(workspace, { type: 'policy', stages: [], expectedVersion: 1 });
  return workspace;
}

describe('content fingerprint verification', () => {
  it('rejects an upload whose fingerprint does not match its content and stores nothing', async () => {
    const workspace = await open();
    await act(workspace, { type: 'task', id: 't', name: 't', expectedHead: null });
    const honest = await commit(workspace, 'c1', null, { a: category('A') });
    const forged = { ...honest, message: 'Tampered after signing' };
    const before = structuredClone(workspace.state);
    await expect(
      act(workspace, { type: 'upload', taskId: 't', expectedHead: null, commits: [forged] })
    ).rejects.toMatchObject({ code: 'invalid', message: '提交指纹与内容不一致' });
    expect(workspace.state).toEqual(before);
    expect((await workspace.store.commits(['c1'])).size).toBe(0);
  });
  it('rejects the whole batch when any one commit is forged, whichever content part was altered', async () => {
    const workspace = await open();
    await act(workspace, { type: 'task', id: 't', name: 't', expectedHead: null });
    const first = await commit(workspace, 'c1', null, { a: category('A') });
    const second = await sealCommit({
      id: 'c2',
      parent: 'c1',
      authorId: admin.id,
      message: 'Second',
      changes: diffRecords({ a: category('A') }, { a: category('B') })
    });
    const forgeries: Commit[] = [
      { ...second, changes: diffRecords({ a: category('A') }, { a: category('Other') }) },
      { ...second, authorId: 'someone-else' },
      { ...second, parent: null },
      { ...second, fingerprint: await commitFingerprint({ ...second, message: 'Different' }) },
      { ...second, fingerprint: 'f'.repeat(64) }
    ];
    for (const forged of forgeries)
      await expect(
        act(workspace, { type: 'upload', taskId: 't', expectedHead: null, commits: [first, forged] })
      ).rejects.toMatchObject({ code: 'invalid', message: '提交指纹与内容不一致' });
    expect((await workspace.store.commits(['c1', 'c2'])).size).toBe(0);
    expect(workspace.state.tasks['t'].head).toBeNull();
  });
  it('verifies the commits of a fork as well', async () => {
    const workspace = await open();
    await started(workspace, 't', [{ a: category('A') }]);
    const honest = await commit(workspace, 'x1', null, { a: category('Fork') });
    await expect(
      act(workspace, {
        type: 'fork',
        id: 'f',
        name: 'f',
        taskId: 't',
        expectedHead: null,
        commits: [{ ...honest, changes: [] }]
      })
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(workspace.state.tasks['f']).toBeUndefined();
  });
  it('lets the server-made merge commit carry its own fingerprint over parent, author, message and changes', async () => {
    const workspace = await open();
    await started(workspace, 't', [{ a: category('A') }]);
    const merged = await merge(workspace, 't');
    const head = String(merged['head']);
    const stored = (await workspace.store.commits([head])).get(head)!;
    const [changes] = (await workspace.store.changes([head])).values();
    expect(stored.fingerprint).toBe(
      await commitFingerprint({ parent: null, authorId: admin.id, message: 'Merge t', changes })
    );
    expect(stored).toMatchObject({ mergeSource: 't-c1', parent: null, authorId: 'admin' });
  });
});

describe('retransmitted commits', () => {
  it('accepts a fork that repeats existing ancestors unchanged, without writing them again', async () => {
    const workspace = await open();
    const [first, second] = await started(workspace, 't', [
      { a: category('A') },
      { a: category('A'), b: category('B') }
    ]);
    const stored = (await workspace.store.commits([first.id, second.id])).get(first.id)!;
    const extra = await commit(workspace, 'x3', second.id, { a: category('A'), b: category('B'), c: category('C') });
    const append = vi.spyOn(workspace.store, 'append');
    await act(workspace, {
      type: 'fork',
      id: 'f',
      name: 'f',
      taskId: 't',
      expectedHead: null,
      commits: [first, second, extra]
    });
    expect(workspace.state.tasks['f'].head).toBe('x3');
    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0][0].map(item => item.id)).toEqual(['x3']);
    expect((await workspace.store.commits([first.id])).get(first.id)).toEqual(stored);
    expect((await workspace.commit(admin, 'x3')).records).toEqual({
      a: category('A'),
      b: category('B'),
      c: category('C')
    });
  });
  it('rejects the same commit id with different content or authorship', async () => {
    const workspace = await open();
    const [first] = await started(workspace, 't', [{ a: category('A') }]);
    const changed = await sealCommit({ ...first, changes: diffRecords({}, { a: category('Other') }) });
    const reauthored = await sealCommit({ ...first, authorId: 'mallory' });
    for (const resent of [changed, reauthored, await sealCommit({ ...first, message: 'Renamed' })])
      await expect(
        act(workspace, { type: 'fork', id: 'f', name: 'f', taskId: 't', expectedHead: null, commits: [resent] })
      ).rejects.toThrow(/不能修改内容或作者/);
    expect(workspace.state.tasks['f']).toBeUndefined();
  });
  it('rejects an existing commit that belongs to another task', async () => {
    const workspace = await open();
    await started(workspace, 't', [{ a: category('A') }]);
    const [foreign] = await started(workspace, 'other', [{ z: category('Z') }]);
    await expect(
      act(workspace, { type: 'fork', id: 'f', name: 'f', taskId: 't', expectedHead: null, commits: [foreign] })
    ).rejects.toThrow(/不能接管/);
    await expect(
      act(workspace, { type: 'upload', taskId: 't', expectedHead: 't-c1', commits: [foreign] })
    ).rejects.toThrow(/父链|不能接管/);
  });
  it('rejects a chain that repeats a commit id, loops onto itself or skips its parent', async () => {
    const workspace = await open();
    await act(workspace, { type: 'task', id: 't', name: 't', expectedHead: null });
    const first = await commit(workspace, 'c1', null, { a: category('A') });
    const again = await sealCommit({ id: 'c1', parent: 'c1', authorId: admin.id, message: 'c1', changes: [] });
    const loop = await sealCommit({ id: 'c2', parent: 'c2', authorId: admin.id, message: 'c2', changes: [] });
    const orphan = await sealCommit({ id: 'c3', parent: 'nowhere', authorId: admin.id, message: 'c3', changes: [] });
    for (const commits of [[first, again], [loop], [orphan]])
      await expect(act(workspace, { type: 'upload', taskId: 't', expectedHead: null, commits })).rejects.toThrow();
    expect((await workspace.store.commits(['c1', 'c2', 'c3'])).size).toBe(0);
  });
});

describe('the engine decides only on data the repository preloaded', () => {
  it('declares what a command needs after its own checks, and nothing for a retried operation', async () => {
    const workspace = await open();
    await act(workspace, { type: 'task', id: 't', name: 't', expectedHead: null });
    const first = await commit(workspace, 'c1', null, { a: category('A') });
    const upload = { type: 'upload', operationId: 'op', taskId: 't', expectedHead: null, commits: [first] } as Command;
    expect(plan(workspace.state, admin, upload)).toEqual({ type: 'upload', ids: ['c1'] });
    expect(() => plan(workspace.state, { ...admin, id: 'stranger' }, upload)).toThrow(/权限/);
    expect(() => plan(workspace.state, admin, { ...upload, taskId: 'missing' } as Command)).toThrow(/任务不存在/);
    await workspace.run(admin, upload, env());
    expect(plan(workspace.state, admin, upload)).toEqual({ type: 'none' });
  });
  it('treats missing preloaded data as an internal error rather than as an empty answer', async () => {
    const workspace = await open();
    await started(workspace, 't', [{ a: category('A') }]);
    const upload = {
      type: 'upload',
      operationId: 'op',
      taskId: 't',
      expectedHead: 't-c1',
      commits: [await commit(workspace, 't-c2', 't-c1', { a: category('B') })]
    } as Command;
    const before = structuredClone(workspace.state);
    expect(() => execute(workspace.state, admin, upload, env())).toThrow(/not preloaded/);
    expect(workspace.state).toEqual(before);
  });
});

describe('upload cost', () => {
  /** 建一条 `length` 个提交的任务链，再统计上传一个新提交时对提交存储的读取。 */
  async function readsForOneMoreCommit(length: number) {
    const workspace = await open();
    await act(workspace, { type: 'task', id: 't', name: 't', expectedHead: null });
    let parent: string | null = null;
    let head: string | null = null;
    let content: Records = {};
    for (let offset = 0; offset < length; offset += 100) {
      const batch: Commit[] = [];
      for (let index = offset; index < Math.min(length, offset + 100); index++) {
        const next: Records = { ...content, [`r${index}`]: category(`Record ${index}`) };
        const sealed = await sealCommit({
          id: uuidv7(),
          parent,
          authorId: admin.id,
          message: `c${index}`,
          changes: diffRecords(content, next)
        });
        batch.push(sealed);
        parent = sealed.id;
        content = next;
      }
      await act(workspace, { type: 'upload', taskId: 't', expectedHead: head, commits: batch });
      head = parent;
    }
    const last = await sealCommit({
      id: uuidv7(),
      parent,
      authorId: admin.id,
      message: 'one more',
      changes: diffRecords(content, { ...content, extra: category('Extra') })
    });
    workspace.store.resetStats();
    await act(workspace, { type: 'upload', taskId: 't', expectedHead: head, commits: [last] });
    return { calls: [...workspace.store.stats.calls], rows: workspace.store.stats.rows };
  }
  it('uploading one more commit onto a 500-commit chain does a constant number of lookups', async () => {
    const short = await readsForOneMoreCommit(3);
    const long = await readsForOneMoreCommit(500);
    expect(short).toEqual({ calls: ['commits'], rows: 0 });
    expect(long).toEqual(short);
  });
});

describe('candidates and merges are stored as changes relative to the target', () => {
  /** 共享分支里有 `count` 条分类的工作区。 */
  async function populated(count: number) {
    const workspace = await open();
    const records: Records = Object.fromEntries(
      Array.from({ length: count }, (_, index) => [`c${index}`, category(`Category ${index}`, 'initial')])
    );
    await started(workspace, 'seed', [records]);
    await merge(workspace, 'seed');
    return { workspace, records };
  }
  it('keeps only the changed records in a candidate, in the merge commit and in the shared rows', async () => {
    const { workspace, records } = await populated(1000);
    const edited: Records = { ...records };
    for (const id of ['c1', 'c2', 'c3']) edited[id] = category(`Category ${id}`, 'edited');
    delete edited['c4'];
    edited['fresh'] = category('Fresh');
    await started(workspace, 'edit', [edited]);
    const apply = vi.spyOn(workspace.store, 'apply');
    const stateBefore = JSON.stringify(workspace.state).length;
    const merged = await merge(workspace, 'edit');
    const stored = workspace.state.candidates[workspace.state.prs['pr-edit'].candidateId!];
    expect(stored.changes.map(change => [change.entityId, change.operation])).toEqual([
      ['c1', 'update'],
      ['c2', 'update'],
      ['c3', 'update'],
      ['c4', 'delete'],
      ['fresh', 'insert']
    ]);
    expect(stored.changes[0]).toMatchObject({
      patch: { description: 'edited' },
      inversePatch: { description: 'initial' }
    });
    expect(workspace.state).not.toHaveProperty('records');
    // 状态只多出这次合并涉及的几条记录（PR、候选的变更、审计），与共享分支里的 1000 条记录无关
    expect(JSON.stringify(workspace.state).length - stateBefore).toBeLessThan(20_000);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(Object.keys(apply.mock.calls[0][0].upsert).sort()).toEqual(['c1', 'c2', 'c3', 'fresh']);
    expect(apply.mock.calls[0][0].remove).toEqual(['c4']);
    const head = String(merged['head']);
    const [changes] = (await workspace.store.changes([head])).values();
    expect(changes).toEqual(stored.changes);
    expect((await workspace.records(admin)).records).toEqual(edited);
    expect((await workspace.candidate(admin, stored.id)).records).toEqual(edited);
    // 改动记录的前后值只进变更日志，不进命令结果（也就不进回执与审计详情）
    expect(merged).not.toHaveProperty('changes');
    const log = workspace.changeLog.at(-1)!;
    expect(log.head).toBe(head);
    expect(log.records.map(change => change.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'fresh']);
    expect(log.records[0]).toEqual({
      id: 'c1',
      before: category('Category 1', 'initial'),
      after: category('Category c1', 'edited')
    });
    expect(log.records.find(change => change.id === 'c4')).toEqual({
      id: 'c4',
      before: category('Category 4', 'initial'),
      after: null
    });
    expect(log.records.at(-1)).toEqual({ id: 'fresh', before: null, after: category('Fresh') });
    expect(JSON.stringify(workspace.state.audit.at(-1))).not.toContain('Category c1');
  });
  it('derives the merge base by reverting the later merges from the shared head', async () => {
    const workspace = await open();
    await started(workspace, 'one', [{ a: category('A', 'v1'), b: category('B', 'v1') }]);
    const first = String((await merge(workspace, 'one'))['head']);
    // 任务在第一次合并之后起步，随后共享分支又被另外两个任务推进
    await started(workspace, 'late', [{ a: category('A', 'v1'), b: category('B', 'late') }]);
    await started(workspace, 'two', [{ a: category('A', 'two'), b: category('B', 'v1') }]);
    const second = String((await merge(workspace, 'two'))['head']);
    await started(workspace, 'three', [{ a: category('A', 'two'), b: category('B', 'v1'), c: category('C') }]);
    const third = String((await merge(workspace, 'three'))['head']);
    expect((await workspace.commit(admin, first)).records).toEqual({ a: category('A', 'v1'), b: category('B', 'v1') });
    expect((await workspace.commit(admin, second)).records).toEqual({
      a: category('A', 'two'),
      b: category('B', 'v1')
    });
    expect((await workspace.commit(admin, third)).records).toEqual({
      a: category('A', 'two'),
      b: category('B', 'v1'),
      c: category('C')
    });
    expect((await workspace.commit(admin, 'late-c1')).records).toEqual({
      a: category('A', 'v1'),
      b: category('B', 'late')
    });
    // 来源改的是 b，目标改的是 a 与新增 c：三方合并必须以第一次合并时的内容为共同起点
    await act(workspace, {
      type: 'pr',
      id: 'pr-late',
      taskId: 'late',
      title: 'late',
      description: '',
      target: 'shared'
    });
    await act(workspace, { type: 'pr_state', prId: 'pr-late', status: 'review', expectedRevision: 0 });
    const result = await act(workspace, { type: 'candidate', prId: 'pr-late', expectedRevision: 1, resolutions: [] });
    const candidate = await workspace.candidate(admin, String(result['candidateId']));
    expect(candidate).toMatchObject({ base: first, source: 'late-c1', target: third, conflicts: [] });
    expect(candidate.records).toEqual({ a: category('A', 'two'), b: category('B', 'late'), c: category('C') });
  });
});

describe('persisted workspace state', () => {
  /** 上传 `count` 个提交、每个提交改 `width` 条记录、每条记录带 `payload` 长度的文本后，工作区状态序列化的字节数。 */
  async function stateBytes(count: number, width: number, payload: number) {
    const workspace = await open();
    await act(workspace, { type: 'task', id: 't', name: 't', expectedHead: null });
    let parent: string | null = null;
    let content: Records = {};
    for (let index = 0; index < count; index++) {
      const next: Records = { ...content };
      for (let row = 0; row < width; row++) next[`r${row}`] = category(`N${row}`, `${index}`.padEnd(payload, 'x'));
      const sealed = await sealCommit({
        id: uuidv7(),
        parent,
        authorId: admin.id,
        message: `c${index}`,
        changes: diffRecords(content, next)
      });
      await act(workspace, { type: 'upload', taskId: 't', expectedHead: parent, commits: [sealed] });
      parent = sealed.id;
      content = next;
    }
    return JSON.stringify(workspace.state).length;
  }
  it('does not depend on how many records a commit changes or how large they are', async () => {
    const small = await stateBytes(20, 1, 10);
    const large = await stateBytes(20, 100, 4000);
    expect(Math.abs(large - small)).toBeLessThan(200);
  });
});
