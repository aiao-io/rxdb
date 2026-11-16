import { describe, expect, it } from 'vitest';
import type { Command, Identity, Workspace } from '../model.js';
import { bootstrap, execute, snapshot } from './engine.js';
const admin: Identity = { id: 'admin', email: 'admin@example.test', verified: true };
const reviewer: Identity = { id: 'reviewer', email: 'reviewer@example.test', verified: true };
let serial = 0;
const env = () => ({ now: 1000, id: () => `generated-${++serial}` });
const create = () => bootstrap({ teamId: 'team', appId: 'assets', name: 'Team', bootstrapKey: 'seed', admin }, env());
const act = (
  state: Workspace,
  command: Omit<Command, 'operationId'> | Record<string, unknown>,
  actor = admin,
  operationId = `operation-${++serial}`
) => execute(state, actor, { ...command, operationId } as Command, env());
function invite(state: Workspace) {
  act(state, {
    type: 'invite',
    id: 'invite',
    email: reviewer.email,
    permissions: ['read', 'edit', 'review', 'comment'],
    tokenHash: 'token',
    expiresAt: 5000,
    expectedVersion: 0
  });
  act(state, { type: 'accept_invite', id: 'invite', tokenHash: 'token' }, reviewer);
}
const records = (price = 100) => ({
  category: { entity: 'AssetCategory' as const, fields: { name: 'Computers' } },
  asset: { entity: 'Asset' as const, fields: { name: 'Laptop', categoryId: 'category', purchasePrice: price } }
});
function ready(state: Workspace, suffix = '1', price = 100) {
  act(state, { type: 'task', id: `task${suffix}`, name: 'Update assets', expectedHead: state.head });
  act(state, {
    type: 'upload',
    taskId: `task${suffix}`,
    expectedHead: state.head,
    commits: [
      { id: `commit${suffix}`, parent: state.head, authorId: admin.id, records: records(price), message: 'Assets' }
    ]
  });
  act(state, {
    type: 'pr',
    id: `pr${suffix}`,
    taskId: `task${suffix}`,
    title: 'Asset update',
    description: '',
    target: 'shared'
  });
  act(state, { type: 'pr_state', prId: `pr${suffix}`, status: 'review', expectedRevision: 0 });
  act(state, { type: 'candidate', prId: `pr${suffix}`, expectedRevision: 1, resolutions: [] });
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
  it('bootstraps an empty workspace; uninvited users cannot read or claim admin', () => {
    const state = create();
    expect(state.records).toEqual({});
    expect(state.head).toBeNull();
    expect(() => snapshot(state, reviewer, 1000)).toThrow(/权限/);
    expect(() => act(state, { type: 'task', id: 'x', name: 'x', expectedHead: null }, reviewer)).toThrow(/权限/);
  });
  it('does not consume an invitation for a wrong email, and consumed invitations never resurrect removed members', () => {
    const state = create();
    act(state, {
      type: 'invite',
      id: 'i',
      email: reviewer.email,
      permissions: ['read'],
      tokenHash: 'token',
      expiresAt: 5000,
      expectedVersion: 0
    });
    expect(() =>
      act(state, { type: 'accept_invite', id: 'i', tokenHash: 'token' }, { ...reviewer, email: 'wrong@example.test' })
    ).toThrow();
    expect(state.invitations.i.state).toBe('pending');
    act(state, { type: 'accept_invite', id: 'i', tokenHash: 'token' }, reviewer, 'accept');
    act(state, { type: 'member', userId: reviewer.id, permissions: [], active: false, expectedGeneration: 1 });
    expect(() => act(state, { type: 'accept_invite', id: 'i', tokenHash: 'token' }, reviewer, 'accept')).toThrow();
  });
  it('retries preserve the original receipt after the remote head advances, without accepting a fork or forged authors', () => {
    const state = create();
    act(state, { type: 'task', id: 't', name: 't', expectedHead: null });
    const command = {
      type: 'upload',
      taskId: 't',
      expectedHead: null,
      commits: [{ id: 'a', parent: null, authorId: admin.id, records: records(), message: 'first' }]
    };
    act(state, command, admin, 'upload');
    act(state, { ...command, expectedHead: 'a', commits: [{ ...command.commits[0], id: 'b', parent: 'a' }] });
    expect(act(state, command, admin, 'upload').head).toBe('a');
    expect(state.tasks.t.head).toBe('b');
    expect(() => act(state, { ...command, commits: [{ ...command.commits[0], id: 'c' }] })).toThrow(/分叉/);
    expect(() =>
      act(state, {
        ...command,
        expectedHead: 'b',
        commits: [{ ...command.commits[0], id: 'c', parent: 'b', authorId: reviewer.id }]
      })
    ).toThrow(/作者/);
    expect(() => act(state, { ...command, expectedHead: 'changed' }, admin, 'upload')).toThrow(/幂等/);
  });
  it('binds approval and the only shared write to the exact candidate; successful retries do not merge twice', () => {
    const state = create();
    invite(state);
    const candidate = ready(state);
    const merge = {
      type: 'merge',
      prId: 'pr1',
      candidateId: candidate.id,
      expectedSource: 'commit1',
      expectedTarget: null
    };
    expect(() => act(state, merge)).toThrow(/批准/);
    approve(state, 'pr1', candidate.id);
    const receipt = act(state, merge, admin, 'merge');
    expect(state.records.asset.fields.purchasePrice).toBe(100);
    expect(state.prs.pr1.status).toBe('merged');
    expect(act(state, merge, admin, 'merge')).toEqual(receipt);
    expect(state.audit.filter(event => event.action === 'merge')).toHaveLength(1);
  });
  it('keeps request-changes blockers through new candidates and no-approval policies; requires explicit audited dismissal', () => {
    const state = create();
    invite(state);
    const candidate = ready(state);
    act(
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
    act(state, { type: 'policy', stages: [], expectedVersion: 1 });
    act(state, { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] });
    const current = state.prs.pr1.candidateId!;
    const merge = { type: 'merge', prId: 'pr1', candidateId: current, expectedSource: 'commit1', expectedTarget: null };
    expect(() => act(state, merge)).toThrow(/要求修改/);
    act(state, {
      type: 'dismiss',
      prId: 'pr1',
      reviewerId: reviewer.id,
      reason: 'Reviewed with owner',
      expectedRevision: 1
    });
    act(state, merge);
    expect(state.audit.some(event => event.action === 'dismiss')).toBe(true);
  });
  it('does not revive an approval when review permission is revoked and regranted', () => {
    const state = create();
    invite(state);
    const candidate = ready(state);
    approve(state, 'pr1', candidate.id);
    act(state, { type: 'member', userId: reviewer.id, permissions: ['read'], active: true, expectedGeneration: 1 });
    act(state, {
      type: 'member',
      userId: reviewer.id,
      permissions: ['read', 'review'],
      active: true,
      expectedGeneration: 2
    });
    expect(() =>
      act(state, {
        type: 'merge',
        prId: 'pr1',
        candidateId: candidate.id,
        expectedSource: 'commit1',
        expectedTarget: null
      })
    ).toThrow(/批准/);
  });
  it('changing 120 to 999 creates a new candidate even though the source commit is unchanged', () => {
    const state = create();
    invite(state);
    let c = ready(state);
    approve(state, 'pr1', c.id);
    act(state, { type: 'merge', prId: 'pr1', candidateId: c.id, expectedSource: 'commit1', expectedTarget: null });
    const base = state.head;
    ready(state, '2', 120);
    c = ready(state, '3', 110);
    approve(state, 'pr3', c.id);
    act(state, { type: 'merge', prId: 'pr3', candidateId: c.id, expectedSource: 'commit3', expectedTarget: base });
    act(state, {
      type: 'candidate',
      prId: 'pr2',
      expectedRevision: state.prs.pr2.revision,
      resolutions: [{ key: 'asset/purchasePrice', choice: 'source' }]
    });
    const c1 = state.prs.pr2.candidateId!;
    approve(state, 'pr2', c1);
    act(state, {
      type: 'candidate',
      prId: 'pr2',
      expectedRevision: state.prs.pr2.revision,
      resolutions: [{ key: 'asset/purchasePrice', choice: 'custom', value: 999 }]
    });
    const c2 = state.prs.pr2.candidateId!;
    expect(c2).not.toBe(c1);
    expect(() =>
      act(state, { type: 'merge', prId: 'pr2', candidateId: c2, expectedSource: 'commit2', expectedTarget: state.head })
    ).toThrow(/批准/);
    expect(state.candidates[c1].records.asset.fields.purchasePrice).toBe(120);
  });
  it('checks the final merged result for uniqueness, references and types, and does not mutate shared data on failure', () => {
    const state = create();
    const c = ready(state);
    const before = structuredClone(state.records);
    state.commits.commit1.records.asset.fields.categoryId = 'missing';
    act(state, { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] });
    expect(state.candidates[state.prs.pr1.candidateId!].checks).not.toHaveLength(0);
    expect(() => approve(state, 'pr1', c.id, admin)).toThrow();
    expect(state.records).toEqual(before);
  });
});

