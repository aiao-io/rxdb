import { describe, expect, it } from 'vitest';
import { sealCommit } from '../commit.js';
import {
  CollaborationError,
  receiptRetentionMs,
  type Command,
  type DataRow,
  type HistoryQuery,
  type Identity,
  type Records
} from '../model.js';
import { assetSchema, diffAssets } from '../schema.testing.js';
import { MemoryWorkspace, memoryReceiptSweep } from './memory.testing.js';
import { stateChanges } from './state-changes.js';

const admin: Identity = { id: 'admin', email: 'admin@example.test', verified: true };
let serial = 0;
const env = (now = 1000) => ({ now, id: () => `generated-${++serial}` });
const category = (name: string): DataRow => ({ entity: 'AssetCategory', fields: { name } });
const create = () =>
  MemoryWorkspace.create(
    { teamId: 'team', appId: 'assets', name: 'Team', bootstrapKey: 'seed', admin, schema: assetSchema },
    env()
  );
const act = (
  workspace: MemoryWorkspace,
  command: Record<string, unknown>,
  options: { now?: number; operationId?: string } = {}
) =>
  workspace.run(
    admin,
    { ...command, operationId: options.operationId ?? `operation-${++serial}` } as Command,
    env(options.now)
  );
/** 执行并返回错误码；没有抛错时返回 `none`。 */
const codeOf = async (work: () => Promise<unknown>) => {
  try {
    await work();
  } catch (error) {
    return error instanceof CollaborationError ? error.code : 'unexpected';
  }
  return 'none';
};
/** 从共享头起步的任务，带一个把记录改成 `records` 的提交。 */
async function started(workspace: MemoryWorkspace, id: string, records: Records) {
  const base = workspace.state.head;
  await act(workspace, { type: 'task', id, name: id, expectedHead: base });
  const before = base === null ? {} : (await workspace.commit(admin, base)).records;
  const commit = await sealCommit({
    id: `${id}-c1`,
    parent: base,
    authorId: admin.id,
    message: id,
    changes: diffAssets(before, records)
  });
  await act(workspace, { type: 'upload', taskId: id, expectedHead: base, commits: [commit] });
  return commit.id;
}
/** 给任务开一个进入审核、已生成候选的 PR。 */
async function reviewed(workspace: MemoryWorkspace, taskId: string) {
  const prId = `pr-${taskId}`;
  await act(workspace, { type: 'pr', id: prId, taskId, title: taskId, description: '', target: 'shared' });
  await act(workspace, { type: 'pr_state', prId, status: 'review', expectedRevision: 0 });
  await act(workspace, { type: 'candidate', prId, expectedRevision: 1, resolutions: [] });
  return workspace.state.candidates[workspace.state.prs[prId].candidateId!];
}
/** 免审批策略下把任务合并进共享分支，返回合并提交。 */
async function merged(workspace: MemoryWorkspace, taskId: string, records: Records) {
  await started(workspace, taskId, records);
  const candidate = await reviewed(workspace, taskId);
  const result = await act(workspace, {
    type: 'merge',
    prId: `pr-${taskId}`,
    candidateId: candidate.id,
    expectedSource: candidate.source,
    expectedTarget: candidate.target
  });
  return String(result['head']);
}

