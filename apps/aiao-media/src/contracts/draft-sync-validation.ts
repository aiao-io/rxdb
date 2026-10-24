import type {
  DraftSyncConflict,
  DraftSyncConflictView,
  DraftSyncMutation,
  DraftSyncPullResult,
  DraftSyncPushResult,
  DraftSyncResolutionResult,
  SyncedDraft,
  SyncedDraftContent
} from './draft-sync';

export class DraftSyncProtocolError extends Error {
  constructor() {
    super('草稿同步响应不兼容或损坏；未确认的本地数据保留。');
  }
}
const fail = (): never => {
  throw new DraftSyncProtocolError();
};
function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !allowed.includes(key))) return fail();
  return input;
}
function id(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
  )
    return fail();
  return value;
}
function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > 2147483646) return fail();
  return value as number;
}
function boolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : fail();
}
function time(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 32 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return fail();
  return value;
}
function version(input: Record<string, unknown>) {
  if (input['version'] !== 1) fail();
}
export function validateDraftContent(value: unknown): SyncedDraftContent {
  const input = object(value, ['kind', 'prompt', 'requiresReference', 'parameters']);
  const p = object(input['parameters'], ['modelId', 'providerInstanceId', 'operation']);
  const kind = input['kind'],
    prompt = input['prompt'],
    requiresReference = boolean(input['requiresReference']);
  if (
    !['image', 'audio', 'video'].includes(String(kind)) ||
    typeof prompt !== 'string' ||
    prompt.length > 4000 ||
    Array.from(prompt).some(
      c => (c.charCodeAt(0) < 32 && ![9, 10, 13].includes(c.charCodeAt(0))) || c.charCodeAt(0) === 127
    )
  )
    return fail();
  if (requiresReference && kind !== 'image') return fail();
  if (
    p['modelId'] !== undefined &&
    (typeof p['modelId'] !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(p['modelId']))
  )
    return fail();
  if (p['providerInstanceId'] !== undefined) id(p['providerInstanceId']);
  if (
    p['operation'] !== undefined &&
    (kind !== 'image' ||
      !['text-to-image', 'reference-image'].includes(String(p['operation'])) ||
      (p['operation'] === 'reference-image') !== requiresReference)
  )
    return fail();
  return {
    kind: kind as SyncedDraftContent['kind'],
    prompt,
    requiresReference,
    parameters: { ...p } as SyncedDraftContent['parameters']
  };
}
export function validateSyncedDraft(value: unknown): SyncedDraft {
  const d = object(value, ['id', 'revision', 'sequence', 'deleted', 'content', 'updatedAt']);
  const deleted = boolean(d['deleted']);
  if (deleted && d['content'] !== null) return fail();
  return {
    id: id(d['id']),
    revision: integer(d['revision'], 1),
    sequence: integer(d['sequence'], 1),
    deleted,
    content: deleted ? null : validateDraftContent(d['content']),
    updatedAt: time(d['updatedAt'])
  };
}
export function validateDraftMutation(value: unknown): DraftSyncMutation {
  const d = object(value, ['version', 'mutationId', 'draftId', 'baseRevision', 'deleted', 'content']);
  version(d);
  const deleted = boolean(d['deleted']);
  if (deleted && d['content'] !== null) return fail();
  return {
    version: 1,
    mutationId: id(d['mutationId']),
    draftId: id(d['draftId']),
    baseRevision: integer(d['baseRevision']),
    deleted,
    content: deleted ? null : validateDraftContent(d['content'])
  };
}
function conflict(value: unknown, withCurrent = false): DraftSyncConflictView {
  const d = object(value, ['id', 'draftId', 'local', 'remote', 'createdAt', ...(withCurrent ? ['currentRemote'] : [])]);
  const local = validateDraftMutation(d['local']),
    draftId = id(d['draftId']);
  const remote = d['remote'] === null ? null : validateSyncedDraft(d['remote']);
  const currentRemote =
    withCurrent ?
      d['currentRemote'] === null ?
        null
      : validateSyncedDraft(d['currentRemote'])
    : remote;
  if (local.draftId !== draftId || (remote && remote.id !== draftId) || (currentRemote && currentRemote.id !== draftId))
    return fail();
  return {
    id: id(d['id']),
    draftId,
    local,
    remote,
    currentRemote,
    createdAt: time(d['createdAt'])
  };
}
export function validateDraftPush(value: unknown): DraftSyncPushResult {
  const d = object(value, ['version', 'status', 'draft', 'conflict', 'reused']);
  version(d);
  const reused = boolean(d['reused']);
  if (d['status'] === 'applied' && !('conflict' in d))
    return {
      version: 1,
      status: 'applied',
      draft: validateSyncedDraft(d['draft']),
      reused
    };
  if (d['status'] === 'conflict' && !('draft' in d)) {
    const c = conflict(d['conflict']);
    const retained: DraftSyncConflict = {
      id: c.id,
      draftId: c.draftId,
      local: c.local,
      remote: c.remote,
      createdAt: c.createdAt
    };
    return { version: 1, status: 'conflict', conflict: retained, reused };
  }
  return fail();
}
export function validateDraftPull(value: unknown): DraftSyncPullResult {
  const d = object(value, ['version', 'reset', 'drafts', 'checkpoint', 'hasMore']);
  version(d);
  const reset = boolean(d['reset']),
    hasMore = boolean(d['hasMore']);
  if (
    !Array.isArray(d['drafts']) ||
    d['drafts'].length > (reset ? 1000 : 100) ||
    typeof d['checkpoint'] !== 'string' ||
    !d['checkpoint'] ||
    d['checkpoint'].length > 1024 ||
    (reset && hasMore)
  )
    return fail();
  const drafts = d['drafts'].map(validateSyncedDraft);
  if (
    (reset && new Set(drafts.map(item => item.id)).size !== drafts.length) ||
    drafts.some((item, index) => index > 0 && item.sequence <= drafts[index - 1].sequence) ||
    (hasMore && !drafts.length)
  )
    return fail();
  return { version: 1, reset, hasMore, drafts, checkpoint: d['checkpoint'] };
}
export function validateDraftConflicts(value: unknown): DraftSyncConflictView[] {
  const d = object(value, ['version', 'conflicts']);
  version(d);
  if (!Array.isArray(d['conflicts']) || d['conflicts'].length > 100) return fail();
  const items = d['conflicts'].map(item => conflict(item, true));
  if (new Set(items.map(item => item.id)).size !== items.length) return fail();
  return items;
}
export function validateDraftResolution(value: unknown): DraftSyncResolutionResult {
  const d = object(value, ['version', 'conflictId', 'choice', 'draft', 'resolvedAt', 'reused']);
  version(d);
  if (d['choice'] !== 'local' && d['choice'] !== 'remote') return fail();
  return {
    version: 1,
    conflictId: id(d['conflictId']),
    choice: d['choice'],
    draft: d['draft'] === null ? null : validateSyncedDraft(d['draft']),
    resolvedAt: time(d['resolvedAt']),
    reused: boolean(d['reused'])
  };
}
