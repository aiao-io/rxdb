import { describe, expect, it } from 'vitest';
import { diffRecords } from '../changes.js';
import { sealCommit } from '../commit.js';
import {
  CollaborationError,
  type Command,
  type Commit,
  type Identity,
  type Records,
  type Workspace
} from '../model.js';
import { auditPage, candidateSummary } from './engine.js';
import { MemoryWorkspace } from './memory.testing.js';

const admin: Identity = { id: 'admin', email: 'admin@example.test', verified: true };
const reviewer: Identity = { id: 'reviewer', email: 'reviewer@example.test', verified: true };
let serial = 0;
const env = () => ({ now: 1000, id: () => `generated-${++serial}` });
/** 每个工作区状态对应的内存存储：引擎状态保持不含提交与共享记录，它们存在存储里。 */
const spaces = new WeakMap<Workspace, MemoryWorkspace>();
const space = (state: Workspace) => spaces.get(state)!;
const create = () => {
  const workspace = MemoryWorkspace.create(
    { teamId: 'team', appId: 'assets', name: 'Team', bootstrapKey: 'seed', admin },
    env()
  );
  spaces.set(workspace.state, workspace);
  return workspace.state;
};
const act = (
  state: Workspace,
  command: Omit<Command, 'operationId'> | Record<string, unknown>,
  actor = admin,
  operationId = `operation-${++serial}`
) => space(state).run(actor, { ...command, operationId } as Command, env());
/** 共享分支当前的全部记录。 */
const shared = async (state: Workspace) => (await space(state).records(admin)).records;
/** 一个提交（含任务提交与合并提交）的完整记录。 */
const contentOf = async (state: Workspace, id: string | null) =>
  id === null ? {} : (await space(state).commit(admin, id)).records;
