import {
  createMediaConfigCommitEnvelope,
  type MediaConfigCommitEnvelope,
  type MediaConfigCommitInput
} from '@aiao-media/domain';
import type {
  CommitChangeSetPage,
  CommitChangeUnitContent,
  CommitLogEntry,
  CommitLogOptions,
  WorkingTreeCommitEvent,
  WorkingTreeManager
} from '@aiao/rxdb-plugin-working-tree';
import { Observable, Subject, type Subscription } from 'rxjs';
import type { ProductClient } from './product-client';

const CONFIG_ENTITIES = new Set(['MediaPromptTemplate', 'MediaProviderPolicy', 'MediaPlatformModel']);
const CONFIG_FIELDS: Record<string, readonly string[]> = {
  MediaPromptTemplate: ['key', 'title', 'prompt', 'purpose', 'style', 'tags', 'enabled'],
  MediaProviderPolicy: ['key', 'version', 'providers', 'enabled'],
  MediaPlatformModel: ['providerId', 'modelId', 'displayName', 'capabilities', 'enabled']
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/**
 * 判断工作树变更单元是否改了配置内容。
 *
 * @remarks
 * 应用或回滚成功后，本机把服务端返回的 revision 写回实体；这类只动非白名单字段的更新是簿记，
 * 不是配置变更，进入投影会生成一次内容不变却推进服务端版本的提交。插入与删除总是内容变更。
 */
export function isConfigContentUnit(
  unit: Pick<CommitChangeUnitContent, 'namespace' | 'entity' | 'operation' | 'patch'>
): boolean {
  const fields = CONFIG_FIELDS[unit.entity];
  // 未知实体或命名空间一律按内容处理，交给投影校验当场拒绝，不能被当成簿记静默丢弃。
  if (unit.operation !== 'update' || unit.namespace !== 'public' || !fields) return true;
  const patch = unit.patch && typeof unit.patch === 'object' ? Object.keys(unit.patch) : [];
  return patch.some(field => fields.includes(field));
}

async function changeInput(
  commitId: string,
  sequence: number,
  unit: CommitChangeUnitContent,
  readEntity: AdminConfigProjectionOptions['readEntity']
) {
  if (unit.namespace !== 'public' || !CONFIG_ENTITIES.has(unit.entity))
    throw new Error(`实体 ${unit.entity} 不允许投影。`);
  const current = await readEntity(unit.entity, unit.entityId);
  const inverse = unit.inversePatch === null ? null : asRecord(unit.inversePatch, '提交逆向 patch 格式无效。');
  const currentRevision = revisionFrom(current);
  const inverseRevision = revisionFrom(inverse);
  // 更新以提交时实体的当前 revision 为准：应用成功后本机写回的服务端 revision 也进入了这次提交的逆向 patch，
  // 优先取逆向值会退回到上一次应用前的版本，导致每次编辑都被 CAS 拒绝。删除后没有当前行，才取逆向快照。
  const expectedRevision = unit.operation === 'insert' ? null : (currentRevision ?? inverseRevision);
  if (unit.operation !== 'insert' && expectedRevision === null)
    throw new Error(`实体 ${unit.entity} 缺少预期 revision。`);
  if (unit.operation !== 'delete' && current === null)
    throw new Error(`实体 ${unit.entity}:${unit.entityId} 的提交后快照不存在。`);
  const patch =
    unit.operation === 'delete' ?
      { value: null }
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

function isProjectable(entry: CommitLogEntry): boolean {
  return entry.kind === 'normal' && entry.changeSetCount > 0;
}

async function projectedCommitId(commitId: string): Promise<string> {
  return isUuid(commitId) ? commitId : stableUuid(`commit:${commitId}`);
}

/**
 * 父提交映射到最近的可投影祖先：工作树的系统基线（`baseline` / `branch_baseline`）不进入投影，
 * 直接指向它们会让服务端永远找不到父提交而拒绝应用。
 */
async function projectedParentIds(
  entry: CommitLogEntry,
  history: ReadonlyMap<string, CommitLogEntry>
): Promise<string[]> {
  const resolved: string[] = [];
  const visit = async (parentId: string): Promise<void> => {
    const parent = history.get(parentId);
    if (!parent) throw new Error(`提交 ${entry.commitId} 的父提交 ${parentId} 不在当前分支历史中。`);
    if (!isProjectable(parent)) {
      for (const ancestorId of parent.parentIds) await visit(ancestorId);
      return;
    }
    const id = await projectedCommitId(parent.commitId);
    if (!resolved.includes(id)) resolved.push(id);
  };
  for (const parentId of entry.parentIds) await visit(parentId);
  return resolved;
}

export async function createMediaConfigCommitEnvelopeFromWorkingTree(
  source: AdminWorkingTreeSource,
  options: {
    commitId: string;
    workspaceId: string;
    authorId: string;
    readEntity: AdminConfigProjectionOptions['readEntity'];
  }
): Promise<MediaConfigCommitEnvelope> {
  if (!isUuid(options.workspaceId) || !isUuid(options.authorId)) throw new Error('配置 projection 身份无效。');
  const page = await source.listCommits();
  const history = new Map(page.entries.map(candidate => [candidate.commitId, candidate]));
  const entry = history.get(options.commitId);
  if (!entry) throw new Error(`提交 ${options.commitId} 不在当前分支历史中。`);
  if (!isProjectable(entry)) throw new Error('系统基线提交不能进入配置 projection。');
  const changes = await source.commitChanges(options.commitId);
  if (changes.entries.length !== entry.changeSetCount) throw new Error('提交变更不完整，暂不投影。');
  const content = changes.entries.filter(isConfigContentUnit);
  if (content.length === 0) throw new Error('提交只包含服务端修订号回写，不需要投影。');
  const input: MediaConfigCommitInput = {
    id: await projectedCommitId(options.commitId),
    workspaceId: options.workspaceId,
    branchId: page.branchId,
    parentIds: await projectedParentIds(entry, history),
    authorId: entry.authorId && isUuid(entry.authorId) ? entry.authorId : options.authorId,
    message: entry.message,
    operationId: await stableUuid(`${options.workspaceId}:operation:${options.commitId}`),
    status: 'prepared',
    changes: await Promise.all(
      content.map((unit, index) => changeInput(options.commitId, index + 1, unit, options.readEntity))
    )
  };
  return createMediaConfigCommitEnvelope(input);
}

/** 投影存储使用的远端接口；生产实现是 {@link ProductClient}。 */
export type AdminConfigProjectionClient = Pick<ProductClient, 'configProjection' | 'pushConfigCommit'>;

/**
 * 以远端投影表为准的存储：投影由服务端推进状态，不在本机另存副本。
 *
 * @remarks
 * 只有状态越过 prepared、声明的变更数与实际到达的变更数都等于工作树记录时才算完整；
 * 否则补偿扫描会重新写入（已存在的行被忽略），最后把 prepared 标记为 synced。
 */
export function createAdminConfigProjectionStore(client: AdminConfigProjectionClient): AdminConfigProjectionStore {
  return {
    hasCompleteProjection: async (commitId, changeCount) => {
      const projection = await client.configProjection(commitId);
      return Boolean(
        projection &&
        projection.status !== 'prepared' &&
        projection.changeCount === changeCount &&
        projection.receivedChanges === changeCount
      );
    },
    save: envelope => client.pushConfigCommit(envelope)
  };
}

export function createAdminConfigProjection(options: AdminConfigProjectionOptions): AdminConfigProjection {
  const errors = new Subject<unknown>();
  let subscription: Subscription | null = null;
  let pending = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = pending.then(operation, operation);
    pending = result.then(
      () => undefined,
      error => {
        errors.next(error);
        return undefined;
      }
    );
    return result;
  };
  const project = (commitId: string): Promise<MediaConfigCommitEnvelope | null> =>
    enqueue(async () => {
      const page = await options.workingTree.listCommits();
      const entry = page.entries.find(candidate => candidate.commitId === commitId);
      if (!entry || !isProjectable(entry)) return null;
      const contentCount = (await options.workingTree.commitChanges(commitId)).entries.filter(
        isConfigContentUnit
      ).length;
      if (contentCount === 0) return null;
      // 远端以投影后的标识存储，完整度必须按同一标识、按内容变更数查询。
      const complete = await options.store.hasCompleteProjection(await projectedCommitId(commitId), contentCount);
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