describe('governance, discussion and identity regressions', () => {
  it('records source-bound change requests before a candidate exists and keeps them blocking the next candidate', () => {
    const state = create();
    invite(state);
    ready(state);
    act(state, { type: 'pr_state', prId: 'pr1', status: 'closed', expectedRevision: state.prs.pr1.revision });
    act(state, { type: 'pr_state', prId: 'pr1', status: 'review', expectedRevision: state.prs.pr1.revision });
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
    expect(() => act(state, { ...review, expectedSource: 'outdated' }, reviewer)).toThrow(/版本/);
    expect(() => act(state, { ...review, decision: 'approve' }, reviewer)).toThrow(/候选/);
    act(state, review, reviewer);
    expect(state.reviews[0]).toMatchObject({ candidateId: null, source: 'commit1', decision: 'request_changes' });
    act(state, { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] });
    const candidateId = state.prs.pr1.candidateId!;
    const merge = { type: 'merge', prId: 'pr1', candidateId, expectedSource: 'commit1', expectedTarget: null };
    expect(() => act(state, merge)).toThrow(/要求修改/);
    approve(state, 'pr1', candidateId, reviewer, 1);
    act(state, merge);
    expect(state.prs.pr1.status).toBe('merged');
  });
  it('resends revoke the original token; inviter revocation and expiration are checked at acceptance', () => {
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
    act(state, invitation);
    act(state, { ...invitation, tokenHash: 'new', expectedVersion: 1 });
    expect(() => act(state, { type: 'accept_invite', id: 'i', tokenHash: 'old' }, reviewer)).toThrow();
    expect(() =>
      execute(
        state,
        reviewer,
        { type: 'accept_invite', id: 'i', tokenHash: 'new', operationId: 'expired' },
        { ...env(), now: 5001 }
      )
    ).toThrow(/过期/);
    state.members.admin.permissions = ['read'];
    expect(() => act(state, { type: 'accept_invite', id: 'i', tokenHash: 'new' }, reviewer)).toThrow(/授权/);
  });
  it('cannot promote existing members through invitations or remove the last administrator', () => {
    const state = create();
    invite(state);
    act(state, {
      type: 'invite',
      id: 'another',
      email: reviewer.email,
      permissions: ['read', 'manage'],
      tokenHash: 'second',
      expiresAt: 5000,
      expectedVersion: 0
    });
    act(state, { type: 'accept_invite', id: 'another', tokenHash: 'second' }, reviewer);
    expect(state.members.reviewer.permissions).not.toContain('manage');
    expect(() =>
      act(state, { type: 'member', userId: 'admin', permissions: [], active: false, expectedGeneration: 1 })
    ).toThrow(/最后/);
  });
  it('forking preserves the immutable local chain and leaves the original task and PR untouched', () => {
    const state = create();
    const candidate = ready(state);
    const original = structuredClone(state.prs.pr1);
    act(state, {
      type: 'fork',
      id: 'fork',
      name: 'Fork',
      taskId: 'task1',
      expectedHead: null,
      commits: [{ id: 'local', parent: null, authorId: admin.id, message: 'Local fork', records: records(999) }]
    });
    expect(state.tasks.task1.head).toBe(candidate.source);
    expect(state.tasks.fork.head).toBe('local');
    expect(state.prs.pr1).toEqual(original);
    expect(state.commits.local.authorId).toBe('admin');
  });
  it('required threads block merging even with a valid approval; notifications are scoped to their recipients', () => {
    const state = create();
    invite(state);
    const candidate = ready(state);
    approve(state, 'pr1', candidate.id);
    act(
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
    expect(snapshot(state, admin, 1000).notifications.length).toBeGreaterThan(0);
    expect(snapshot(state, reviewer, 1000).notifications).toEqual([]);
    const merge = {
      type: 'merge',
      prId: 'pr1',
      candidateId: candidate.id,
      expectedSource: 'commit1',
      expectedTarget: null
    };
    expect(() => act(state, merge)).toThrow(/讨论/);
    act(state, { type: 'resolve_thread', threadId: 'thread', resolved: true, expectedRevision: 0 }, reviewer);
    act(state, merge);
    expect(state.records.asset.fields.purchasePrice).toBe(100);
  });
  it('comments are owned, revision checked and safely tombstoned; positions cannot reference other PRs', () => {
    const state = create();
    invite(state);
    const candidate = ready(state);
    act(
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
    expect(() =>
      act(state, {
        type: 'edit_comment',
        threadId: 't',
        commentId: comment.id,
        body: 'hijacked',
        deleted: false,
        expectedRevision: 0
      })
    ).toThrow(/自己/);
    act(
      state,
      { type: 'edit_comment', threadId: 't', commentId: comment.id, body: '', deleted: true, expectedRevision: 0 },
      reviewer
    );
    expect(state.threads.t.comments[0].body).toBe('');
    expect(state.threads.t.comments[0].deleted).toBe(true);
    expect(state.audit.some(event => event.details['body'] === '<script>bad()</script>')).toBe(true);
    act(state, { type: 'reply', threadId: 't', body: 'Follow-up', mentions: ['reviewer'] });
    const notification = state.notifications.find(n => n.userId === 'reviewer')!;
    expect(() => act(state, { type: 'read_notice', id: notification.id })).toThrow(/通知/);
    act(state, { type: 'read_notice', id: notification.id }, reviewer);
    expect(state.notifications.find(n => n.id === notification.id)?.read).toBe(true);
    expect(() =>
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
    ).toThrow(/记录/);
  });
  it('presence expires and never grants permissions; removed members disappear immediately', () => {
    const state = create();
    invite(state);
    ready(state);
    act(state, { type: 'presence', sessionId: 'browser', prId: 'pr1', recordId: 'asset', leave: false }, reviewer);
    expect(snapshot(state, admin, 1000).presence).toHaveLength(1);
    expect(snapshot(state, admin, 46001).presence).toHaveLength(0);
    act(state, { type: 'member', userId: 'reviewer', permissions: [], active: false, expectedGeneration: 1 });
    expect(snapshot(state, admin, 1000).presence).toHaveLength(0);
    expect(() =>
      act(state, { type: 'presence', sessionId: 'browser', prId: 'pr1', recordId: null, leave: false }, reviewer)
    ).toThrow(/权限/);
  });
  it('multi-stage approval enforces ordering and stage membership and retains blockers', () => {
    const state = create();
    invite(state);
    act(state, {
      type: 'policy',
      expectedVersion: 1,
      stages: [
        { id: 'first', name: 'First', minimum: 1, reviewers: ['reviewer'], after: [] },
        { id: 'second', name: 'Second', minimum: 1, reviewers: ['reviewer'], after: ['first'] }
      ]
    });
    const candidate = ready(state);
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
    expect(() => act(state, review, reviewer)).toThrow(/前置/);
    act(state, { ...review, stageId: 'first' }, reviewer);
    const merge = {
      type: 'merge',
      prId: 'pr1',
      candidateId: candidate.id,
      expectedSource: 'commit1',
      expectedTarget: null
    };
    expect(() => act(state, merge)).toThrow(/批准/);
    act(state, { ...review, expectedRevision: 1 }, reviewer);
    act(state, merge);
    expect(state.prs.pr1.status).toBe('merged');
  });
  it('closing and reopening cannot reuse a green candidate; stale review revisions never overwrite newer decisions', () => {
    const state = create();
    invite(state);
    const candidate = ready(state);
    approve(state, 'pr1', candidate.id);
    expect(() => approve(state, 'pr1', candidate.id)).toThrow(/版本/);
    act(state, { type: 'pr_state', prId: 'pr1', status: 'closed', expectedRevision: state.prs.pr1.revision });
    act(state, { type: 'pr_state', prId: 'pr1', status: 'review', expectedRevision: state.prs.pr1.revision });
    expect(state.prs.pr1.candidateId).toBeNull();
    expect(state.reviews).toHaveLength(1);
  });
  it('persists PR intent and its explicit shared target, rejects alternate write targets', () => {
    const state = create();
    ready(state);
    act(state, { type: 'pr_state', prId: 'pr1', status: 'closed', expectedRevision: state.prs.pr1.revision });
    act(state, {
      type: 'pr',
      id: 'intent',
      taskId: 'task1',
      title: 'Replace laptops',
      description: 'Approved procurement scope',
      target: 'shared'
    });
    expect(state.prs.intent).toMatchObject({ description: 'Approved procurement scope', target: 'shared' });
    expect(state.head).toBeNull();
    expect(() =>
      act(state, {
        type: 'pr',
        id: 'invalid-target',
        taskId: 'task1',
        title: 'Invalid',
        description: '',
        target: 'other'
      })
    ).toThrow(/共享分支/);
  });

  it('reopens resolved required threads only when the anchored result changes in a new candidate', () => {
    const state = create();
    invite(state);
    const first = ready(state);
    act(
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
    act(state, { type: 'resolve_thread', threadId: 'required', resolved: true, expectedRevision: 0 }, reviewer);
    act(state, { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] });
    expect(state.threads.required.resolved).toBe(true);
    act(state, {
      type: 'upload',
      taskId: 'task1',
      expectedHead: 'commit1',
      commits: [
        { id: 'new-price', parent: 'commit1', authorId: admin.id, message: 'Revised price', records: records(999) }
      ]
    });
    const outcome = act(state, {
      type: 'candidate',
      prId: 'pr1',
      expectedRevision: state.prs.pr1.revision,
      resolutions: []
    });
    expect(state.threads.required.resolved).toBe(false);
    expect(state.threads.required.candidateId).toBe(first.id);
    expect(outcome.reopenedThreads).toEqual(['required']);
    expect(state.threads.required.revision).toBe(2);
    act(state, { type: 'resolve_thread', threadId: 'required', resolved: true, expectedRevision: 2 }, reviewer);
    act(state, { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] });
    expect(state.threads.required.resolved).toBe(true);
  });
});

