import type {
  DraftSyncConflictView,
  DraftSyncMutation,
  DraftSyncPullResult,
  DraftSyncPushResult,
  DraftSyncResolution,
  DraftSyncResolutionResult,
  SyncedDraft,
  SyncedDraftContent
} from '../contracts/index';
import { validateDraftContent, validateDraftMutation, validateSyncedDraft } from '../contracts/index';

export interface NotebookDraft {
  id: string;
  localRevision: number;
  baseRevision: number;
  content: SyncedDraftContent | null;
  deleted: boolean;
  dirty: boolean;
  remote: SyncedDraft | null;
  pending: { mutation: DraftSyncMutation; localRevision: number } | null;
  conflict: DraftSyncConflictView | null;
  resolution: DraftSyncResolution | null;
  /** Another device committed a different decision; retain this proposal, never retry/overwrite it. */
  resolutionBlocked?: true;
  recoveryDraftId?: string;
}
export interface DraftNotebook {
  version: 1;
  checkpoint: string | null;
  drafts: NotebookDraft[];
}
export const emptyNotebook = (): DraftNotebook => ({
  version: 1,
  checkpoint: null,
  drafts: []
});
export class NotebookError extends Error {
  constructor(message = '草稿已在另一窗口更新；保留编辑，请重新载入再合并。') {
    super(message);
  }
}
const copy = <T>(value: T): T => structuredClone(value);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)])
    );
  return value;
}
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const find = (book: DraftNotebook, id: string) => {
  const draft = book.drafts.find(item => item.id === id);
  if (!draft) throw new NotebookError('同步草稿不存在；未改动本地数据。');
  return draft;
};
export function createNotebookDraft(book: DraftNotebook, content: SyncedDraftContent, id: string): NotebookDraft {
  if (book.drafts.length >= 1000)
    throw new NotebookError('本机最多保留 1000 个同步草稿 ID（包括删除标记）；不会清理删除标记腾空间。');
  if (book.drafts.some(item => item.id === id)) throw new NotebookError();
  const draft: NotebookDraft = {
    id,
    localRevision: 1,
    baseRevision: 0,
    content: validateDraftContent(content),
    deleted: false,
    dirty: true,
    remote: null,
    pending: null,
    conflict: null,
    resolution: null
  };
  // Validates the generated ID without adding any file or user field to the wire representation.
  validateDraftMutation({
    version: 1,
    mutationId: id,
    draftId: id,
    baseRevision: 0,
    deleted: false,
    content: draft.content
  });
  book.drafts.push(draft);
  return copy(draft);
}
export function editNotebookDraft(
  book: DraftNotebook,
  id: string,
  content: SyncedDraftContent | null,
  expected: number
): NotebookDraft {
  const draft = find(book, id);
  if (draft.localRevision !== expected || draft.conflict) throw new NotebookError();
  draft.content = content === null ? null : validateDraftContent(content);
  draft.deleted = content === null;
  draft.dirty = true;
  ++draft.localRevision;
  return copy(draft);
}
export function prepareNotebookPushes(book: DraftNotebook, uuid: () => string): DraftSyncMutation[] {
  const pushes: DraftSyncMutation[] = [];
  for (const draft of book.drafts) {
    if (draft.conflict || !draft.dirty) continue;
    if (!draft.pending)
      draft.pending = {
        localRevision: draft.localRevision,
        mutation: validateDraftMutation({
          version: 1,
          mutationId: uuid(),
          draftId: draft.id,
          baseRevision: draft.baseRevision,
          deleted: draft.deleted,
          content: copy(draft.content)
        })
      };
    pushes.push(copy(draft.pending.mutation));
  }
  return pushes;
}
function observe(draft: NotebookDraft, remote: SyncedDraft) {
  if (remote.revision < (draft.remote?.revision ?? 0)) return;
  draft.remote = copy(remote);
  if (draft.conflict) draft.conflict.currentRemote = copy(remote);
  if (draft.dirty || draft.pending || draft.conflict) return;
  if (remote.revision < draft.baseRevision) {
    // An older server/database restore must not silently erase acknowledged local data.
    draft.dirty = true;
    return;
  }
  if (draft.baseRevision === remote.revision && draft.deleted === remote.deleted && same(draft.content, remote.content))
    return;
  draft.baseRevision = remote.revision;
  draft.content = copy(remote.content);
  draft.deleted = remote.deleted;
  ++draft.localRevision;
}
export function acceptNotebookPush(book: DraftNotebook, mutation: DraftSyncMutation, result: DraftSyncPushResult) {
  const draft = find(book, mutation.draftId);
  if (!draft.pending || draft.pending.mutation.mutationId !== mutation.mutationId) return;
  if (!same(draft.pending.mutation, mutation)) throw new NotebookError('推送回执与持久请求不匹配。');
  if (result.status === 'conflict') {
    if (!same(result.conflict.local, mutation)) throw new NotebookError('冲突回执与持久请求不匹配。');
    draft.conflict = {
      ...copy(result.conflict),
      currentRemote: copy(result.conflict.remote)
    };
    return;
  }
  if (
    result.draft.id !== draft.id ||
    result.draft.revision !== mutation.baseRevision + 1 ||
    result.draft.deleted !== mutation.deleted ||
    !same(result.draft.content, mutation.content)
  )
    throw new NotebookError('推送回执与持久请求不匹配。');
  const unchanged = draft.localRevision === draft.pending.localRevision;
  draft.pending = null;
  draft.baseRevision = result.draft.revision;
  draft.dirty = !unchanged;
  if (!draft.remote || result.draft.revision >= draft.remote.revision) draft.remote = copy(result.draft);
  if (unchanged && draft.remote.revision > draft.baseRevision) observe(draft, draft.remote);
}
export function acceptNotebookPull(
  book: DraftNotebook,
  result: DraftSyncPullResult,
  expectedCheckpoint: string | null
) {
  if (book.checkpoint !== expectedCheckpoint) throw new NotebookError('检查点已由另一窗口推进，请安全重试。');
  const incoming = new Set(result.drafts.map(item => item.id));
  if (result.reset) {
    for (const draft of book.drafts)
      if (!incoming.has(draft.id) && draft.baseRevision > 0 && !draft.deleted) draft.dirty = true;
  }
  for (const remote of result.drafts) {
    validateSyncedDraft(remote);
    const local = book.drafts.find(item => item.id === remote.id);
    if (local) observe(local, remote);
    else {
      if (book.drafts.length >= 1000) throw new NotebookError('本机草稿目录已满；检查点未推进，未丢弃未确认改动。');
      book.drafts.push({
        id: remote.id,
        localRevision: 1,
        baseRevision: remote.revision,
        deleted: remote.deleted,
        content: copy(remote.content),
        dirty: false,
        remote: copy(remote),
        pending: null,
        conflict: null,
        resolution: null
      });
    }
  }
  book.checkpoint = result.checkpoint;
}
export function acceptNotebookConflicts(book: DraftNotebook, conflicts: DraftSyncConflictView[]) {
  for (const conflict of conflicts) {
    const draft = book.drafts.find(item => item.id === conflict.draftId);
    // A conflict from another device must not be attached to this device's newer proposal.
    if (draft?.pending?.mutation.mutationId === conflict.local.mutationId) draft.conflict = copy(conflict);
  }
  // Never clear a local conflict merely because another device resolved it: its receipt is
  // recovered by idempotent resolve, preserving this device's original proposal.
}
export function acceptNotebookResolution(book: DraftNotebook, conflictId: string, result: DraftSyncResolutionResult) {
  const draft = book.drafts.find(item => item.conflict?.id === conflictId);
  if (!draft) return;
  if (result.conflictId !== conflictId || (result.draft && result.draft.id !== draft.id))
    throw new NotebookError('冲突选择回执不匹配。');
  delete draft.resolutionBlocked;
  delete draft.recoveryDraftId;
  const changed = !draft.pending || draft.localRevision !== draft.pending.localRevision;
  draft.conflict = null;
  draft.pending = null;
  draft.resolution = null;
  draft.baseRevision = result.draft?.revision ?? 0;
  draft.remote = copy(result.draft);
  if (!changed) {
    draft.content = copy(result.draft?.content ?? null);
    draft.deleted = result.draft?.deleted ?? true;
    draft.dirty = false;
    ++draft.localRevision;
  } else draft.dirty = true; // Later cross-window edits survive even an explicit remote choice.
}

