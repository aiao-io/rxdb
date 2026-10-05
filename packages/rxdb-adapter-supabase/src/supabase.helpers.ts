/**
 * @fileoverview Supabase Adapter 的纯函数与常量
 *
 * 从 {@link RxDBAdapterSupabase} 抽出的无状态辅助逻辑：
 * 写响应验证、瞬时错误重试判定、快照过滤校验、属性支持校验、RLS / Realtime 配置常量。
 */

import {
  EntityMetadata,
  IRxDBChange,
  PropertyType,
  RemoteChangeRejection,
  RemoteChangeResult,
  RemoteEntityRef,
  RemoteMergeResult,
  RuleGroup
} from '@aiao/rxdb';
import { SupabaseConfigError, SupabaseDataError } from './errors.js';
import type { PostgrestErrorBody } from './postgrest-error.js';

export const ADAPTER_NAME = 'supabase';

/** 适配器所基于的 @supabase/supabase-js 最低支持版本（与 package.json peerDependencies 对齐） */
export const SUPABASE_SDK_VERSION = '2.88.0';

const RETRYABLE_SUPABASE_WRITE_ERROR_PATTERNS = [
  /invalid response was received from the upstream server/i,
  /fetch failed/i,
  /failed to fetch/i,
  /gateway timeout/i,
  /upstream connect error/i,
  /connection terminated/i,
  /temporarily unavailable/i
];

export const RETRYABLE_SUPABASE_WRITE_MAX_ATTEMPTS = 3;
export const RETRYABLE_SUPABASE_WRITE_RETRY_DELAY_MS = 150;
export const DEFAULT_RLS_CHECK_RPC_NAME = 'rxdb_check_rls';
export const REALTIME_RECONNECT_BASE_DELAY_MS = 500;
export const REALTIME_RECONNECT_MAX_DELAY_MS = 5_000;
export const REALTIME_RECONNECTABLE_STATUSES = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

export type RealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

const SNAPSHOT_FILTER_OPERATORS = new Set([
  '=',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  'contains',
  'includes',
  'notContains',
  'startsWith',
  'notStartsWith',
  'endsWith',
  'notEndsWith',
  'null',
  'isNull',
  'notNull',
  'isNotNull',
  'in',
  'notIn',
  'between',
  'notBetween'
]);

export function assertSnapshotFilterSupported(filter: RuleGroup<unknown>): void {
  for (const node of filter.rules as unknown as Array<Record<string, unknown>>) {
    if (Array.isArray(node['rules'])) {
      assertSnapshotFilterSupported(node as unknown as RuleGroup<unknown>);
      continue;
    }

    const field = node['field'];
    const operator = node['operator'];
    if (typeof field !== 'string' || field.includes('.') || typeof operator !== 'string') {
      throw new SupabaseConfigError('Snapshot filter sync only supports direct entity fields');
    }
    if (!SNAPSHOT_FILTER_OPERATORS.has(operator)) {
      throw new SupabaseConfigError(`Snapshot filter sync does not support operator: ${operator}`);
    }
  }
}

export interface UnsupportedSupabaseProperty {
  name: string;
  type: PropertyType.bigint | PropertyType.binary;
}

export function getUnsupportedProperty(
  metadata: EntityMetadata,
  resolveEntityMetadata: (entity: string, namespace: string) => EntityMetadata | undefined
): UnsupportedSupabaseProperty | undefined {
  for (const property of metadata.propertyMap.values()) {
    const type = property.type;
    if (type !== PropertyType.bigint && type !== PropertyType.binary) continue;
    return {
      name: property.name,
      type: type === PropertyType.bigint ? PropertyType.bigint : PropertyType.binary
    };
  }

  for (const [foreignKeyName, relation] of metadata.foreignKeyRelationMap) {
    const targetMetadata = resolveEntityMetadata(relation.mappedEntity, relation.mappedNamespace ?? metadata.namespace);
    const type = targetMetadata?.propertyMap.get('id')?.type;
    if (type !== PropertyType.bigint && type !== PropertyType.binary) continue;
    return {
      name: foreignKeyName,
      type: type === PropertyType.bigint ? PropertyType.bigint : PropertyType.binary
    };
  }

  return undefined;
}

export interface SupabaseRlsCheckResult {
  schema: string;
  table: string;
  exists: boolean;
  rlsEnabled: boolean;
}