/** 相对父提交内容的整单提交：把「这个提交之后的记录」换算成字段级变更并封上指纹。 */
async function commit(
  state: Workspace,
  id: string,
  parent: string | null,
  after: Records,
  message = 'Assets',
  authorId = admin.id
): Promise<Commit> {
  return sealCommit({ id, parent, authorId, message, changes: diffRecords(await contentOf(state, parent), after) });
}
async function invite(state: Workspace) {
  await act(state, {
    type: 'invite',
    id: 'invite',
    email: reviewer.email,
    permissions: ['read', 'edit', 'review', 'comment'],
    tokenHash: 'token',
    expiresAt: 5000,
    expectedVersion: 0
  });
  await act(state, { type: 'accept_invite', id: 'invite', tokenHash: 'token' }, reviewer);
}
const records = (price = 100, categoryId = 'category') => ({
  category: { entity: 'AssetCategory' as const, fields: { name: 'Computers' } },
  asset: { entity: 'Asset' as const, fields: { name: 'Laptop', categoryId, purchasePrice: price } }
});
async function ready(state: Workspace, suffix = '1', price = 100) {
  await act(state, { type: 'task', id: `task${suffix}`, name: 'Update assets', expectedHead: state.head });
  await act(state, {
    type: 'upload',
    taskId: `task${suffix}`,
    expectedHead: state.head,
    commits: [await commit(state, `commit${suffix}`, state.head, records(price))]
  });
  await act(state, {
    type: 'pr',
    id: `pr${suffix}`,
    taskId: `task${suffix}`,
    title: 'Asset update',
    description: '',
    target: 'shared'
  });
  await act(state, { type: 'pr_state', prId: `pr${suffix}`, status: 'review', expectedRevision: 0 });
  await act(state, { type: 'candidate', prId: `pr${suffix}`, expectedRevision: 1, resolutions: [] });
  return state.candidates[state.prs[`pr${suffix}`].candidateId!];
}
function approve(state: Workspace, prId: string, candidateId: string, actor = reviewer, expectedRevision = 0) {
  return act(
    state,
    {
      type: 'review',
      prId,
      candidateId,
      expectedSource: state.candidates[candidateId].source,
      stageId: 'review',
      decision: 'approve',
      reason: '',
      expectedRevision
    },
    actor
  );
}
describe('authoritative collaboration transactions', () => {
  it('bootstraps an empty workspace; uninvited users cannot read or claim admin', async () => {
    const state = create();
    expect(await shared(state)).toEqual({});
    expect(state.head).toBeNull();
    await expect(space(state).summary(reviewer, 1000)).rejects.toThrow(/权限/);
    await expect(act(state, { type: 'task', id: 'x', name: 'x', expectedHead: null }, reviewer)).rejects.toThrow(
      /权限/
    );
  });
  it('does not keep commits or shared records in the persisted workspace state', async () => {
    const state = create();
    await ready(state);
    expect(state).not.toHaveProperty('commits');
    expect(state).not.toHaveProperty('records');
  });
  it('does not consume an invitation for a wrong email, and consumed invitations never resurrect removed members', async () => {
    const state = create();
    await act(state, {
      type: 'invite',
      id: 'i',
      email: reviewer.email,
      permissions: ['read'],
      tokenHash: 'token',
      expiresAt: 5000,
      expectedVersion: 0
    });
    await expect(
      act(state, { type: 'accept_invite', id: 'i', tokenHash: 'token' }, { ...reviewer, email: 'wrong@example.test' })
    ).rejects.toThrow();
    expect(state.invitations.i.state).toBe('pending');
    await act(state, { type: 'accept_invite', id: 'i', tokenHash: 'token' }, reviewer, 'accept');
    await act(state, { type: 'member', userId: reviewer.id, permissions: [], active: false, expectedGeneration: 1 });
    await expect(
      act(state, { type: 'accept_invite', id: 'i', tokenHash: 'token' }, reviewer, 'accept')
    ).rejects.toThrow();
  });
  it('retries preserve the original receipt after the remote head advances, without accepting a fork or forged authors', async () => {
    const state = create();
    await act(state, { type: 'task', id: 't', name: 't', expectedHead: null });
    const command = {
      type: 'upload',
      taskId: 't',
      expectedHead: null,
      commits: [await commit(state, 'a', null, records(), 'first')]
    };
    await act(state, command, admin, 'upload');
    await act(state, {
      ...command,
      expectedHead: 'a',
      commits: [await commit(state, 'b', 'a', records(), 'first')]
    });
    expect((await act(state, command, admin, 'upload'))['head']).toBe('a');
    expect(state.tasks.t.head).toBe('b');
    await expect(
      act(state, { ...command, commits: [await commit(state, 'c', null, records(), 'first')] })
    ).rejects.toThrow(/分叉/);
    await expect(
      act(state, {
        ...command,
        expectedHead: 'b',
        commits: [await commit(state, 'c', 'b', records(), 'first', reviewer.id)]
      })
    ).rejects.toThrow(/作者/);
    await expect(act(state, { ...command, expectedHead: 'changed' }, admin, 'upload')).rejects.toThrow(/幂等/);
  });
  it('binds approval and the only shared write to the exact candidate; successful retries do not merge twice', async () => {
    const state = create();
    await invite(state);
    const candidate = await ready(state);
    const merge = {
      type: 'merge',
      prId: 'pr1',
      candidateId: candidate.id,
      expectedSource: 'commit1',
      expectedTarget: null
    };
    await expect(act(state, merge)).rejects.toThrow(/批准/);
    await approve(state, 'pr1', candidate.id);
    const receipt = await act(state, merge, admin, 'merge');
    expect((await shared(state))['asset'].fields['purchasePrice']).toBe(100);
    expect(state.prs.pr1.status).toBe('merged');
    expect(await act(state, merge, admin, 'merge')).toEqual(receipt);
    expect(state.audit.filter(event => event.action === 'merge')).toHaveLength(1);
  });
  it('keeps request-changes blockers through new candidates and no-approval policies; requires explicit audited dismissal', async () => {
    const state = create();
    await invite(state);
    const candidate = await ready(state);
    await act(
      state,
      {
        type: 'review',
        expectedSource: 'commit1',
        prId: 'pr1',
        candidateId: candidate.id,
        stageId: 'review',
        decision: 'request_changes',
        reason: 'Wrong price',
        expectedRevision: 0
      },
      reviewer
    );
    await act(state, { type: 'policy', stages: [], expectedVersion: 1 });
    await act(state, { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] });
    const current = state.prs.pr1.candidateId!;
    const merge = { type: 'merge', prId: 'pr1', candidateId: current, expectedSource: 'commit1', expectedTarget: null };
    await expect(act(state, merge)).rejects.toThrow(/要求修改/);
    await act(state, {
      type: 'dismiss',
      prId: 'pr1',
      reviewerId: reviewer.id,
      reason: 'Reviewed with owner',
      expectedRevision: 1
    });
    await act(state, merge);
    expect(state.audit.some(event => event.action === 'dismiss')).toBe(true);
  });
  it('does not revive an approval when review permission is revoked and regranted', async () => {
    const state = create();
    await invite(state);
    const candidate = await ready(state);
    await approve(state, 'pr1', candidate.id);
    await act(state, {
      type: 'member',
      userId: reviewer.id,
      permissions: ['read'],
      active: true,
      expectedGeneration: 1
    });
    await act(state, {
      type: 'member',
      userId: reviewer.id,
      permissions: ['read', 'review'],
      active: true,
      expectedGeneration: 2
    });
    await expect(
      act(state, {
        type: 'merge',
        prId: 'pr1',
        candidateId: candidate.id,
        expectedSource: 'commit1',
        expectedTarget: null
      })
    ).rejects.toThrow(/批准/);
  });
  it('changing 120 to 999 creates a new candidate even though the source commit is unchanged', async () => {
    const state = create();
    await invite(state);
    let c = await ready(state);
    await approve(state, 'pr1', c.id);
    await act(state, {
      type: 'merge',
      prId: 'pr1',
      candidateId: c.id,
      expectedSource: 'commit1',
      expectedTarget: null
    });
    const base = state.head;
    await ready(state, '2', 120);
    c = await ready(state, '3', 110);
    await approve(state, 'pr3', c.id);
    await act(state, {
      type: 'merge',
      prId: 'pr3',
      candidateId: c.id,
      expectedSource: 'commit3',
      expectedTarget: base
    });
    await act(state, {
      type: 'candidate',
      prId: 'pr2',
      expectedRevision: state.prs.pr2.revision,
      resolutions: [{ key: 'asset/purchasePrice', choice: 'source' }]
    });
    const c1 = state.prs.pr2.candidateId!;
    await approve(state, 'pr2', c1);
    await act(state, {
      type: 'candidate',
      prId: 'pr2',
      expectedRevision: state.prs.pr2.revision,
      resolutions: [{ key: 'asset/purchasePrice', choice: 'custom', value: 999 }]
    });
    const c2 = state.prs.pr2.candidateId!;
    expect(c2).not.toBe(c1);
    await expect(
      act(state, {
        type: 'merge',
        prId: 'pr2',
        candidateId: c2,
        expectedSource: 'commit2',
        expectedTarget: state.head
      })
    ).rejects.toThrow(/批准/);
    expect((await space(state).candidate(admin, c1)).records['asset'].fields['purchasePrice']).toBe(120);
    expect((await space(state).candidate(admin, c2)).records['asset'].fields['purchasePrice']).toBe(999);
  });
  it('checks the final merged result for uniqueness, references and types, and does not mutate shared data on failure', async () => {
    const state = create();
    const c = await ready(state);
    const before = await shared(state);
    await act(state, {
      type: 'upload',
      taskId: 'task1',
      expectedHead: 'commit1',
      commits: [await commit(state, 'dangling', 'commit1', records(100, 'missing'))]
    });
    await act(state, { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] });
    expect(state.candidates[state.prs.pr1.candidateId!].checks).not.toHaveLength(0);
    await expect(approve(state, 'pr1', c.id, admin)).rejects.toThrow();
    expect(await shared(state)).toEqual(before);
  });
});