export function prepareNotebookResolution(
  book: DraftNotebook,
  id: string,
  choice: DraftSyncResolution['choice']
): DraftSyncResolution {
  const draft = book.drafts.find(item => item.conflict?.id === id);
  if (draft?.resolutionBlocked) throw new NotebookError('另一设备已结算此冲突；原推送版本保留，可显式复制为独立草稿。');
  if (!draft?.conflict) throw new NotebookError('冲突已变化，请重新载入。');
  if (draft.resolution && draft.resolution.choice !== choice)
    throw new NotebookError('已有待确认的冲突选择；只能重试原选择，不能覆盖尚未确认的决定。');
  draft.resolution ??= {
    version: 1,
    choice,
    expectedRemoteRevision: draft.conflict.currentRemote?.revision ?? 0
  };
  return copy(draft.resolution);
}
export function validateNotebook(value: unknown): DraftNotebook {
  if (!value || typeof value !== 'object') throw new NotebookError('同步日志损坏。');
  const book = value as DraftNotebook;
  if (
    book.version !== 1 ||
    !Array.isArray(book.drafts) ||
    book.drafts.length > 1000 ||
    (book.checkpoint !== null && (typeof book.checkpoint !== 'string' || book.checkpoint.length > 1024))
  )
    throw new NotebookError('同步日志版本不兼容。');
  const ids = new Set<string>();
  for (const draft of book.drafts) {
    if (
      !draft ||
      !Number.isSafeInteger(draft.localRevision) ||
      draft.localRevision < 1 ||
      typeof draft.dirty !== 'boolean' ||
      ids.has(draft.id)
    )
      throw new NotebookError('同步日志损坏。');
    ids.add(draft.id);
    validateDraftMutation({
      version: 1,
      mutationId: draft.id,
      draftId: draft.id,
      baseRevision: draft.baseRevision,
      deleted: draft.deleted,
      content: draft.content
    });
    if (draft.remote) {
      validateSyncedDraft(draft.remote);
      if (draft.remote.id !== draft.id) throw new NotebookError();
    }
    if (draft.pending) {
      validateDraftMutation(draft.pending.mutation);
      if (
        draft.pending.mutation.draftId !== draft.id ||
        !Number.isSafeInteger(draft.pending.localRevision) ||
        draft.pending.localRevision < 1 ||
        draft.pending.localRevision > draft.localRevision ||
        !draft.dirty
      )
        throw new NotebookError();
    }
    if (draft.conflict) {
      validateDraftMutation(draft.conflict.local);
      if (!draft.pending || !same(draft.conflict.local, draft.pending.mutation) || draft.conflict.draftId !== draft.id)
        throw new NotebookError();
      if (draft.conflict.remote) validateSyncedDraft(draft.conflict.remote);
      if (draft.conflict.currentRemote) validateSyncedDraft(draft.conflict.currentRemote);
    }
    if (
      draft.resolutionBlocked !== undefined &&
      (draft.resolutionBlocked !== true || !draft.conflict || !draft.resolution)
    )
      throw new NotebookError();
    if (
      draft.recoveryDraftId !== undefined &&
      (!draft.resolutionBlocked ||
        draft.recoveryDraftId === draft.id ||
        !book.drafts.some(item => item.id === draft.recoveryDraftId))
    )
      throw new NotebookError();
    if (
      draft.resolution &&
      (!draft.conflict ||
        draft.resolution.version !== 1 ||
        !['local', 'remote'].includes(draft.resolution.choice) ||
        !Number.isSafeInteger(draft.resolution.expectedRemoteRevision) ||
        draft.resolution.expectedRemoteRevision < 0)
    )
      throw new NotebookError();
  }
  return book;
}

export function blockNotebookResolution(book: DraftNotebook, id: string): void {
  const draft = book.drafts.find(item => item.conflict?.id === id);
  if (!draft?.conflict || !draft.resolution) throw new NotebookError('没有可保留的原冲突选择。');
  draft.resolutionBlocked = true;
}
/** Explicit, idempotent local recovery. Original proposal/receipt/choice remain inspectable. */
export function recoverNotebookConflict(book: DraftNotebook, id: string, newId: string): NotebookDraft {
  const draft = find(book, id);
  if (!draft.resolutionBlocked || !draft.conflict?.local.content || draft.conflict.local.deleted)
    throw new NotebookError('只可复制已结算冲突中的非删除推送版本；原记录仍保留。');
  if (draft.recoveryDraftId) return copy(find(book, draft.recoveryDraftId));
  const recovery = createNotebookDraft(book, draft.conflict.local.content, newId);
  draft.recoveryDraftId = recovery.id;
  return recovery;
}
