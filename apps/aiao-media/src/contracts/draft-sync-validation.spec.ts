import { describe, expect, it } from 'vitest';
import {
  validateDraftConflicts,
  validateDraftContent,
  validateDraftMutation,
  validateDraftPull,
  validateDraftPush,
  validateDraftResolution,
  validateSyncedDraft
} from './draft-sync-validation';
const id = '10000000-0000-4000-8000-000000000001';
const content = {
  kind: 'image',
  prompt: 'metadata',
  requiresReference: false,
  parameters: { operation: 'text-to-image' }
};
const draft = {
  id,
  revision: 1,
  sequence: 1,
  content,
  deleted: false,
  updatedAt: '2026-10-01T00:00:00.000Z'
};
describe('strict metadata-only draft response validation', () => {
  it.each(['fileId', 'referenceId', 'url', 'path', 'credentials', 'userId'])(
    'rejects unexpected %s fields instead of persisting them',
    key => {
      expect(() => validateDraftContent({ ...content, [key]: 'sensitive' })).toThrow();
    }
  );
  it('rejects incompatible version and malformed but parseable replies', () => {
    expect(() =>
      validateDraftPush({
        version: 2,
        status: 'applied',
        draft,
        reused: false
      })
    ).toThrow();
    expect(() =>
      validateDraftPull({
        version: 1,
        drafts: null,
        reset: false,
        hasMore: false,
        checkpoint: 'checkpoint'
      })
    ).toThrow();
    expect(() => validateDraftConflicts({ version: 1, conflicts: [null] })).toThrow();
  });
  it('rejects tombstone payloads, invalid revisions and unknown result fields', () => {
    expect(() =>
      validateDraftPush({
        version: 1,
        status: 'applied',
        draft: { ...draft, deleted: true },
        reused: false
      })
    ).toThrow();
    expect(() =>
      validateDraftPush({
        version: 1,
        status: 'applied',
        draft: { ...draft, revision: 0 },
        reused: false
      })
    ).toThrow();
    expect(() =>
      validateDraftPush({
        version: 1,
        status: 'applied',
        draft,
        reused: false,
        token: 'secret'
      })
    ).toThrow();
  });
  it('accepts supported metadata and explicit tombstones', () => {
    expect(validateDraftPush({ version: 1, status: 'applied', draft, reused: true }).status).toBe('applied');
    expect(
      validateDraftResolution({
        version: 1,
        conflictId: id,
        choice: 'remote',
        draft: { ...draft, deleted: true, content: null },
        resolvedAt: draft.updatedAt,
        reused: false
      }).draft?.deleted
    ).toBe(true);
  });
  it('rejects inconsistent reference hints, model/path strings and unsupported resolution choices', () => {
    expect(() => validateDraftContent({ ...content, requiresReference: true })).toThrow();
    expect(() =>
      validateDraftContent({
        ...content,
        parameters: { modelId: '../../file' }
      })
    ).toThrow();
    expect(() =>
      validateDraftResolution({
        version: 1,
        conflictId: id,
        choice: 'merge',
        draft: null,
        resolvedAt: draft.updatedAt,
        reused: false
      })
    ).toThrow();
  });
});

