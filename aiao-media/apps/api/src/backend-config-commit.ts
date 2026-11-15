import type {
  MediaConfigCommitEnvelope,
  MediaConfigCommitOperation,
  MediaConfigCommitStatus
} from '@aiao-media/domain';

export interface BackendConfigCommitRemote {
  readCommit(commitId: string): Promise<unknown | null>;
  readChanges(commitId: string): Promise<readonly unknown[]>;
}

export interface BackendConfigCommitCacheOptions {
  workspaceId?: string;
}

interface CommitRow {
  id: string;
  workspaceId: string;
  branchId: string;
  parentIds: string[];
  authorId: string;
  message: string;
  operationId: string;
  contentFingerprint: string;
  status: MediaConfigCommitStatus;
}

interface ChangeRow {
  id: string;
  sequence: number;
  entity: string;
  entityId: string;
  operation: MediaConfigCommitOperation;
  patch: unknown;
  inversePatch: unknown;
  expectedRevision: number | null;
  contentFingerprint: string;
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function stringField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`配置提交字段 ${key} 无效。`);
  return value;
}

function stringArrayField(row: Record<string, unknown>, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`配置提交字段 ${key} 无效。`);
  return [...value];
}

function statusField(row: Record<string, unknown>): MediaConfigCommitStatus {
  const value = stringField(row, 'status');
  if (!['prepared', 'synced', 'validated', 'applied', 'released', 'rejected'].includes(value)) throw new Error('配置提交状态无效。');
  return value as MediaConfigCommitStatus;
}

function operationField(row: Record<string, unknown>): MediaConfigCommitOperation {
  const value = stringField(row, 'operation');
  if (!['insert', 'update', 'delete'].includes(value)) throw new Error('配置变更操作无效。');
  return value as MediaConfigCommitOperation;
}

function positiveRevision(row: Record<string, unknown>): number | null {
  const value = row['expected_revision'];
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  throw new Error('配置变更 expected_revision 无效。');
}

function parseCommit(value: unknown): CommitRow {
  const row = record(value, '配置提交回执无效。');
  return {
    id: stringField(row, 'id'),
    workspaceId: stringField(row, 'workspace_id'),
    branchId: stringField(row, 'branch_id'),
    parentIds: stringArrayField(row, 'parent_ids'),
    authorId: stringField(row, 'author_id'),
    message: stringField(row, 'message'),
    operationId: stringField(row, 'operation_id'),
    contentFingerprint: stringField(row, 'content_fingerprint'),
    status: statusField(row)
  };
}

function parseChange(value: unknown): ChangeRow {
  const row = record(value, '配置变更回执无效。');
  return {
    id: stringField(row, 'id'),
    sequence: Number(row['sequence']),
    entity: stringField(row, 'entity'),
    entityId: stringField(row, 'entity_id'),
    operation: operationField(row),
    patch: row['patch'],
    inversePatch: row['inverse_patch'] ?? null,
    expectedRevision: positiveRevision(row),
    contentFingerprint: stringField(row, 'content_fingerprint')
  };
}

export class BackendConfigCommitCache {
  readonly #remote: BackendConfigCommitRemote;
  readonly #workspaceId?: string;
  readonly #cache = new Map<string, MediaConfigCommitEnvelope>();

  constructor(remote: BackendConfigCommitRemote, options: BackendConfigCommitCacheOptions = {}) {
    this.#remote = remote;
    this.#workspaceId = options.workspaceId;
  }

  async load(commitId: string): Promise<MediaConfigCommitEnvelope> {
    const cached = this.#cache.get(commitId);
    if (cached) return cached;
    const commit = parseCommit(await this.#remote.readCommit(commitId));
    const changes = (await this.#remote.readChanges(commitId)).map(parseChange).sort((left, right) => left.sequence - right.sequence);
    if (changes.length === 0) throw new Error('配置提交 envelope 不完整。');
    const { createMediaConfigCommitEnvelope } = await import('@aiao-media/domain');
    const envelope = await createMediaConfigCommitEnvelope({
      id: commit.id,
      workspaceId: commit.workspaceId,
      branchId: commit.branchId,
      parentIds: commit.parentIds,
      authorId: commit.authorId,
      message: commit.message,
      operationId: commit.operationId,
      status: commit.status,
      changes: changes.map(change => ({
        id: change.id,
        sequence: change.sequence,
        entity: change.entity,
        entityId: change.entityId,
        operation: change.operation,
        patch: change.patch,
        inversePatch: change.inversePatch,
        expectedRevision: change.expectedRevision
      }))
    });
    if (this.#workspaceId && envelope.commit.workspaceId !== this.#workspaceId) {
      throw new Error('配置提交工作区不匹配。');
    }
    if (envelope.commit.contentFingerprint !== commit.contentFingerprint) throw new Error('配置提交 fingerprint 不一致。');
    envelope.changes.forEach((change, index) => {
      if (change.contentFingerprint !== changes[index]?.contentFingerprint) throw new Error('配置变更 fingerprint 不一致。');
    });
    this.#cache.set(commitId, envelope);
    return envelope;
  }
}