export type RetryableWriteResponse = {
  data: unknown;
  /** PostgREST 错误体；`code` / `details` / `hint` 原样带到抛出的错误上（US-218 FR-016） */
  error: PostgrestErrorBody | null;
  /** HTTP 状态码；`0` 表示传输失败，用于错误分类（RV-001） */
  status?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidWriteResponse(operationName: string): never {
  throw new SupabaseDataError(`Failed to ${operationName}: invalid response data`);
}

export function validateArrayResponse<TResult>(data: unknown, operationName: string): TResult[] {
  if (!Array.isArray(data)) invalidWriteResponse(operationName);
  return data as TResult[];
}

export function validateMutationsResponse<TResult>(data: unknown): TResult[] {
  if (!isRecord(data) || !Array.isArray(data['upserted'])) invalidWriteResponse('execute transaction');
  return data['upserted'] as TResult[];
}

/** `entity_results` 单元素里 `dependsOn` 为表引用时的形状，解析自外键约束 */
interface DependsOnTableRef {
  schema: string;
  table: string;
  entityId: string;
}

/** `entity_results` 单元素里 `dependsOn` 解析不出父行时退化成的约束描述 */
interface DependsOnConstraintRef {
  constraint: string;
}

/**
 * `rxdb_mutations`（`p_receipts = true`）回执数组 `entity_results` 的单个元素
 *
 * @remarks
 * 按 `status` 判别：`applied` 不带拒绝详情；`rejected` 必带 `code` / `reason` / `message`，
 * `reason = 'dependency'` 时还带 `dependsOn`（[contracts/rxdb-mutations-receipts.md §4](../../../specs/007-us218-rls-push-integrity/contracts/rxdb-mutations-receipts.md)）。
 */
type RawEntityResult =
  | { schema: string; table: string; entityId: string; status: 'applied'; localIds: number[] }
  | {
      schema: string;
      table: string;
      entityId: string;
      status: 'rejected';
      code: string;
      reason: 'denied' | 'gone' | 'dependency';
      message: string;
      dependsOn?: DependsOnTableRef | DependsOnConstraintRef;
      localIds: number[];
    };

/** `entity_results` 中已被拒绝的元素 */
type RejectedEntityResult = Extract<RawEntityResult, { status: 'rejected' }>;

const ENTITY_RESULT_OPS = new Set(['INSERT', 'UPDATE', 'DELETE']);
const ENTITY_RESULT_REJECTION_REASONS = new Set(['denied', 'gone', 'dependency']);

function isNonNegativeIntArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(item => Number.isSafeInteger(item) && (item as number) >= 0);
}

function isDependsOnConstraintRef(value: unknown): value is DependsOnConstraintRef {
  return isRecord(value) && typeof value['constraint'] === 'string';
}

function isDependsOnTableRef(value: unknown): value is DependsOnTableRef {
  return (
    isRecord(value) &&
    typeof value['schema'] === 'string' &&
    typeof value['table'] === 'string' &&
    typeof value['entityId'] === 'string'
  );
}

/** 校验单个 `entity_results` 元素的公共字段（`schema` / `table` / `entityId` / `op` / `localIds`） */
function hasEntityResultCommonShape(item: Record<string, unknown>): boolean {
  return (
    typeof item['schema'] === 'string' &&
    typeof item['table'] === 'string' &&
    typeof item['entityId'] === 'string' &&
    typeof item['op'] === 'string' &&
    ENTITY_RESULT_OPS.has(item['op']) &&
    isNonNegativeIntArray(item['localIds'])
  );
}

/** 校验 `status = 'rejected'` 元素的拒绝详情（`code` / `reason` / `message`，`dependency` 时还有 `dependsOn`） */
function hasRejectedEntityResultShape(item: Record<string, unknown>): boolean {
  if (typeof item['code'] !== 'string' || typeof item['message'] !== 'string') return false;
  if (typeof item['reason'] !== 'string' || !ENTITY_RESULT_REJECTION_REASONS.has(item['reason'])) return false;
  if (item['reason'] !== 'dependency') return true;
  return isDependsOnConstraintRef(item['dependsOn']) || isDependsOnTableRef(item['dependsOn']);
}

function isEntityResultShape(item: unknown): item is RawEntityResult {
  if (!isRecord(item) || !hasEntityResultCommonShape(item)) return false;
  if (item['status'] === 'applied') return true;
  return item['status'] === 'rejected' && hasRejectedEntityResultShape(item);
}

/** 从响应里取出并校验 `entity_results`；缺项或形状不对一律 {@link SupabaseDataError} */
function parseEntityResults(data: Record<string, unknown>): RawEntityResult[] {
  const entityResults = data['entity_results'];
  if (!Array.isArray(entityResults)) invalidWriteResponse('merge changes');
  if (!entityResults.every(isEntityResultShape)) invalidWriteResponse('merge changes');
  return entityResults;
}

/**
 * 把回执里某条源变更的拒绝详情组装成 {@link RemoteChangeRejection}
 *
 * @param change - 对应的本地源变更，`entity` 字段取它自身的 `namespace` / `entity` / `entityId`
 *   （[contracts/remote-merge-result.md §3](../../../specs/007-us218-rls-push-integrity/contracts/remote-merge-result.md)）——
 *   能匹配到这条回执本身已经证明两者是同一实体，不需要反查表名
 * @param entityResult - 该实体在 `entity_results` 中被拒绝的那一条
 * @param resolveDependsOnEntity - 把 `dependsOn` 的表引用换算成本地实体引用
 */
