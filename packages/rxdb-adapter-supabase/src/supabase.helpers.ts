/**
 * @fileoverview Supabase Adapter 的纯函数与常量
 *
 * 从 {@link RxDBAdapterSupabase} 抽出的无状态辅助逻辑：
 * 写响应验证、瞬时错误重试判定、快照过滤校验、属性支持校验、RLS / Realtime 配置常量。
 */

import { EntityMetadata, PropertyType, RemoteMergeResult, RuleGroup } from '@aiao/rxdb';
import { SupabaseConfigError, SupabaseDataError } from './errors.js';

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
  error: { message?: string | null } | null;
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

export function validateMergeResponse(data: unknown): RemoteMergeResult {
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

  return {
    maxChangeId: maxChangeId === null ? undefined : (maxChangeId as number),
    changeIdMapping: changeIdMapping as NonNullable<RemoteMergeResult['changeIdMapping']>
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