describe('governance, discussion and identity regressions', () => {
  it('records source-bound change requests before a candidate exists and keeps them blocking the next candidate', async () => {
    const state = create();
    await invite(state);
    await ready(state);
    await act(state, { type: 'pr_state', prId: 'pr1', status: 'closed', expectedRevision: state.prs.pr1.revision });
    await act(state, { type: 'pr_state', prId: 'pr1', status: 'review', expectedRevision: state.prs.pr1.revision });
    const review = {
      type: 'review',
      prId: 'pr1',
      candidateId: null,
      expectedSource: 'commit1',
      stageId: 'review',
      decision: 'request_changes',
      reason: 'Review scope first',
      expectedRevision: 0
    };
    await expect(act(state, { ...review, expectedSource: 'outdated' }, reviewer)).rejects.toThrow(/版本/);
    await expect(act(state, { ...review, decision: 'approve' }, reviewer)).rejects.toThrow(/候选/);
    await act(state, review, reviewer);
    expect(state.reviews[0]).toMatchObject({ candidateId: null, source: 'commit1', decision: 'request_changes' });
    await act(state, { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] });
    const candidateId = state.prs.pr1.candidateId!;
    const merge = { type: 'merge', prId: 'pr1', candidateId, expectedSource: 'commit1', expectedTarget: null };
    await expect(act(state, merge)).rejects.toThrow(/要求修改/);
    await approve(state, 'pr1', candidateId, reviewer, 1);
    await act(state, merge);
    expect(state.prs.pr1.status).toBe('merged');
  });
  it('resends revoke the original token; inviter revocation and expiration are checked at acceptance', async () => {
    const state = create();
    const invitation = {
      type: 'invite',
      id: 'i',
      email: reviewer.email,
      permissions: ['read'],
      tokenHash: 'old',
      expiresAt: 5000,
      expectedVersion: 0
    };
    await act(state, invitation);
    await act(state, { ...invitation, tokenHash: 'new', expectedVersion: 1 });
    await expect(act(state, { type: 'accept_invite', id: 'i', tokenHash: 'old' }, reviewer)).rejects.toThrow();
    await expect(
      space(state).run(
        reviewer,
        { type: 'accept_invite', id: 'i', tokenHash: 'new', operationId: 'expired' },
        { ...env(), now: 5001 }
      )
    ).rejects.toThrow(/过期/);
    state.members.admin.permissions = ['read'];
    await expect(act(state, { type: 'accept_invite', id: 'i', tokenHash: 'new' }, reviewer)).rejects.toThrow(/授权/);
  });
  it('cannot promote existing members through invitations or remove the last administrator', async () => {
    const state = create();
    await invite(state);
    await act(state, {
      type: 'invite',
      id: 'another',
      email: reviewer.email,
      permissions: ['read', 'manage'],
      tokenHash: 'second',
      expiresAt: 5000,
      expectedVersion: 0
    });
    await act(state, { type: 'accept_invite', id: 'another', tokenHash: 'second' }, reviewer);
    expect(state.members.reviewer.permissions).not.toContain('manage');
    await expect(
      act(state, { type: 'member', userId: 'admin', permissions: [], active: false, expectedGeneration: 1 })
    ).rejects.toThrow(/最后/);
  });
  it('keeps invitee emails and invitation digests out of the audit trail that every reader receives', async () => {
    const state = create();
    await invite(state);
    const pending = 'Pending.Person@Example.test';
    await act(state, {
      type: 'invite',
      id: 'pending',
      email: pending,
      permissions: ['read'],
      tokenHash: 'digest-of-secret',
      expiresAt: 5000,
      expectedVersion: 0
    });
    const audit = (await space(state).summary(reviewer, 1000)).audit;
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toMatch(/@example\.test/i);
    expect(serialized).not.toContain('digest-of-secret');
    expect(audit.filter(event => event.action === 'invite')).toHaveLength(2);
    for (const event of audit.filter(item => ['invite', 'accept_invite'].includes(item.action))) {
      expect(event.details).not.toHaveProperty('email');
      expect(event.details).not.toHaveProperty('tokenHash');
    }
    expect(audit.find(event => event.details['id'] === 'pending')?.details).toMatchObject({
      permissions: ['read'],
      expiresAt: 5000,
      result: { invitationId: 'pending', version: 1 }
    });
    expect((await space(state).summary(reviewer, 1000)).invitations).toEqual([]);
    expect((await space(state).summary(admin, 1000)).invitations).toContainEqual(
      expect.objectContaining({ id: 'pending', email: pending.toLowerCase() })
    );
  });
  it('forking preserves the immutable local chain and leaves the original task and PR untouched', async () => {
    const state = create();
    const candidate = await ready(state);
    const original = structuredClone(state.prs.pr1);
    await act(state, {
      type: 'fork',
      id: 'fork',
      name: 'Fork',
      taskId: 'task1',
      expectedHead: null,
      commits: [await commit(state, 'local', null, records(999), 'Local fork')]
    });
    expect(state.tasks.task1.head).toBe(candidate.source);
    expect(state.tasks.fork.head).toBe('local');
    expect(state.prs.pr1).toEqual(original);
    expect((await space(state).commit(admin, 'local')).authorId).toBe('admin');
    await act(state, {
      type: 'pr',
      id: 'fork-pr',
      taskId: 'fork',
      title: 'Fork review',
      description: '',
      target: 'shared'
    });
    expect(state.prs['fork-pr'].taskId).toBe('fork');
    expect(state.tasks.fork.originTaskId).toBe('task1');
    expect(state.prs.pr1).toEqual(original);
  });
  it('required threads block merging even with a valid approval; notifications are scoped to their recipients', async () => {
    const state = create();
    await invite(state);
    const candidate = await ready(state);
    await approve(state, 'pr1', candidate.id);
    await act(
      state,
      {
        type: 'thread',
        id: 'thread',
        prId: 'pr1',
        candidateId: candidate.id,
        recordId: 'asset',
        field: 'purchasePrice',
        body: 'Check amount',
        required: true,
        mentions: ['admin']
      },
      reviewer
    );
    expect((await space(state).summary(admin, 1000)).notifications.length).toBeGreaterThan(0);
    expect((await space(state).summary(reviewer, 1000)).notifications).toEqual([]);
    const merge = {
      type: 'merge',
      prId: 'pr1',
      candidateId: candidate.id,
      expectedSource: 'commit1',
      expectedTarget: null
    };
    await expect(act(state, merge)).rejects.toThrow(/讨论/);
    await act(state, { type: 'resolve_thread', threadId: 'thread', resolved: true, expectedRevision: 0 }, reviewer);
    await act(state, merge);
    expect((await shared(state))['asset'].fields['purchasePrice']).toBe(100);
  });
  it('comments are owned, revision checked and safely tombstoned; positions cannot reference other PRs', async () => {
    const state = create();
    await invite(state);
    const candidate = await ready(state);
    await act(
      state,
      {
        type: 'thread',
        id: 't',
        prId: 'pr1',
        candidateId: candidate.id,
        recordId: null,
        field: null,
        body: '<script>bad()</script>',
        required: false,
        mentions: []
      },
      reviewer
    );
    const comment = state.threads.t.comments[0];
    await expect(
      act(state, {
        type: 'edit_comment',
        threadId: 't',
        commentId: comment.id,
        body: 'hijacked',
        deleted: false,
        expectedRevision: 0
      })
    ).rejects.toThrow(/自己/);
    await act(
      state,
      { type: 'edit_comment', threadId: 't', commentId: comment.id, body: '', deleted: true, expectedRevision: 0 },
      reviewer
    );
    expect(state.threads.t.comments[0].body).toBe('');
    expect(state.threads.t.comments[0].deleted).toBe(true);
    expect(state.audit.some(event => event.details['body'] === '<script>bad()</script>')).toBe(true);
    await act(state, { type: 'reply', threadId: 't', body: 'Follow-up', mentions: ['reviewer'] });
    const notification = state.notifications.find(n => n.userId === 'reviewer')!;
    await expect(act(state, { type: 'read_notice', id: notification.id })).rejects.toThrow(/通知/);
    await act(state, { type: 'read_notice', id: notification.id }, reviewer);
    expect(state.notifications.find(n => n.id === notification.id)?.read).toBe(true);
    await expect(
      act(state, {
        type: 'thread',
        id: 'bad',
        prId: 'pr1',
        candidateId: candidate.id,
        recordId: 'other',
        field: null,
        body: 'No',
        required: false,
        mentions: []
      })
    ).rejects.toThrow(/记录/);
  });
  it('anchors a discussion to records and fields that exist in the candidate, the source or the target only', async () => {
    const state = create();
    await invite(state);
    const candidate = await ready(state);
    const thread = (id: string, recordId: string, field: string | null) =>
      act(
        state,
        {
          type: 'thread',
          id,
          prId: 'pr1',
          candidateId: candidate.id,
          recordId,
          field,
          body: 'Look',
          required: false,
          mentions: []
        },
        reviewer
      );
    await thread('record', 'asset', null);
    await thread('field', 'asset', 'purchasePrice');
    await expect(thread('no-field', 'asset', 'purchaseDate')).rejects.toThrow(/字段/);
    await expect(thread('no-record', 'ghost', null)).rejects.toThrow(/记录/);
    await expect(thread('inherited', 'toString', null)).rejects.toThrow(/记录/);
  });
  it('presence expires and never grants permissions; removed members disappear immediately', async () => {
    const state = create();
    await invite(state);
    await ready(state);
    const revision = state.revision;
    const audit = state.audit.length;
    const receipts = Object.keys(state.receipts).length;
    await act(
      state,
      { type: 'presence', sessionId: 'browser', prId: 'pr1', recordId: 'asset', leave: false },
      reviewer
    );
    expect(state.revision).toBe(revision);
    expect(state.audit).toHaveLength(audit);
    expect(Object.keys(state.receipts)).toHaveLength(receipts);
    expect((await space(state).summary(admin, 1000)).presence).toHaveLength(1);
    await ready(state, '2');
    await act(state, { type: 'presence', sessionId: 'browser', prId: 'pr2', recordId: null, leave: false }, reviewer);
    expect((await space(state).summary(admin, 1000)).presence).toMatchObject([{ prId: 'pr2', recordId: null }]);
    expect((await space(state).summary(admin, 46001)).presence).toHaveLength(0);
    await act(state, { type: 'member', userId: 'reviewer', permissions: [], active: false, expectedGeneration: 1 });
    expect((await space(state).summary(admin, 1000)).presence).toHaveLength(0);
    await expect(
      act(state, { type: 'presence', sessionId: 'browser', prId: 'pr1', recordId: null, leave: false }, reviewer)
    ).rejects.toThrow(/权限/);
  });
  it('accepts presence only on records that exist in the shared data or in the pull request source', async () => {
    const state = create();
    await invite(state);
    await ready(state);
    const presence = (recordId: string | null, prId: string | null = 'pr1') =>
      act(state, { type: 'presence', sessionId: 'browser', prId, recordId, leave: false }, reviewer);
    await presence('asset');
    await expect(presence('ghost')).rejects.toThrow(/记录/);
    await expect(presence('toString')).rejects.toThrow(/记录/);
    await expect(presence('asset', null)).rejects.toThrow(/记录/);
  });
  it('multi-stage approval enforces ordering and stage membership and retains blockers', async () => {
    const state = create();
    await invite(state);
    await act(state, {
      type: 'policy',
      expectedVersion: 1,
      stages: [
        { id: 'first', name: 'First', minimum: 1, reviewers: ['reviewer'], after: [] },
        { id: 'second', name: 'Second', minimum: 1, reviewers: ['reviewer'], after: ['first'] }
      ]
    });
    const candidate = await ready(state);
    const review = {
      type: 'review',
      expectedSource: 'commit1',
      prId: 'pr1',
      candidateId: candidate.id,
      stageId: 'second',
      decision: 'approve',
      reason: '',
      expectedRevision: 0
    };
    await expect(act(state, review, reviewer)).rejects.toThrow(/前置/);
    await act(state, { ...review, stageId: 'first' }, reviewer);
    const merge = {
      type: 'merge',
      prId: 'pr1',
      candidateId: candidate.id,
      expectedSource: 'commit1',
      expectedTarget: null
    };
    await expect(act(state, merge)).rejects.toThrow(/批准/);
    await act(state, { ...review, expectedRevision: 1 }, reviewer);
    await act(state, merge);
    expect(state.prs.pr1.status).toBe('merged');
  });
  it('closing and reopening cannot reuse a green candidate; stale review revisions never overwrite newer decisions', async () => {
    const state = create();
    await invite(state);
    const candidate = await ready(state);
    await approve(state, 'pr1', candidate.id);
    await expect(approve(state, 'pr1', candidate.id)).rejects.toThrow(/版本/);
    await act(state, { type: 'pr_state', prId: 'pr1', status: 'closed', expectedRevision: state.prs.pr1.revision });
    await act(state, { type: 'pr_state', prId: 'pr1', status: 'review', expectedRevision: state.prs.pr1.revision });
    expect(state.prs.pr1.candidateId).toBeNull();
    expect(state.reviews).toHaveLength(1);
  });
  it('persists PR intent and its explicit shared target, rejects alternate write targets', async () => {
    const state = create();
    await ready(state);
    await act(state, { type: 'pr_state', prId: 'pr1', status: 'closed', expectedRevision: state.prs.pr1.revision });
    await act(state, {
      type: 'pr',
      id: 'intent',
      taskId: 'task1',
      title: 'Replace laptops',
      description: 'Approved procurement scope',
      target: 'shared'
    });
    expect(state.prs.intent).toMatchObject({ description: 'Approved procurement scope', target: 'shared' });
    expect(state.head).toBeNull();
    await expect(
      act(state, {
        type: 'pr',
        id: 'invalid-target',
        taskId: 'task1',
        title: 'Invalid',
        description: '',
        target: 'other'
      })
    ).rejects.toThrow(/共享分支/);
  });

  it('reopens resolved required threads only when the anchored result changes in a new candidate', async () => {
    const state = create();
    await invite(state);
    const first = await ready(state);
    await act(
      state,
      {
        type: 'thread',
        id: 'required',
        prId: 'pr1',
        candidateId: first.id,
        recordId: 'asset',
        field: 'purchasePrice',
        body: 'Check cost',
        required: true,
        mentions: []
      },
      reviewer
    );
    await act(state, { type: 'resolve_thread', threadId: 'required', resolved: true, expectedRevision: 0 }, reviewer);
    await act(state, { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] });
    expect(state.threads.required.resolved).toBe(true);
    await act(state, {
      type: 'upload',
      taskId: 'task1',
      expectedHead: 'commit1',
      commits: [await commit(state, 'new-price', 'commit1', records(999), 'Revised price')]
    });
    const outcome = await act(state, {
      type: 'candidate',
      prId: 'pr1',
      expectedRevision: state.prs.pr1.revision,
      resolutions: []
    });
    expect(state.threads.required.resolved).toBe(false);
    expect(state.threads.required.candidateId).toBe(first.id);
    expect(outcome['reopenedThreads']).toEqual(['required']);
    expect(state.threads.required.revision).toBe(2);
    await act(state, { type: 'resolve_thread', threadId: 'required', resolved: true, expectedRevision: 2 }, reviewer);
    await act(state, { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] });
    expect(state.threads.required.resolved).toBe(true);
  });
});

