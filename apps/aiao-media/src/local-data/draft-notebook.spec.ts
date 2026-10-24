import { describe, expect, it } from 'vitest';
import type { DraftSyncMutation, DraftSyncPullResult, SyncedDraft, SyncedDraftContent } from '../contracts/index';
import {
  acceptNotebookPull,
  acceptNotebookPush,
  acceptNotebookResolution,
  blockNotebookResolution,
  createNotebookDraft,
  editNotebookDraft,
  emptyNotebook,
  prepareNotebookPushes,
  prepareNotebookResolution,
  recoverNotebookConflict,
  validateNotebook
} from './draft-notebook';
const randomUUID = () => crypto.randomUUID();
const content = (prompt = 'local'): SyncedDraftContent => ({
  kind: 'image',
  prompt,
  requiresReference: false,
  parameters: { operation: 'text-to-image' }
});
const remote = (mutation: DraftSyncMutation, revision = mutation.baseRevision + 1): SyncedDraft => ({
  id: mutation.draftId,
  revision,
  sequence: revision,
  content: mutation.content,
  deleted: mutation.deleted,
  updatedAt: '2026-10-01T00:00:00.000Z'
});
const page = (drafts: SyncedDraft[], reset = false): DraftSyncPullResult => ({
  version: 1,
  drafts,
  reset,
  checkpoint: 'fixture-checkpoint',
  hasMore: false
});
function fixture() {
  const book = emptyNotebook(),
    id = randomUUID();
  createNotebookDraft(book, content(), id);
  const [mutation] = prepareNotebookPushes(book, randomUUID);
  return { book, id, mutation };
}
describe('atomic persistent draft notebook', () => {
  it('retains exactly the same pending request after a crash or lost HTTP receipt', () => {
    const { book, mutation } = fixture();
    const reopened = validateNotebook(JSON.parse(JSON.stringify(book)));
    expect(prepareNotebookPushes(reopened, randomUUID)).toEqual([mutation]);
  });
  it('preserves later edits while an earlier mutation is in flight', () => {
    const { book, id, mutation } = fixture();
    editNotebookDraft(book, id, content('later edit'), 1);
    acceptNotebookPush(book, mutation, {
      version: 1,
      status: 'applied',
      draft: remote(mutation),
      reused: false
    });
    expect(book.drafts[0]).toMatchObject({
      dirty: true,
      baseRevision: 1,
      content: { prompt: 'later edit' },
      pending: null
    });
    expect(prepareNotebookPushes(book, randomUUID)[0]).toMatchObject({
      baseRevision: 1,
      content: { prompt: 'later edit' }
    });
  });
  it('does not mark unrelated, malformed or different-payload push receipts as confirmed', () => {
    const { book, mutation } = fixture();
    expect(() =>
      acceptNotebookPush(book, mutation, {
        version: 1,
        status: 'applied',
        draft: { ...remote(mutation), id: randomUUID() },
        reused: true
      })
    ).toThrow();
    expect(book.drafts[0].pending?.mutation).toEqual(mutation);
    expect(() =>
      acceptNotebookPush(book, mutation, {
        version: 1,
        status: 'applied',
        draft: { ...remote(mutation), content: content('wrong') },
        reused: false
      })
    ).toThrow();
  });
  it('full reset retains dirty local proposals and remote tombstones without resurrection', () => {
    const { book, mutation } = fixture();
    const tombstone = { ...remote(mutation, 2), deleted: true, content: null };
    acceptNotebookPull(book, page([tombstone], true), null);
    expect(book.drafts[0]).toMatchObject({
      dirty: true,
      content: { prompt: 'local' },
      remote: { deleted: true },
      baseRevision: 0
    });
    const fresh = emptyNotebook();
    acceptNotebookPull(fresh, page([tombstone], true), null);
    expect(fresh.drafts[0]).toMatchObject({
      dirty: false,
      deleted: true,
      content: null
    });
  });
  it('advances checkpoint with a page only once and rejects stale concurrent page commits', () => {
    const book = emptyNotebook(),
      { mutation } = fixture();
    acceptNotebookPull(book, page([remote(mutation)]), null);
    expect(() => acceptNotebookPull(book, page([remote(mutation)]), null)).toThrow();
    expect(book.drafts).toHaveLength(1);
  });
  it('does not clear retained clean metadata when an older restored server omits it', () => {
    const { book, mutation } = fixture();
    acceptNotebookPush(book, mutation, {
      version: 1,
      status: 'applied',
      draft: remote(mutation),
      reused: false
    });
    acceptNotebookPull(book, page([], true), null);
    expect(book.drafts[0]).toMatchObject({
      dirty: true,
      baseRevision: 1,
      content: { prompt: 'local' }
    });
  });
  it('keeps conflict, original proposal and durable explicit choice after process restart', () => {
    const { book, mutation } = fixture(),
      id = randomUUID();
    acceptNotebookPush(book, mutation, {
      version: 1,
      status: 'conflict',
      reused: false,
      conflict: {
        id,
        draftId: mutation.draftId,
        local: mutation,
        remote: { ...remote(mutation), deleted: true, content: null },
        createdAt: '2026-10-01T00:00:00.000Z'
      }
    });
    expect(prepareNotebookPushes(book, randomUUID)).toEqual([]);
    const choice = prepareNotebookResolution(book, id, 'local');
    const reopened = validateNotebook(JSON.parse(JSON.stringify(book)));
    expect(prepareNotebookResolution(reopened, id, 'local')).toEqual(choice);
    expect(() => prepareNotebookResolution(reopened, id, 'remote')).toThrow();
    acceptNotebookResolution(reopened, id, {
      version: 1,
      conflictId: id,
      choice: 'local',
      draft: remote(mutation, 2),
      reused: true,
      resolvedAt: '2026-10-01T00:00:00.000Z'
    });
    expect(reopened.drafts[0]).toMatchObject({
      content: { prompt: 'local' },
      deleted: false,
      dirty: false,
      baseRevision: 2,
      conflict: null,
      resolution: null
    });
  });
  it('CAS rejects a stale editor rather than overwriting another window', () => {
    const { book, id } = fixture();
    editNotebookDraft(book, id, content('winner'), 1);
    expect(() => editNotebookDraft(book, id, content('loser'), 1)).toThrow();
    expect(book.drafts[0].content?.prompt).toBe('winner');
  });
  it('preserves newer pre-conflict edits even when choosing the remote version', () => {
    const { book, id, mutation } = fixture(),
      conflictId = randomUUID();
    editNotebookDraft(book, id, content('newer offline edit'), 1);
    acceptNotebookPush(book, mutation, {
      version: 1,
      status: 'conflict',
      reused: false,
      conflict: {
        id: conflictId,
        draftId: id,
        local: mutation,
        remote: remote(mutation),
        createdAt: '2026-10-01T00:00:00.000Z'
      }
    });
    prepareNotebookResolution(book, conflictId, 'remote');
    acceptNotebookResolution(book, conflictId, {
      version: 1,
      conflictId,
      choice: 'remote',
      draft: remote(mutation),
      resolvedAt: '2026-10-01T00:00:00.000Z',
      reused: false
    });
    expect(book.drafts[0]).toMatchObject({
      dirty: true,
      content: { prompt: 'newer offline edit' },
      baseRevision: 1
    });
  });
  it('rejects corrupted persisted queues rather than silently replacing them', () => {
    const { book } = fixture();
    const pending = book.drafts[0].pending;
    if (!pending) throw new Error('fixture');
    pending.mutation.draftId = randomUUID();
    expect(() => validateNotebook(book)).toThrow();
    expect(() => validateNotebook({ version: 2, drafts: [] })).toThrow();
  });
  it('recovers a decision committed elsewhere only by explicit independent copy, retaining the original durable proposal', () => {
    const { book, id, mutation } = fixture(),
      conflictId = randomUUID();
    acceptNotebookPush(book, mutation, {
      version: 1,
      status: 'conflict',
      reused: false,
      conflict: {
        id: conflictId,
        draftId: id,
        local: mutation,
        remote: remote(mutation),
        createdAt: '2026-10-01T00:00:00.000Z'
      }
    });
    prepareNotebookResolution(book, conflictId, 'local');
    blockNotebookResolution(book, conflictId);
    const reopened = validateNotebook(JSON.parse(JSON.stringify(book)));
    expect(() => prepareNotebookResolution(reopened, conflictId, 'local')).toThrow();
    const recovered = recoverNotebookConflict(reopened, id, randomUUID());
    expect(recoverNotebookConflict(reopened, id, randomUUID()).id).toBe(recovered.id);
    expect(reopened.drafts[0]).toMatchObject({
      resolutionBlocked: true,
      recoveryDraftId: recovered.id,
      pending: { mutation },
      resolution: { choice: 'local' }
    });
    expect(prepareNotebookPushes(reopened, randomUUID)).toHaveLength(1);
    expect(validateNotebook(reopened).drafts).toHaveLength(2);
  });
});