function buildRejection(
  change: IRxDBChange,
  entityResult: RejectedEntityResult,
  resolveDependsOnEntity: (ref: DependsOnTableRef) => RemoteEntityRef
): RemoteChangeRejection {
  const rejection: RemoteChangeRejection = {
    code: entityResult.code,
    reason: entityResult.reason,
    message: entityResult.message,
    entity: { namespace: change.namespace || 'public', entity: change.entity, entityId: String(change.entityId) }
  };
  if (entityResult.dependsOn) {
    rejection.dependsOn =
      isDependsOnConstraintRef(entityResult.dependsOn) ?
        entityResult.dependsOn
      : resolveDependsOnEntity(entityResult.dependsOn);
  }
  return rejection;
}

/**
 * 校验 `rxdb_mutations`（`p_receipts = true`）的响应，并按本批源变更构造 {@link RemoteMergeResult}
 *
 * @param resolveDependsOnEntity - 把回执 `dependsOn` 里的表引用（`{schema,table,entityId}`）换算成
 *   本地实体引用；查不到对应实体时应抛错（无 fallback 兜底）
 *
 * @remarks
 * 对本批每条源变更 `c`：`c.localId` 在 `change_id_mapping` 中 → `applied`；否则 `c.localId` 在某个
 * `status = 'rejected'` 的 `entity_results[i].localIds` 中 → `rejected`；两者都不在、或同时在
 * → {@link SupabaseDataError}（远端回执与本批不一致），不满足「每条源变更恰好一条结果」
 * （US-218 FR-016，[contracts/remote-merge-result.md §3](../../../specs/007-us218-rls-push-integrity/contracts/remote-merge-result.md)）。
 */
export function validateMergeResponse(
  data: unknown,
  changes: IRxDBChange[] | undefined,
  resolveDependsOnEntity: (ref: DependsOnTableRef) => RemoteEntityRef
): RemoteMergeResult {
  if (!isRecord(data) || !Array.isArray(data['change_id_mapping'])) invalidWriteResponse('merge changes');

  const maxChangeId = data['max_change_id'];
  if (maxChangeId !== null && (!Number.isSafeInteger(maxChangeId) || (maxChangeId as number) < 0)) {
    invalidWriteResponse('merge changes');
  }

  const changeIdMapping = data['change_id_mapping'];
  const hasInvalidMapping = changeIdMapping.some(
    item =>
      !isRecord(item) ||
      !Number.isSafeInteger(item['localId']) ||
      !Number.isSafeInteger(item['remoteId']) ||
      (item['localId'] as number) < 0 ||
      (item['remoteId'] as number) < 0
  );
  if (hasInvalidMapping) invalidWriteResponse('merge changes');

  const remoteIdByLocalId = new Map(
    (changeIdMapping as Array<{ localId: number; remoteId: number }>).map(({ localId, remoteId }) => [
      localId,
      remoteId
    ])
  );

  const rejectionByLocalId = new Map<number, RejectedEntityResult>();
  for (const entityResult of parseEntityResults(data)) {
    if (entityResult.status !== 'rejected') continue;
    for (const localId of entityResult.localIds) {
      rejectionByLocalId.set(localId, entityResult);
    }
  }

  const results: RemoteChangeResult[] = (changes ?? []).map(change => {
    const remoteId = remoteIdByLocalId.get(change.id);
    const rejectedResult = rejectionByLocalId.get(change.id);

    if (remoteId !== undefined && rejectedResult !== undefined) {
      throw new SupabaseDataError(
        `Merge response inconsistent for local change: ${change.id} (both applied and rejected)`
      );
    }
    if (remoteId !== undefined) {
      return { localId: change.id, status: 'applied', remoteId };
    }
    if (rejectedResult !== undefined) {
      return {
        localId: change.id,
        status: 'rejected',
        rejection: buildRejection(change, rejectedResult, resolveDependsOnEntity)
      };
    }
    throw new SupabaseDataError(`Merge response missing mapping for local change: ${change.id}`);
  });

  return {
    maxChangeId: maxChangeId === null ? undefined : (maxChangeId as number),
    results
  };
}

export function validatePushBranchesResponse(data: unknown): { synced: number; skipped: string[] } {
  if (!isRecord(data)) invalidWriteResponse('sync branches');
  const synced = data['synced'];
  const skipped = data['skipped'];
  if (!Number.isSafeInteger(synced) || (synced as number) < 0 || !Array.isArray(skipped)) {
    invalidWriteResponse('sync branches');
  }
  if (!skipped.every(value => typeof value === 'string')) invalidWriteResponse('sync branches');
  return { synced: synced as number, skipped };
}

export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function isRetryableSupabaseWriteError(message: string): boolean {
  return RETRYABLE_SUPABASE_WRITE_ERROR_PATTERNS.some(pattern => pattern.test(message));
}