describe('cross-feature acceptance boundaries', () => {
  it('preserves each reviewer blocker and required thread until its own authorized resolution', async () => {
    const state = create();
    await invite(state);
    const candidate = await ready(state);
    const second = { id: 'second', email: 'second@example.test', verified: true };
    state.members[second.id] = { ...state.members[reviewer.id], id: second.id, email: second.email };
    await act(
      state,
      {
        type: 'review',
        prId: 'pr1',
        candidateId: candidate.id,
        expectedSource: candidate.source,
        stageId: 'review',
        decision: 'request_changes',
        reason: 'Verify cost',
        expectedRevision: 0
      },
      reviewer
    );
    await approve(state, 'pr1', candidate.id, second);
    await act(
      state,
      {
        type: 'thread',
        id: 'required',
        prId: 'pr1',
        candidateId: candidate.id,
        recordId: 'asset',
        field: 'purchasePrice',
        body: 'Check total',
        required: true,
        mentions: []
      },
      reviewer
    );
    const merge = {
      type: 'merge',
      prId: 'pr1',
      candidateId: candidate.id,
      expectedSource: candidate.source,
      expectedTarget: null
    };
    await expect(act(state, merge)).rejects.toThrow(/要求修改/);
    await expect(
      act(
        state,
        { type: 'dismiss', prId: 'pr1', reviewerId: reviewer.id, reason: 'Override', expectedRevision: 1 },
        second
      )
    ).rejects.toThrow(/权限/);
    await approve(state, 'pr1', candidate.id, reviewer, 1);
    await expect(act(state, merge)).rejects.toThrow(/讨论/);
    await act(state, { type: 'resolve_thread', threadId: 'required', resolved: true, expectedRevision: 0 }, reviewer);
    await act(state, merge);
    expect(state.prs.pr1.status).toBe('merged');
    expect(state.reviews.filter(r => r.decision === 'request_changes')).toHaveLength(1);
  });
  it('enforces independent parallel stages, distinct approval counts and assigned reviewer permissions', async () => {
    const state = create();
    await invite(state);
    const second = { id: 'second', email: 'second@example.test', verified: true };
    state.members[second.id] = { ...state.members[reviewer.id], id: second.id, email: second.email };
    await act(state, {
      type: 'policy',
      expectedVersion: 1,
      stages: [
        { id: 'cost', name: 'Cost', minimum: 2, reviewers: [reviewer.id, second.id], after: [] },
        { id: 'risk', name: 'Risk', minimum: 1, reviewers: [second.id], after: [] }
      ]
    });
    const candidate = await ready(state);
    const review = {
      type: 'review',
      prId: 'pr1',
      candidateId: candidate.id,
      expectedSource: candidate.source,
      stageId: 'risk',
      decision: 'approve',
      reason: '',
      expectedRevision: 0
    };
    await expect(act(state, review, reviewer)).rejects.toThrow(/阶段/);
    await act(state, review, second);
    await act(state, { ...review, stageId: 'cost' }, reviewer);
    const merge = {
      type: 'merge',
      prId: 'pr1',
      candidateId: candidate.id,
      expectedSource: candidate.source,
      expectedTarget: null
    };
    await expect(act(state, merge)).rejects.toThrow(/批准/);
    await act(state, { ...review, stageId: 'cost', expectedRevision: 1 }, reviewer);
    await expect(act(state, merge)).rejects.toThrow(/批准/);
    await act(state, { ...review, stageId: 'cost', expectedRevision: 1 }, second);
    await act(state, merge);
    expect(state.prs.pr1.status).toBe('merged');
  });
  it('rejects stale concurrent candidates, missing ancestry and post-merge writes without rewriting history', async () => {
    const state = create();
    await invite(state);
    const original = await ready(state);
    const make = { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] };
    await act(state, make);
    await expect(act(state, make)).rejects.toThrow(/版本/);
    const candidate = state.candidates[state.prs.pr1.candidateId!];
    expect(state.candidates[original.id]).toEqual(original);
    state.tasks.task1.base = 'missing';
    await expect(act(state, { ...make, expectedRevision: state.prs.pr1.revision })).rejects.toThrow(/共同起点/);
    state.tasks.task1.base = null;
    await approve(state, 'pr1', candidate.id);
    await act(state, {
      type: 'merge',
      prId: 'pr1',
      candidateId: candidate.id,
      expectedSource: candidate.source,
      expectedTarget: null
    });
    const before = structuredClone(state);
    await expect(
      act(state, { type: 'pr_state', prId: 'pr1', status: 'draft', expectedRevision: state.prs.pr1.revision })
    ).rejects.toThrow(/合并/);
    await expect(
      act(state, {
        type: 'upload',
        taskId: 'task1',
        expectedHead: candidate.source,
        commits: [await commit(state, 'late', candidate.source, records(500), 'Late edit')]
      })
    ).rejects.toThrow(/合并/);
    expect(state).toEqual(before);
  });
});