describe('cross-feature acceptance boundaries', () => {
  it('preserves each reviewer blocker and required thread until its own authorized resolution', () => {
    const state = create(); invite(state); const candidate = ready(state);
    const second = { id: 'second', email: 'second@example.test', verified: true };
    state.members[second.id] = { ...state.members[reviewer.id], id: second.id, email: second.email };
    act(state, { type: 'review', prId: 'pr1', candidateId: candidate.id, expectedSource: candidate.source, stageId: 'review', decision: 'request_changes', reason: 'Verify cost', expectedRevision: 0 }, reviewer);
    approve(state, 'pr1', candidate.id, second);
    act(state, { type: 'thread', id: 'required', prId: 'pr1', candidateId: candidate.id, recordId: 'asset', field: 'purchasePrice', body: 'Check total', required: true, mentions: [] }, reviewer);
    const merge = { type: 'merge', prId: 'pr1', candidateId: candidate.id, expectedSource: candidate.source, expectedTarget: null };
    expect(() => act(state, merge)).toThrow(/要求修改/);
    expect(() => act(state, { type: 'dismiss', prId: 'pr1', reviewerId: reviewer.id, reason: 'Override', expectedRevision: 1 }, second)).toThrow(/权限/);
    approve(state, 'pr1', candidate.id, reviewer, 1);
    expect(() => act(state, merge)).toThrow(/讨论/);
    act(state, { type: 'resolve_thread', threadId: 'required', resolved: true, expectedRevision: 0 }, reviewer);
    act(state, merge);
    expect(state.prs.pr1.status).toBe('merged');
    expect(state.reviews.filter(r => r.decision === 'request_changes')).toHaveLength(1);
  });
  it('enforces independent parallel stages, distinct approval counts and assigned reviewer permissions', () => {
    const state = create(); invite(state);
    const second = { id: 'second', email: 'second@example.test', verified: true };
    state.members[second.id] = { ...state.members[reviewer.id], id: second.id, email: second.email };
    act(state, { type: 'policy', expectedVersion: 1, stages: [
      { id: 'cost', name: 'Cost', minimum: 2, reviewers: [reviewer.id, second.id], after: [] },
      { id: 'risk', name: 'Risk', minimum: 1, reviewers: [second.id], after: [] }
    ] });
    const candidate = ready(state);
    const review = { type: 'review', prId: 'pr1', candidateId: candidate.id, expectedSource: candidate.source, stageId: 'risk', decision: 'approve', reason: '', expectedRevision: 0 };
    expect(() => act(state, review, reviewer)).toThrow(/阶段/);
    act(state, review, second);
    act(state, { ...review, stageId: 'cost' }, reviewer);
    const merge = { type: 'merge', prId: 'pr1', candidateId: candidate.id, expectedSource: candidate.source, expectedTarget: null };
    expect(() => act(state, merge)).toThrow(/批准/);
    act(state, { ...review, stageId: 'cost', expectedRevision: 1 }, reviewer);
    expect(() => act(state, merge)).toThrow(/批准/);
    act(state, { ...review, stageId: 'cost', expectedRevision: 1 }, second);
    act(state, merge);
    expect(state.prs.pr1.status).toBe('merged');
  });
  it('rejects stale concurrent candidates, missing ancestry and post-merge writes without rewriting history', () => {
    const state = create(); invite(state); const original = ready(state);
    const make = { type: 'candidate', prId: 'pr1', expectedRevision: state.prs.pr1.revision, resolutions: [] };
    act(state, make);
    expect(() => act(state, make)).toThrow(/版本/);
    const candidate = state.candidates[state.prs.pr1.candidateId!];
    expect(state.candidates[original.id]).toEqual(original);
    state.tasks.task1.base = 'missing';
    expect(() => act(state, { ...make, expectedRevision: state.prs.pr1.revision })).toThrow(/共同起点/);
    state.tasks.task1.base = null;
    approve(state, 'pr1', candidate.id);
    act(state, { type: 'merge', prId: 'pr1', candidateId: candidate.id, expectedSource: candidate.source, expectedTarget: null });
    const before = structuredClone(state);
    expect(() => act(state, { type: 'pr_state', prId: 'pr1', status: 'draft', expectedRevision: state.prs.pr1.revision })).toThrow(/合并/);
    expect(() => act(state, { type: 'upload', taskId: 'task1', expectedHead: candidate.source, commits: [{ id: 'late', parent: candidate.source, authorId: admin.id, records: records(500), message: 'Late edit' }] })).toThrow(/合并/);
    expect(state).toEqual(before);
  });
});
