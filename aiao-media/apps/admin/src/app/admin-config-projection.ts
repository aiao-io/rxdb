import {
  MediaConfigCommit,
  MediaConfigCommitChange,
  createMediaConfigCommitEnvelope,
  type MediaConfigCommitEnvelope,
  type MediaConfigCommitInput
} from '@aiao-media/domain';
import { RxDB, type UUID } from '@aiao/rxdb';
import type {
  CommitChangeSetPage,
  CommitChangeUnitContent,
  CommitLogEntry,
  CommitLogOptions,
  WorkingTreeCommitEvent,
  WorkingTreeManager
} from '@aiao/rxdb-plugin-working-tree';
import { firstValueFrom, Observable, Subject, type Subscription } from 'rxjs';

const CONFIG_ENTITIES = new Set(['MediaPromptTemplate', 'MediaProviderPolicy', 'MediaPlatformModel']);
const CONFIG_FIELDS: Record<string, readonly string[]> = {
  MediaPromptTemplate: ['key', 'title', 'prompt', 'purpose', 'style', 'tags', 'enabled'],
  MediaProviderPolicy: ['key', 'version', 'providers', 'enabled'],
  MediaPlatformModel: ['providerId', 'modelId', 'displayName', 'capabilities', 'enabled']
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AdminWorkingTreeSource {
  readonly commits$: Observable<WorkingTreeCommitEvent>;
  listCommits(options?: CommitLogOptions): Promise<{ branchId: string; entries: readonly CommitLogEntry[] }>;
  commitChanges(commitId: string): Promise<CommitChangeSetPage>;
}

export interface AdminConfigProjectionStore {
  hasCompleteProjection(commitId: string, changeCount: number): Promise<boolean>;
  save(envelope: MediaConfigCommitEnvelope): Promise<void>;
}

export interface AdminConfigProjectionOptions {
  readonly workingTree: AdminWorkingTreeSource | WorkingTreeManager;
  readonly workspaceId: string;
  readonly authorId: string;
  readonly store: AdminConfigProjectionStore;
  readonly readEntity: (entity: string, entityId: string) => Promise<Record<string, unknown> | null>;
  readonly sync?: (envelope: MediaConfigCommitEnvelope) => Promise<void>;
  readonly onProjected?: (envelope: MediaConfigCommitEnvelope) => void;
}

export interface AdminConfigProjection {
  readonly errors$: Observable<unknown>;
  start(): Promise<void>;
  stop(): void;
  compensate(): Promise<void>;
  project(commitId: string): Promise<MediaConfigCommitEnvelope | null>;
  idle(): Promise<void>;
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function asUuid(value: string): UUID {
  if (!isUuid(value)) throw new Error('配置标识不是 UUID。');
  return value as UUID;
}

async function stableUuid(seed: string): Promise<string> {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index++) {
    let hash = 2166136261;
    const value = `${seed}:${index}`;
    for (let offset = 0; offset < value.length; offset++) {
      hash ^= value.charCodeAt(offset);
      hash = Math.imul(hash, 16777619);
    }
    bytes[index] = hash >>> 24;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function serializable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error('配置数值超出 JSON 安全范围。');
    return number;
  }
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializable(item)]));
  }
  return value;
}

function configPayload(entity: string, value: Record<string, unknown>): Record<string, unknown> {
  const fields = CONFIG_FIELDS[entity];
  if (!fields) throw new Error(`实体 ${entity} 不允许投影。`);
  return Object.fromEntries(fields.filter(field => field in value).map(field => [field, serializable(value[field])]));
}