/** 执行读取并返回错误码；没有抛错时返回 `none`，用来断言授权与未知 ID。 */
const codeOf = async (work: () => Promise<unknown> | unknown) => {
  try {
    await work();
  } catch (error) {
    return error instanceof CollaborationError ? error.code : 'unexpected';
  }
  return 'none';
};
/** 已合并一次的工作区：共享分支有头提交，候选与提交的内容都不为空。 */
async function merged() {
  const state = create();
  await invite(state);
  const candidate = await ready(state);
  await approve(state, 'pr1', candidate.id);
  await act(state, {
    type: 'merge',
    prId: 'pr1',
    candidateId: candidate.id,
    expectedSource: 'commit1',
    expectedTarget: null
  });
  return { state, candidate };
}

describe('workspace summary', () => {
  it('lists commits as metadata only and candidates without records, keeping merge links and review facts', async () => {
    const { state, candidate } = await merged();
    const summary = await space(state).summary(reviewer, 1000);
    expect(summary).not.toHaveProperty('records');
    expect(summary.head).toBe(state.head);
    expect(Object.keys(summary.commits)).toEqual(['commit1', state.head]);
    expect(summary.commits['commit1']).toEqual({ id: 'commit1', parent: null, authorId: 'admin', message: 'Assets' });
    expect(summary.commits[state.head!]).toEqual({
      id: state.head,
      parent: null,
      authorId: 'admin',
      message: 'Merge Asset update',
      mergeSource: 'commit1',
      candidateId: candidate.id
    });
    for (const item of Object.values(summary.commits)) {
      expect(item).not.toHaveProperty('records');
      expect(item).not.toHaveProperty('changes');
      expect(item).not.toHaveProperty('fingerprint');
    }
    expect(Object.keys(summary.candidates)).toEqual([candidate.id]);
    expect(summary.candidates[candidate.id]).not.toHaveProperty('records');
    expect(summary.candidates[candidate.id]).not.toHaveProperty('changes');
    expect(summary.candidates[candidate.id]).toEqual(candidateSummary(state.candidates[candidate.id]));
    expect(summary.reviews).toEqual(state.reviews);
    expect(summary.governance).toEqual([
      { prId: 'pr1', blockers: [], stages: [{ id: 'review', name: '审核', minimum: 1, approved: 1, complete: true }] }
    ]);
  });
  it('keeps conflicts and checks in the candidate summary so views can show them without loading content', async () => {
    const state = create();
    await ready(state);
    await act(state, {
      type: 'upload',
      taskId: 'task1',
      expectedHead: 'commit1',
      commits: [await commit(state, 'dangling', 'commit1', records(100, 'missing'))]
    });
    await act(state, { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] });
    const current = state.candidates[state.prs.pr1.candidateId!];
    const summary = (await space(state).summary(admin, 1000)).candidates[current.id];
    expect(summary.checks).not.toHaveLength(0);
    expect(summary.checks).toEqual(current.checks);
    expect(summary.conflicts).toEqual(current.conflicts);
    expect(summary.resolutions).toEqual(current.resolutions);
    expect(summary).toMatchObject({ source: 'dangling', target: null, base: null, prId: 'pr1' });
  });
  it('does not grow with the number of records in a commit', async () => {
    const state = create();
    await act(state, { type: 'task', id: 'big', name: 'Big', expectedHead: null });
    const rows = Object.fromEntries(
      Array.from({ length: 1000 }, (_, index) => [
        `c${index}`,
        { entity: 'AssetCategory' as const, fields: { name: `Category ${index} with a reasonably long name` } }
      ])
    );
    await act(state, {
      type: 'upload',
      taskId: 'big',
      expectedHead: null,
      commits: [await commit(state, 'huge', null, rows, 'Huge')]
    });
    expect(JSON.stringify(rows).length).toBeGreaterThan(50_000);
    expect(JSON.stringify(await space(state).summary(admin, 1000)).length).toBeLessThan(4_000);
    expect(JSON.stringify(state).length).toBeLessThan(6_000);
  });
  it('returns the latest 50 audit events in chronological order together with the total count', async () => {
    const state = create();
    for (let index = 0; index < 60; index++)
      await act(state, { type: 'task', id: `task-${index}`, name: `Task ${index}`, expectedHead: null });
    const summary = await space(state).summary(admin, 1000);
    expect(state.audit).toHaveLength(61);
    expect(summary.auditCount).toBe(61);
    expect(summary.audit).toHaveLength(50);
    expect(summary.audit).toEqual(state.audit.slice(-50));
    expect(summary.audit.at(-1)?.details['id']).toBe('task-59');
  });
  it('returns the whole audit trail when it is shorter than the summary window', async () => {
    const state = create();
    await invite(state);
    const summary = await space(state).summary(admin, 1000);
    expect(summary.auditCount).toBe(state.audit.length);
    expect(summary.audit).toEqual(state.audit);
  });
  it('keeps notifications private to their recipient and invitations visible to managers only', async () => {
    const state = create();
    await invite(state);
    const candidate = await ready(state);
    const thread = {
      type: 'thread',
      id: 'mention',
      prId: 'pr1',
      candidateId: candidate.id,
      recordId: null,
      field: null,
      body: 'Ping',
      required: false,
      mentions: ['admin']
    };
    await act(state, thread, reviewer);
    await act(state, { type: 'reply', threadId: 'mention', body: 'Ping back', mentions: ['reviewer'] });
    const forAdmin = (await space(state).summary(admin, 1000)).notifications;
    const forReviewer = (await space(state).summary(reviewer, 1000)).notifications;
    expect(forAdmin).not.toHaveLength(0);
    expect(forReviewer).not.toHaveLength(0);
    expect(forAdmin.every(notice => notice.userId === 'admin')).toBe(true);
    expect(forReviewer.every(notice => notice.userId === 'reviewer')).toBe(true);
    expect((await space(state).summary(admin, 1000)).invitations).toHaveLength(1);
    expect((await space(state).summary(reviewer, 1000)).invitations).toEqual([]);
  });
});

