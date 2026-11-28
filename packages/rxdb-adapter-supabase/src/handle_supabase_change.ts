/**
 * @fileoverview Supabase Realtime 变更通知处理器
 * 监听未分区旧日志频道 {@link RXDB_CHANGES_TOPIC} 与按 bucket 生成的分区频道广播，转换为 RxDB Remote 事件。
 *
 * @remarks
 * 通知由参考 SQL 的 `rxdb_change_broadcast` 触发器在日志落库后经 `realtime.send` 发出，只带日志行的元数据，
 * 不带 `patch` / `inversePatch` / `beforeData` / `afterData`（US-225）：行内容一律以订阅者自己的身份拉取。
 * 因此这里派发的 Remote 事件 `data` 只有 `id`，不是核心事件文档里说的整行——远端事件只被同步插件用来
 * 累计可拉取条数（按分支过滤，不读载荷），`QueryManager` 不监听远端事件，去掉载荷不影响同步结果。
 */

import { EntityRemoteCreatedEvent, EntityRemoteRemovedEvent, EntityRemoteUpdatedEvent } from '@aiao/rxdb';
import { isConfiguredEntityScope } from './entity_scope.js';
import type { RxDBAdapterSupabase } from './RxDBAdapterSupabase.js';

/** 未分区旧日志使用的私有频道，与参考 SQL 里 `realtime.send` 的 topic 一致 */
export const RXDB_CHANGES_TOPIC = 'rxdb:changes';

/** 分区日志频道的前缀；后面拼接服务端授权的 bucket */
export const RXDB_CHANGES_BUCKET_TOPIC_PREFIX = `${RXDB_CHANGES_TOPIC}:bucket:`;

/** 根据已授权 bucket 生成分区日志频道名 */
export function rxdbChangesTopicForBucket(bucket: string): string {
  return `${RXDB_CHANGES_BUCKET_TOPIC_PREFIX}${bucket}`;
}

/** 变更通知的广播事件名，与参考 SQL 里 `realtime.send` 的 event 一致 */
export const RXDB_CHANGES_EVENT = 'changes';

const EVENT_CLASS = {
  INSERT: EntityRemoteCreatedEvent,
  UPDATE: EntityRemoteUpdatedEvent,
  DELETE: EntityRemoteRemovedEvent
} as const;

type ChangeType = keyof typeof EVENT_CLASS;

/** 通知里的一条变更：日志行的元数据，没有任何行内容 */
interface ChangeNotice {
  namespace?: unknown;
  entity?: unknown;
  entityId?: unknown;
  type?: unknown;
  branchId?: unknown;
  clientId?: unknown;
  createdAt?: unknown;
  bucket?: unknown;
}

/** 校验通过、要派发的一条变更 */
interface RemoteChange {
  type: ChangeType;
  namespace: string;
  entity: string;
  id: string;
  branchId?: string;
  recordAt: Date;
}

const isChangeType = (type: unknown): type is ChangeType =>
  typeof type === 'string' && Object.hasOwn(EVENT_CLASS, type);

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

/** 广播载荷是 `{ changes: [...] }`；形状不对的消息整条忽略 */
function readNotices(payload: unknown): ChangeNotice[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const changes: unknown = Reflect.get(payload, 'changes');
  if (!Array.isArray(changes)) return [];
  return changes.filter((notice): notice is ChangeNotice => typeof notice === 'object' && notice !== null);
}

/** 本端推送的、未配置实体的、缺主键或类型未知的条目都跳过 */
function toRemoteChange(adapter: RxDBAdapterSupabase, notice: ChangeNotice): RemoteChange | undefined {
  const entity = optionalString(notice.entity);
  const id = optionalString(notice.entityId);
  if (!entity || !id || !isChangeType(notice.type)) return undefined;

  const namespace = optionalString(notice.namespace) ?? 'public';
  if (!isConfiguredEntityScope(adapter.rxdb, namespace, entity)) return undefined;

  const myClientId = adapter.rxdb.context.clientId;
  if (myClientId && notice.clientId === myClientId) return undefined;

  const createdAt = optionalString(notice.createdAt);
  return {
    type: notice.type,
    namespace,
    entity,
    id,
    branchId: optionalString(notice.branchId),
    recordAt: createdAt ? new Date(createdAt) : new Date()
  };
}

function dispatchRun(adapter: RxDBAdapterSupabase, run: RemoteChange[]): void {
  const EventClass = EVENT_CLASS[run[0].type];
  adapter.rxdb.dispatchEvent(
    new EventClass(
      run.map(change => ({
        type: change.type,
        namespace: change.namespace,
        entity: change.entity,
        id: change.id,
        branchId: change.branchId,
        data: { id: change.id },
        recordAt: change.recordAt
      }))
    )
  );
}

/**
 * 处理一条变更通知：相邻、同类型的变更合成一个 Remote 事件派发，保持通知里的先后顺序。
 *
 * @param adapter - 收到通知的适配器
 * @param payload - 广播载荷 `{ changes: ChangeNotice[] }`
 */
export function handleSupabaseChanges(adapter: RxDBAdapterSupabase, payload: unknown): void {
  let run: RemoteChange[] = [];
  for (const notice of readNotices(payload)) {
    const change = toRemoteChange(adapter, notice);
    if (!change) continue;
    if (run.length > 0 && run[0].type !== change.type) {
      dispatchRun(adapter, run);
      run = [];
    }
    run.push(change);
  }
  if (run.length > 0) dispatchRun(adapter, run);
}