function revisionFrom(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const revision = (value as Record<string, unknown>)['revision'];
  if (typeof revision === 'bigint') {
    const number = Number(revision);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function inversePatchValue(entity: string, patch: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!patch) return null;
  return { value: configPayload(entity, patch) };
}

async function changeInput(
  commitId: string,
  sequence: number,
  unit: CommitChangeUnitContent,
  readEntity: AdminConfigProjectionOptions['readEntity']
) {
  if (unit.namespace !== 'media' || !CONFIG_ENTITIES.has(unit.entity)) throw new Error(`实体 ${unit.entity} 不允许投影。`);
  const current = await readEntity(unit.entity, unit.entityId);
  const inverse = unit.inversePatch === null ? null : asRecord(unit.inversePatch, '提交逆向 patch 格式无效。');
  const currentRevision = revisionFrom(current);
  const inverseRevision = revisionFrom(inverse);
  const expectedRevision = unit.operation === 'insert' ? null : inverseRevision ?? currentRevision;
  if (unit.operation !== 'insert' && expectedRevision === null) throw new Error(`实体 ${unit.entity} 缺少预期 revision。`);
  if (unit.operation !== 'delete' && current === null) throw new Error(`实体 ${unit.entity}:${unit.entityId} 的提交后快照不存在。`);
  const patch = unit.operation === 'delete'
    ? { value: null }
    : { value: configPayload(unit.entity, asRecord(current, '提交后配置快照无效。')) };
  return {
    id: await stableUuid(`${commitId}:change:${sequence}:${unit.unitId}`),
    sequence,
    entity: unit.entity,
    entityId: unit.entityId,
    operation: unit.operation,
    patch,
    inversePatch: inversePatchValue(unit.entity, inverse),
    expectedRevision
  } as const;
}

export async function createMediaConfigCommitEnvelopeFromWorkingTree(
  source: AdminWorkingTreeSource,
  options: { commitId: string; workspaceId: string; authorId: string; readEntity: AdminConfigProjectionOptions['readEntity'] }
): Promise<MediaConfigCommitEnvelope> {
  if (!isUuid(options.workspaceId) || !isUuid(options.authorId)) throw new Error('配置 projection 身份无效。');
  const page = await source.listCommits();
  const entry = page.entries.find(candidate => candidate.commitId === options.commitId);
  if (!entry) throw new Error(`提交 ${options.commitId} 不在当前分支历史中。`);
  if (entry.kind === 'baseline' || entry.kind === 'branch_baseline' || entry.changeSetCount === 0) {
    throw new Error('系统基线提交不能进入配置 projection。');
  }
  const changes = await source.commitChanges(options.commitId);
  if (changes.entries.length !== entry.changeSetCount) throw new Error('提交变更不完整，暂不投影。');
  const input: MediaConfigCommitInput = {
    id: isUuid(options.commitId) ? options.commitId : await stableUuid(`commit:${options.commitId}`),
    workspaceId: options.workspaceId,
    branchId: page.branchId,
    parentIds: [...entry.parentIds],
    authorId: entry.authorId && isUuid(entry.authorId) ? entry.authorId : options.authorId,
    message: entry.message,
    operationId: await stableUuid(`${options.workspaceId}:operation:${options.commitId}`),
    status: 'prepared',
    changes: await Promise.all(changes.entries.map((unit, index) => changeInput(options.commitId, index + 1, unit, options.readEntity)))
  };
  return createMediaConfigCommitEnvelope(input);
}

export function createAdminConfigProjectionStore(database: RxDB): AdminConfigProjectionStore {
  const commits = database.entityManager.getRepository(MediaConfigCommit);
  const changes = database.entityManager.getRepository(MediaConfigCommitChange);
  return {
    hasCompleteProjection: async (commitId, changeCount) => {
      const commitRows = await firstValueFrom(commits.findAll({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: asUuid(commitId) }] }
      }));
      if (!commitRows[0]) return false;
      const changeRows = await firstValueFrom(changes.findAll({
        where: { combinator: 'and', rules: [{ field: 'commitId', operator: '=', value: asUuid(commitId) }] }
      }));
      return changeRows.length === changeCount;
    },
    save: async envelope => {
      const existing = await firstValueFrom(commits.findAll({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: asUuid(envelope.commit.id) }] }
      }));
      if (!existing[0]) {
        await commits.create(new MediaConfigCommit(envelope.commit));
      } else if (existing[0].contentFingerprint !== envelope.commit.contentFingerprint) {
        throw new Error('同一提交的 projection 指纹不一致。');
      }
      const existingChanges = await firstValueFrom(changes.findAll({
        where: { combinator: 'and', rules: [{ field: 'commitId', operator: '=', value: asUuid(envelope.commit.id) }] }
      }));
      const existingIds = new Set<string>(existingChanges.map(change => String(change.id)));
      
      for (const change of envelope.changes) {
        if (existingIds.has(change.id)) continue;
        await changes.create(new MediaConfigCommitChange({
          ...change,
          commitId: envelope.commit.id,
          expectedRevision: change.expectedRevision
        }));
      }
    }
  };
}

export function createAdminConfigProjection(options: AdminConfigProjectionOptions): AdminConfigProjection {
  const errors = new Subject<unknown>();
  let subscription: Subscription | null = null;
  let pending = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation, operation);
    pending = result.then(() => undefined, error => {
      errors.next(error);
      return undefined;
    });
    return result;
  };
  const project = (commitId: string): Promise<MediaConfigCommitEnvelope | null> => enqueue(async () => {
    const page = await options.workingTree.listCommits();
    const entry = page.entries.find(candidate => candidate.commitId === commitId);
    if (!entry || entry.kind === 'baseline' || entry.kind === 'branch_baseline' || entry.changeSetCount === 0) return null;
    const complete = await options.store.hasCompleteProjection(commitId, entry.changeSetCount);
    if (complete && !options.sync) return null;
    const envelope = await createMediaConfigCommitEnvelopeFromWorkingTree(options.workingTree, {
      commitId,
      workspaceId: options.workspaceId,
      authorId: options.authorId,
      readEntity: options.readEntity
    });
    if (!complete) await options.store.save(envelope);
    if (options.sync) await options.sync(envelope);
    options.onProjected?.(envelope);
    return envelope;
  });
  const compensate = async (): Promise<void> => {
    const page = await options.workingTree.listCommits();
    for (const entry of page.entries) await project(entry.commitId);
  };
  return {
    errors$: errors.asObservable(),
    start: async () => {
      if (subscription) return;
      subscription = options.workingTree.commits$.subscribe(event => {
        void project(event.commitId).catch(error => errors.next(error));
      });
      await compensate();
    },
    stop: () => {
      subscription?.unsubscribe();
      subscription = null;
    },
    compensate,
    project,
    idle: () => pending
  };
}