describe('commands load only the rows they touch', () => {
  /** 最近一条命令加载（并在执行中新增）的行。 */
  const loaded = (workspace: MemoryWorkspace) => {
    const state = workspace.lastLoaded!;
    return {
      prs: Object.keys(state.prs),
      threads: Object.keys(state.threads),
      tasks: Object.keys(state.tasks),
      candidates: Object.keys(state.candidates),
      reviews: state.reviews.length,
      invitations: Object.keys(state.invitations)
    };
  };
  it('a reply loads its thread and PR, a merge its own PR bundle, an upload the PRs of its task', async () => {
    const workspace = create();
    await act(workspace, { type: 'policy', stages: [], expectedVersion: 1 });
    for (const id of ['a', 'b', 'c']) {
      await started(workspace, id, { [id]: category(id) });
      await reviewed(workspace, id);
      for (let index = 0; index < 3; index++)
        await act(workspace, {
          type: 'thread',
          id: `t-${id}-${index}`,
          prId: `pr-${id}`,
          candidateId: null,
          recordId: null,
          field: null,
          body: 'Note',
          required: false,
          mentions: []
        });
    }
    await act(workspace, { type: 'reply', threadId: 't-a-1', body: 'Reply', mentions: [] });
    expect(loaded(workspace)).toEqual({
      prs: ['pr-a'],
      threads: ['t-a-1'],
      tasks: [],
      candidates: [],
      reviews: 0,
      invitations: []
    });
    const candidate = workspace.state.candidates[workspace.state.prs['pr-b'].candidateId!];
    await act(workspace, {
      type: 'merge',
      prId: 'pr-b',
      candidateId: candidate.id,
      expectedSource: candidate.source,
      expectedTarget: null
    });
    expect(loaded(workspace)).toEqual({
      prs: ['pr-b'],
      threads: ['t-b-0', 't-b-1', 't-b-2'],
      tasks: ['b'],
      candidates: [candidate.id],
      reviews: 0,
      invitations: []
    });
    const content = (await workspace.commit(admin, 'c-c1')).records;
    const next = await sealCommit({
      id: 'c-c2',
      parent: 'c-c1',
      authorId: admin.id,
      message: 'c2',
      changes: diffAssets(content, { ...content, extra: category('Extra') })
    });
    await act(workspace, { type: 'upload', taskId: 'c', expectedHead: 'c-c1', commits: [next] });
    expect(loaded(workspace)).toEqual({
      prs: ['pr-c'],
      threads: [],
      tasks: ['c'],
      candidates: [],
      reviews: 0,
      invitations: []
    });
    // 只加载了 pr-c，结果与加载全部状态时一样：上传让该任务 PR 的候选过期、修订号前进
    expect(workspace.state.prs['pr-c']).toMatchObject({ candidateId: null, revision: 3 });
    expect(workspace.state.prs['pr-a'].candidateId).not.toBeNull();
  });
  it('an invitation loads that invitation only, and a retried command with a receipt loads no PR or task rows', async () => {
    const workspace = create();
    for (const id of ['one', 'two'])
      await act(workspace, {
        type: 'invite',
        id,
        email: `${id}@example.test`,
        permissions: ['read'],
        tokenHash: id,
        expiresAt: 5000,
        expectedVersion: 0
      });
    expect(loaded(workspace).invitations).toEqual(['two']);
    await started(workspace, 'task', { a: category('A') });
    await act(workspace, { type: 'pr', id: 'pr', taskId: 'task', title: 'PR', description: '', target: 'shared' });
    const state = { type: 'pr_state', prId: 'pr', status: 'review', expectedRevision: 0 };
    const first = await act(workspace, state, { operationId: 'retried' });
    expect(loaded(workspace).prs).toEqual(['pr']);
    expect(await act(workspace, state, { operationId: 'retried' })).toEqual(first);
    expect(loaded(workspace)).toMatchObject({ prs: [], tasks: [] });
  });
});

describe('receipt retention', () => {
  it('replays a receipt within the retention period and treats an expired one as a new request', async () => {
    const workspace = create();
    const command = { type: 'task', id: 'task', name: 'Task', expectedHead: null };
    const first = await act(workspace, command, { now: 1000, operationId: 'op' });
    expect(await act(workspace, command, { now: 1000 + receiptRetentionMs - 1, operationId: 'op' })).toEqual(first);
    // 过期后同一操作 ID 按新请求裁决：任务已存在
    expect(await codeOf(() => act(workspace, command, { now: 1000 + receiptRetentionMs, operationId: 'op' }))).toBe(
      'exists'
    );
  });
  it('does not create a commit twice when an expired upload is retried', async () => {
    const workspace = create();
    await act(workspace, { type: 'task', id: 'task', name: 'Task', expectedHead: null });
    const commit = await sealCommit({
      id: 'c1',
      parent: null,
      authorId: admin.id,
      message: 'c1',
      changes: diffAssets({}, { a: category('A') })
    });
    const upload = { type: 'upload', taskId: 'task', expectedHead: null, commits: [commit] };
    await act(workspace, upload, { now: 2000, operationId: 'upload' });
    expect(await codeOf(() => act(workspace, upload, { now: 2000 + receiptRetentionMs, operationId: 'upload' }))).toBe(
      'diverged'
    );
    expect((await workspace.store.commits(['c1'])).size).toBe(1);
    expect(workspace.state.tasks['task'].head).toBe('c1');
  });
  it('sweeps at most a bounded number of expired receipts per write, oldest first', async () => {
    const workspace = create();
    for (let index = 0; index < 25; index++)
      await act(
        workspace,
        { type: 'task', id: `t${index}`, name: `T${index}`, expectedHead: null },
        { now: 1000 + index, operationId: `op-${index}` }
      );
    const later = 1000 + receiptRetentionMs + 100;
    await act(
      workspace,
      { type: 'task', id: 'late-1', name: 'Late', expectedHead: null },
      { now: later, operationId: 'late-1' }
    );
    expect(Object.keys(workspace.state.receipts).sort()).toEqual(
      ['late-1', ...Array.from({ length: 25 - memoryReceiptSweep }, (_, i) => `op-${memoryReceiptSweep + i}`)].sort()
    );
    await act(
      workspace,
      { type: 'task', id: 'late-2', name: 'Late', expectedHead: null },
      { now: later, operationId: 'late-2' }
    );
    expect(Object.keys(workspace.state.receipts).sort()).toEqual(['late-1', 'late-2']);
  });
});