describe('on-demand reads', () => {
  it('serves shared records with their head, and full commit and candidate content, to readers', async () => {
    const { state, candidate } = await merged();
    const workspace = space(state);
    expect(await workspace.records(reviewer)).toEqual({ head: state.head, records: records(100) });
    expect((await workspace.records(reviewer)).records['asset'].fields['purchasePrice']).toBe(100);
    expect(await workspace.commit(reviewer, 'commit1')).toEqual({
      id: 'commit1',
      parent: null,
      authorId: 'admin',
      message: 'Assets',
      records: records(100)
    });
    expect(await workspace.commit(reviewer, state.head!)).toEqual({
      id: state.head,
      parent: null,
      authorId: 'admin',
      message: 'Merge Asset update',
      mergeSource: 'commit1',
      candidateId: candidate.id,
      records: records(100)
    });
    expect(await workspace.candidate(reviewer, candidate.id)).toEqual({
      ...candidateSummary(state.candidates[candidate.id]),
      records: records(100)
    });
    expect((await workspace.candidate(reviewer, candidate.id)).records['category']).toEqual(records().category);
  });
  it('serves an empty shared branch before the first merge', async () => {
    const state = create();
    expect(await space(state).records(admin)).toEqual({ head: null, records: {} });
  });
  it('answers unknown, inherited and cross-kind ids with not_found', async () => {
    const { state, candidate } = await merged();
    for (const id of ['missing', 'constructor', '__proto__', 'toString', candidate.id])
      expect(await codeOf(() => space(state).commit(admin, id)), `commit ${id}`).toBe('not_found');
    for (const id of ['missing', 'constructor', '__proto__', 'commit1', state.head!])
      expect(await codeOf(() => space(state).candidate(admin, id)), `candidate ${id}`).toBe('not_found');
  });
  it('requires an active, verified member with read permission for every read', async () => {
    const { state, candidate } = await merged();
    const stranger: Identity = { id: 'stranger', email: 'stranger@example.test', verified: true };
    const reads = (user: Identity) => [
      () => space(state).records(user),
      () => space(state).commit(user, 'commit1'),
      () => space(state).candidate(user, candidate.id),
      () => auditPage(state, user, {})
    ];
    for (const read of reads(admin)) expect(await codeOf(read)).toBe('none');
    for (const read of reads(stranger)) expect(await codeOf(read)).toBe('forbidden');
    for (const read of reads({ ...admin, verified: false })) expect(await codeOf(read)).toBe('forbidden');
    await act(state, { type: 'member', userId: reviewer.id, permissions: [], active: false, expectedGeneration: 1 });
    for (const read of reads(reviewer)) expect(await codeOf(read)).toBe('forbidden');
  });
  it('returns copies so callers cannot alter workspace state or later reads', async () => {
    const { state, candidate } = await merged();
    (await space(state).records(admin)).records['asset'].fields['purchasePrice'] = 1;
    (await space(state).commit(admin, 'commit1')).records['asset'].fields['purchasePrice'] = 2;
    (await space(state).candidate(admin, candidate.id)).records['asset'].fields['purchasePrice'] = 3;
    auditPage(state, admin, {}).events[0].details['type'] = 'tampered';
    expect((await shared(state))['asset'].fields['purchasePrice']).toBe(100);
    expect((await contentOf(state, 'commit1'))['asset'].fields['purchasePrice']).toBe(100);
    expect((await space(state).candidate(admin, candidate.id)).records['asset'].fields['purchasePrice']).toBe(100);
    expect(state.audit.at(-1)?.details['type']).toBe('merge');
  });
});

