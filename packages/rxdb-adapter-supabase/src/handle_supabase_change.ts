/**
 * @fileoverview Supabase Realtime 变更事件处理器
 * 监听 RxDBChange 表的 INSERT 事件，转换为 RxDB Remote 事件
 */

import { EntityRemoteCreatedEvent, EntityRemoteRemovedEvent, EntityRemoteUpdatedEvent } from '@aiao/rxdb';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { isConfiguredEntityScope } from './entity_scope.js';
import type { RxDBAdapterSupabase } from './RxDBAdapterSupabase.js';

type SupabasePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

const EVENT_CLASS = {
  INSERT: EntityRemoteCreatedEvent,
  UPDATE: EntityRemoteUpdatedEvent,
  DELETE: EntityRemoteRemovedEvent
} as const;

/** RxDBChange 表记录结构 */
interface RxDBChangeRecord {
  namespace: string;
  entity: string;
  entityId: string;
  type: string;
  branchId: string;
  patch: Record<string, unknown> | null;
  clientId: string | null;
  createdAt?: string;
}

/**
 * 处理 RxDBChange 表的 INSERT 事件
 * 将变更记录转换为对应的 Remote 事件
 */
export function handleSupabaseChange(adapter: RxDBAdapterSupabase, payload: SupabasePayload): void {
  // 只处理 rxdb_change 表的 INSERT 事件
  if (payload.table !== 'rxdb_change') return;
  if (payload.eventType !== 'INSERT') return;

  const record = payload.new as unknown as RxDBChangeRecord | undefined;
  if (!record) return;

  const { namespace, entity, entityId, type, branchId, patch, clientId } = record;
  if (!entity || !isConfiguredEntityScope(adapter.rxdb, namespace, entity)) return;

  // 过滤掉自己发出的变更
  const myClientId = adapter.rxdb.context.clientId;
  if (clientId && myClientId && clientId === myClientId) return;

  if (!entityId || !type) return;

  const eventType = type as keyof typeof EVENT_CLASS;
  const EventClass = EVENT_CLASS[eventType];
  if (!EventClass) return;

  // 构造实体数据：合并 entityId 和 patch
  const data = { id: entityId, ...patch };

  adapter.rxdb.dispatchEvent(
    new EventClass([
      {
        type: eventType,
        namespace: namespace || 'public',
        entity,
        id: entityId,
        branchId,
        data,
        recordAt: record.createdAt ? new Date(record.createdAt) : new Date()
      }
    ])
  );
}