describe('commit history pages', () => {
  it('pages the shared branch newest first and a task branch down to its base, by task or by PR', async () => {
    const workspace = create();
    await act(workspace, { type: 'policy', stages: [], expectedVersion: 1 });
    const heads: string[] = [];
    let records: Records = {};
    for (let index = 1; index <= 5; index++) {
      records = { ...records, [`m${index}`]: category(`M${index}`) };
      heads.unshift(await merged(workspace, `m${index}`, records));
    }
    const page = (query: HistoryQuery) => workspace.history(admin, query);
    const ids = (value: { commits: { id: string }[] }) => value.commits.map(commit => commit.id);
    const first = await page({ branch: 'shared', limit: 2 });
    expect(ids(first)).toEqual(heads.slice(0, 2));
    expect(first.nextBefore).toBe(heads[1]);
    const second = await page({ branch: 'shared', limit: 2, before: first.nextBefore! });
    expect(ids(second)).toEqual(heads.slice(2, 4));
    const last = await page({ branch: 'shared', limit: 2, before: second.nextBefore! });
    expect(ids(last)).toEqual([heads[4]]);
    expect(last.nextBefore).toBeNull();
    expect(ids(await page({ branch: 'shared' }))).toEqual(heads);
    expect((await page({ branch: 'shared', limit: 5 })).nextBefore).toBeNull();

    await act(workspace, { type: 'task', id: 'long', name: 'Long', expectedHead: heads[0] });
    let parent = heads[0];
    let content = records;
    const chain: string[] = [];
    for (let index = 0; index < 3; index++) {
      const next = { ...content, [`l${index}`]: category(`L${index}`) };
      const commit = await sealCommit({
        id: `long-${index}`,
        parent,
        authorId: admin.id,
        message: `L${index}`,
        changes: diffAssets(content, next)
      });
      await act(workspace, { type: 'upload', taskId: 'long', expectedHead: parent, commits: [commit] });
      chain.unshift(commit.id);
      parent = commit.id;
      content = next;
    }
    await act(workspace, {
      type: 'pr',
      id: 'pr-long',
      taskId: 'long',
      title: 'Long',
      description: '',
      target: 'shared'
    });
    expect(ids(await page({ taskId: 'long' }))).toEqual(chain);
    expect(await page({ prId: 'pr-long' })).toEqual(await page({ taskId: 'long' }));
    const narrow = await page({ prId: 'pr-long', limit: 2 });
    expect(ids(await page({ prId: 'pr-long', before: narrow.nextBefore! }))).toEqual([chain[2]]);
    expect((await page({ taskId: 'long' })).commits[0]).toEqual({
      id: 'long-2',
      parent: 'long-1',
      authorId: admin.id,
      message: 'L2'
    });
  });
  it('rejects a missing or doubled selector, unknown branches or cursors, limits outside 1 to 100 and non-members', async () => {
    const workspace = create();
    await started(workspace, 'task', { a: category('A') });
    const code = (query: HistoryQuery, user = admin) => codeOf(() => workspace.history(user, query));
    expect(await code({})).toBe('invalid');
    expect(await code({ branch: 'shared', taskId: 'task' })).toBe('invalid');
    expect(await code({ branch: 'main' as 'shared' })).toBe('invalid');
    expect(await code({ taskId: 'missing' })).toBe('not_found');
    expect(await code({ prId: 'missing' })).toBe('not_found');
    expect(await code({ taskId: 'task', before: 'missing' })).toBe('not_found');
    for (const limit of [0, 101, 1.5]) expect(await code({ taskId: 'task', limit })).toBe('invalid');
    expect(await code({ taskId: 'task', limit: 100 })).toBe('none');
    expect(await code({ branch: 'shared' }, { id: 'stranger', email: 's@example.test', verified: true })).toBe(
      'forbidden'
    );
    expect(await workspace.history(admin, { branch: 'shared' })).toEqual({ commits: [], nextBefore: null });
  });
});

describe('state changes written back', () => {
  it('lists only the rows a command changed', async () => {
    const workspace = create();
    await started(workspace, 'task', { a: category('A') });
    const before = structuredClone(workspace.state);
    const after = structuredClone(workspace.state);
    after.tasks['task'].head = 'next';
    after.revision++;
    const changes = stateChanges(before, after);
    expect(changes.heads).toEqual({ task: { from: 'task-c1', to: 'next' } });
    expect(changes).toMatchObject({ members: [], tasks: [], shared: null, audit: [], receipts: [], revised: true });
    expect(stateChanges(before, structuredClone(before))).toMatchObject({ heads: {}, revised: false, presence: null });
  });
  it('treats removed rows and edits of immutable rows as internal errors, never as writes', async () => {
    const workspace = create();
    await started(workspace, 'task', { a: category('A') });
    await reviewed(workspace, 'task');
    const before = workspace.state;
    const edits: ((state: typeof before) => void)[] = [
      state => delete state.members['admin'],
      state => {
        state.tasks['task'].name = 'Renamed';
      },
      state => {
        state.candidates[state.prs['pr-task'].candidateId!].checks = [];
        state.candidates[state.prs['pr-task'].candidateId!].actorId = 'someone';
      },
      state => {
        state.audit[0].action = 'forged';
      }
    ];
    for (const edit of edits) {
      const after = structuredClone(before);
      edit(after);
      expect(() => stateChanges(before, after)).toThrow(Error);
      expect(() => stateChanges(before, after)).not.toThrow(CollaborationError);
    }
  });
});