describe('audit pages', () => {
  /** 两个 PR、各一条讨论线程的工作区，含邀请、任务、上传等与 PR 无关的事件。 */
  async function discussed() {
    const state = create();
    await invite(state);
    const first = await ready(state);
    const second = await ready(state, '2');
    const thread = (id: string, prId: string, candidateId: string) =>
      act(
        state,
        {
          type: 'thread',
          id,
          prId,
          candidateId,
          recordId: null,
          field: null,
          body: `Discuss ${id}`,
          required: false,
          mentions: []
        },
        reviewer
      );
    await thread('t1', 'pr1', first.id);
    await thread('t2', 'pr2', second.id);
    await act(state, { type: 'reply', threadId: 't1', body: 'Reply 1', mentions: [] });
    await act(state, { type: 'reply', threadId: 't2', body: 'Reply 2', mentions: [] });
    await act(state, { type: 'resolve_thread', threadId: 't1', resolved: true, expectedRevision: 1 }, reviewer);
    return state;
  }
  const actions = (events: { action: string }[]) => events.map(event => event.action);
  it('pages newest first and chains pages through nextBefore until the log is exhausted', async () => {
    const state = await discussed();
    const seen: string[] = [];
    let before: string | undefined;
    let pages = 0;
    do {
      const page = auditPage(state, admin, { before, limit: 4 });
      expect(page.events.length).toBeGreaterThan(0);
      expect(page.events.length).toBeLessThanOrEqual(4);
      seen.push(...page.events.map(event => event.id));
      before = page.nextBefore ?? undefined;
      pages++;
    } while (before);
    expect(pages).toBe(Math.ceil(state.audit.length / 4));
    expect(seen).toEqual(state.audit.map(event => event.id).reverse());
  });
  it('sets nextBefore to the oldest returned event only while older events remain', async () => {
    const state = await discussed();
    const total = state.audit.length;
    const all = auditPage(state, admin, { limit: 100 });
    expect(all.events).toHaveLength(total);
    expect(all.nextBefore).toBeNull();
    const exact = auditPage(state, admin, { limit: total });
    expect(exact.nextBefore).toBeNull();
    const partial = auditPage(state, admin, { limit: total - 1 });
    expect(partial.nextBefore).toBe(state.audit[1].id);
    expect(partial.events.at(-1)?.id).toBe(state.audit[1].id);
    expect(auditPage(state, admin, { before: state.audit[0].id }).events).toEqual([]);
    expect(auditPage(state, admin, { before: state.audit[0].id }).nextBefore).toBeNull();
  });
  it('defaults to 50 events and returns the stored events unchanged', async () => {
    const state = create();
    for (let index = 0; index < 60; index++)
      await act(state, { type: 'task', id: `task-${index}`, name: `Task ${index}`, expectedHead: null });
    const page = auditPage(state, admin, {});
    expect(page.events).toHaveLength(50);
    expect(page.events[0]).toEqual(state.audit.at(-1));
    expect(page.nextBefore).toBe(state.audit.at(-50)?.id);
    const rest = auditPage(state, admin, { before: page.nextBefore! });
    expect(rest.events).toHaveLength(state.audit.length - 50);
    expect(rest.nextBefore).toBeNull();
  });
  it('filters by thread with the same rule the discussion history used on the client', async () => {
    const state = await discussed();
    expect(actions(auditPage(state, admin, { threadId: 't1' }).events)).toEqual(['resolve_thread', 'reply', 'thread']);
    expect(actions(auditPage(state, admin, { threadId: 't2' }).events)).toEqual(['reply', 'thread']);
    expect(auditPage(state, admin, { threadId: 'unknown' })).toEqual({ events: [], nextBefore: null });
    const paged = auditPage(state, admin, { threadId: 't1', limit: 1 });
    expect(actions(paged.events)).toEqual(['resolve_thread']);
    expect(paged.nextBefore).toBe(paged.events[0].id);
    expect(actions(auditPage(state, admin, { threadId: 't1', limit: 1, before: paged.nextBefore! }).events)).toEqual([
      'reply'
    ]);
  });
  it('filters by pull request, including its threads, and excludes unrelated events', async () => {
    const state = await discussed();
    const first = auditPage(state, admin, { prId: 'pr1' });
    expect(actions(first.events)).toEqual(['resolve_thread', 'reply', 'thread', 'candidate', 'pr_state', 'pr']);
    expect(first.nextBefore).toBeNull();
    const second = auditPage(state, admin, { prId: 'pr2' });
    expect(actions(second.events)).toEqual(['reply', 'thread', 'candidate', 'pr_state', 'pr']);
    expect(first.events.some(event => second.events.includes(event))).toBe(false);
    expect(auditPage(state, admin, { prId: 'pr1', threadId: 't2' }).events).toEqual([]);
    expect(actions(auditPage(state, admin, { prId: 'pr1', threadId: 't1' }).events)).toEqual([
      'resolve_thread',
      'reply',
      'thread'
    ]);
  });
  it('pages across a filter even when the cursor event itself does not match it', async () => {
    const state = await discussed();
    const cursor = state.audit.at(-1)!;
    expect(cursor.action).toBe('resolve_thread');
    const page = auditPage(state, admin, { before: cursor.id, prId: 'pr2' });
    expect(actions(page.events)).toEqual(['reply', 'thread', 'candidate', 'pr_state', 'pr']);
  });
  it('rejects an unknown cursor and a limit outside 1 to 100', async () => {
    const state = await discussed();
    expect(await codeOf(() => auditPage(state, admin, { before: 'missing' }))).toBe('not_found');
    for (const limit of [0, -1, 101, 1.5, Number.NaN])
      expect(await codeOf(() => auditPage(state, admin, { limit }))).toBe('invalid');
    expect(await codeOf(() => auditPage(state, admin, { limit: 1 }))).toBe('none');
    expect(await codeOf(() => auditPage(state, admin, { limit: 100 }))).toBe('none');
  });
});