const mutation = { version: 1, mutationId: id, draftId: id, baseRevision: 0, deleted: false, content };
const retainedConflict = { id, draftId: id, local: mutation, remote: draft, createdAt: draft.updatedAt };
const pull = { version: 1, reset: false, drafts: [draft], checkpoint: 'cursor', hasMore: false };
describe('draft synchronization trust boundaries', () => {
  it.each([null, [], 'text', 1])('rejects non-object content', value => {
    expect(() => validateDraftContent(value)).toThrow();
  });

  it.each([
    { kind: 'unknown' },
    { prompt: 12 },
    { prompt: 'a'.repeat(4001) },
    { prompt: 'control\u0000' },
    { prompt: 'control\u007f' },
    { requiresReference: 'yes' },
    { kind: 'audio', requiresReference: true },
    { parameters: { modelId: 12 } },
    { parameters: { providerInstanceId: 'invalid' } },
    { parameters: { operation: 'reference-image' } },
    { kind: 'video', parameters: { operation: 'text-to-image' } }
  ])('rejects unsafe metadata before it enters a local replica', patch => {
    expect(() => validateDraftContent({ ...content, ...patch })).toThrow();
  });

  it('accepts metadata reference hints without a local file identity', () => {
    const reference = {
      ...content,
      requiresReference: true,
      parameters: { operation: 'reference-image', providerInstanceId: id, modelId: 'model-v1' }
    };
    expect(validateDraftContent(reference)).toEqual(reference);
    expect(
      validateDraftContent({ kind: 'audio', prompt: '声音\n描述\t', requiresReference: false, parameters: {} }).kind
    ).toBe('audio');
  });

  it.each([
    { id: 1 },
    { id: 'invalid' },
    { revision: 1.5 },
    { revision: -1 },
    { sequence: 2147483647 },
    { updatedAt: null },
    { updatedAt: 'not-a-date' },
    { updatedAt: '2026-99-99T00:00:00Z' },
    { updatedAt: '2'.repeat(33) },
    { deleted: null }
  ])('rejects malformed draft identity, revision or time', patch => {
    expect(() => validateSyncedDraft({ ...draft, ...patch })).toThrow();
  });

  it('validates new mutations and explicit deletion mutations independently', () => {
    expect(validateDraftMutation(mutation)).toEqual(mutation);
    expect(validateDraftMutation({ ...mutation, deleted: true, content: null }).deleted).toBe(true);
    expect(() => validateDraftMutation({ ...mutation, deleted: true })).toThrow();
    expect(() => validateDraftMutation({ ...mutation, baseRevision: -1 })).toThrow();
  });

  it('retains both sides of push conflicts and the separately fetched current remote revision', () => {
    const pushed = { version: 1, status: 'conflict', conflict: retainedConflict, reused: false };
    expect(validateDraftPush(pushed)).toEqual(pushed);
    const current = { ...draft, revision: 2 };
    const rows = [{ ...retainedConflict, currentRemote: current }];
    expect(validateDraftConflicts({ version: 1, conflicts: rows })).toEqual(rows);
    expect(
      validateDraftConflicts({ version: 1, conflicts: [{ ...retainedConflict, remote: null, currentRemote: null }] })[0]
        .remote
    ).toBeNull();
  });

  it.each([
    { draftId: '20000000-0000-4000-8000-000000000001' },
    { remote: { ...draft, id: '20000000-0000-4000-8000-000000000001' } },
    { currentRemote: { ...draft, id: '20000000-0000-4000-8000-000000000001' } }
  ])('rejects cross-draft conflict receipts', patch => {
    expect(() =>
      validateDraftConflicts({ version: 1, conflicts: [{ ...retainedConflict, currentRemote: draft, ...patch }] })
    ).toThrow();
  });

  it('rejects duplicate or excessive conflicts instead of silently dropping retained records', () => {
    const row = { ...retainedConflict, currentRemote: draft };
    expect(() => validateDraftConflicts({ version: 1, conflicts: [row, row] })).toThrow();
    expect(() => validateDraftConflicts({ version: 1, conflicts: Array(101).fill(row) })).toThrow();
    expect(() => validateDraftConflicts({ version: 1, conflicts: null })).toThrow();
  });

  it.each([
    { reset: true, hasMore: true },
    { checkpoint: '' },
    { checkpoint: 12 },
    { checkpoint: 'a'.repeat(1025) },
    { hasMore: true, drafts: [] },
    { drafts: [draft, draft] },
    { drafts: Array(101).fill(draft) },
    { reset: true, drafts: [draft, { ...draft, sequence: 2 }] }
  ])('rejects invalid pull checkpoints, truncated snapshots or unstable ordering', patch => {
    expect(() => validateDraftPull({ ...pull, ...patch })).toThrow();
  });

  it('accepts a complete reset and a strictly increasing incremental page', () => {
    expect(validateDraftPull({ ...pull, reset: true })).toEqual({ ...pull, reset: true });
    const next = { ...draft, id: '20000000-0000-4000-8000-000000000001', sequence: 2 };
    expect(validateDraftPull({ ...pull, drafts: [draft, next], hasMore: true }).drafts).toHaveLength(2);
    expect(
      validateDraftResolution({
        version: 1,
        conflictId: id,
        choice: 'local',
        draft: null,
        resolvedAt: draft.updatedAt,
        reused: true
      }).draft
    ).toBeNull();
  });

  it('rejects ambiguous push receipts that carry both a draft and a conflict', () => {
    expect(() =>
      validateDraftPush({ version: 1, status: 'applied', draft, conflict: retainedConflict, reused: false })
    ).toThrow();
    expect(() =>
      validateDraftPush({ version: 1, status: 'conflict', draft, conflict: retainedConflict, reused: false })
    ).toThrow();
    expect(() => validateDraftPush({ version: 1, status: 'unknown', reused: false })).toThrow();
  });
});
