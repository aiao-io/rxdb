import type {
  MediaConfigCommitEnvelope,
  MediaConfigCommitOperation,
  MediaConfigCommitStatus
} from '@aiao-media/domain';
import type { RxDB, UUID } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';

export interface BackendConfigCommitRemote {
  readCommit(commitId: string): Promise<unknown | null>;
  readChanges(commitId: string): Promise<readonly unknown[]>;
}

/** 后台节点读取投影所需的最小 RxDB 面。 */
export interface BackendConfigCommitDatabase {
  readonly entityManager: Pick<RxDB['entityManager'], 'getRepository'>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 经后台 RxDB 节点的查询缓存读取提交投影：每次读取都按远端 `updatedAt` 新鲜度回源，
 * 因此服务端 RPC 推进的状态与补写的变更行都能被看到。
 */
export function createBackendConfigCommitRemote(db: BackendConfigCommitDatabase): BackendConfigCommitRemote {
  const rule = (field: 'id' | 'commitId', value: string) => {
    if (!UUID_PATTERN.test(value)) throw new Error('配置提交标识不是 UUID。');
    return { combinator: 'and' as const, rules: [{ field, operator: '=' as const, value: value as UUID }] };
  };
  return {
    readCommit: async commitId => {
      const { MediaConfigCommit } = await import('@aiao-media/domain');
      const rows = await firstValueFrom(db.entityManager.getRepository(MediaConfigCommit).findAll({ where: rule('id', commitId) }));
      return rows[0] ? { ...rows[0] } : null;
    },
    readChanges: async commitId => {
      const { MediaConfigCommitChange } = await import('@aiao-media/domain');
      const rows = await firstValueFrom(
        db.entityManager.getRepository(MediaConfigCommitChange).findAll({ where: rule('commitId', commitId) })
      );
      return rows.map(row => ({ ...row }));
    }
  };
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
  changeCount: number;
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
  const value = row['expectedRevision'];
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  throw new Error('配置变更 expectedRevision 无效。');
}

function positiveCount(row: Record<string, unknown>): number {
  const value = row['changeCount'];
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  throw new Error('配置提交 changeCount 无效。');
}

function parseCommit(value: unknown): CommitRow {
  const row = record(value, '配置提交回执无效。');
  return {
    id: stringField(row, 'id'),
    workspaceId: stringField(row, 'workspaceId'),
    branchId: stringField(row, 'branchId'),
    parentIds: stringArrayField(row, 'parentIds'),
    authorId: stringField(row, 'authorId'),
    message: stringField(row, 'message'),
    operationId: stringField(row, 'operationId'),
    contentFingerprint: stringField(row, 'contentFingerprint'),
    changeCount: positiveCount(row),
    status: statusField(row)
  };
}

function parseChange(value: unknown): ChangeRow {
  const row = record(value, '配置变更回执无效。');
  return {
    id: stringField(row, 'id'),
    sequence: Number(row['sequence']),
    entity: stringField(row, 'entity'),
    entityId: stringField(row, 'entityId'),
    operation: operationField(row),
    patch: row['patch'],
    inversePatch: row['inversePatch'] ?? null,
    expectedRevision: positiveRevision(row),
    contentFingerprint: stringField(row, 'contentFingerprint')
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
    if (commit.status === 'prepared') throw new Error('配置提交尚未同步完成，等待补偿后再加载。');
    const changes = (await this.#remote.readChanges(commitId)).map(parseChange).sort((left, right) => left.sequence - right.sequence);
    if (changes.length === 0) throw new Error('配置提交 envelope 不完整。');
    if (changes.length !== commit.changeCount) throw new Error('配置提交的变更尚未到齐，等待补偿后再加载。');
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
