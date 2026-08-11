import {
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  EntityType,
  getEntityMetadata,
  getEntityStatus,
  RxDBChange,
  RxDBEntityLocalCreatedEventData,
  RxDBEntityLocalEventData,
  RxDBEntityLocalRemovedEventData,
  RxDBEntityLocalUpdatedEventData
} from '@aiao/rxdb';
import { SqliteRepository } from './repository/SqliteRepository.js';
import type { RxDBAdapterSqliteBase } from './RxDBAdapterSqliteBase.js';
import { SQLiteChangeType } from './sqlite-backend.interface.js';
import { getRxDBChangeEventType, SqliteChangeEvent } from './sqlite-core.interface.js';
import { get_table_name_info, RxDBAdapterSqliteError } from './sqlite-core.utils.js';
import { unenvelopePlaintextPatches } from './system/encrypt-patch.js';

type EntityMetadata = ReturnType<typeof getEntityMetadata>;
type EntityPatch<T extends EntityType> = Readonly<Partial<InstanceType<T>>>;
type EntityFull<T extends EntityType> = Readonly<InstanceType<T>>;

/** 一条变更行，以及解回明文后的 patch / inversePatch */
interface DecryptedChange {
  change: RxDBChange;
  patch: Record<string, unknown> | null;
  inversePatch: Record<string, unknown> | null;
}

/**
 * 把变更行里的加密列解回明文。
 *
 * @remarks
 * 触发器写进 change 行的是物理列的原值，而加密列在库里是 TEXT 信封 —— 不解 envelope
 * 就直接派发，等于把密文交给 QueryManager/UI（SQLC-011）。
 *
 * 解密结果只存在于返回值里，**不回写变更行**：change 表自身的元事件仍要携带原始信封。
 *
 * `unenvelopePlaintextPatches` 只处理字符串值，因此 SQLC-011 修复前写下的加密 boolean
 * 历史行（触发器把信封压成了数字 0/1）会原样透传，而不是在解密处炸掉整条变更流。
 */
const decrypt_change_patches = async (adapter: RxDBAdapterSqliteBase, change: RxDBChange): Promise<DecryptedChange> => {
  const patch = (change.patch ?? null) as Record<string, unknown> | null;
  const inversePatch = (change.inversePatch ?? null) as Record<string, unknown> | null;
  const { keyring } = adapter.encryptionContext;
  if (!keyring) return { change, patch, inversePatch };
  const entity = adapter.rxdb.schemaManager.getEntityMetadata(change.entity, change.namespace);
  if (!entity?.encryptedPropertyMap?.size) return { change, patch, inversePatch };

  const primaryKeyString = change.entityId;
  const unenvelope = (target: Record<string, unknown>): Promise<Record<string, unknown>> =>
    unenvelopePlaintextPatches({ entity, primaryKeyString, patch: target, keyring });
  return {
    change,
    patch: patch === null ? null : await unenvelope(patch),
    inversePatch: inversePatch === null ? null : await unenvelope(inversePatch)
  };
};

const emit_change_event = async (adapter: RxDBAdapterSqliteBase, eventData: RxDBChange[]): Promise<void> => {
  const decrypted = await Promise.all(eventData.map(change => decrypt_change_patches(adapter, change)));
  const group = new Map<RxDBChange['type'], DecryptedChange[]>();
  for (const item of decrypted) {
    const items = group.get(item.change.type);
    if (items) items.push(item);
    else group.set(item.change.type, [item]);
  }

  const inserts = group.get('INSERT');
  if (inserts?.length) {
    const events = inserts.map(({ change, patch }): RxDBEntityLocalCreatedEventData => ({
      namespace: change.namespace!,
      entity: change.entity,
      type: change.type,
      id: change.entityId,
      patch: patch as unknown as EntityFull<EntityType>,
      inversePatch: null,
      recordAt: change.createdAt
    }));
    adapter.rxdb.dispatchEvent(new EntityLocalCreatedEvent(events));
  }

  const updates = group.get('UPDATE');
  if (updates?.length) {
    const events = updates.map(({ change, patch, inversePatch }): RxDBEntityLocalUpdatedEventData => ({
      namespace: change.namespace!,
      entity: change.entity,
      type: change.type,
      id: change.entityId,
      patch: patch as unknown as EntityPatch<EntityType>,
      inversePatch: inversePatch as unknown as EntityPatch<EntityType>,
      recordAt: change.createdAt
    }));
    adapter.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(events));
  }

  const deletes = group.get('DELETE');
  if (deletes?.length) {
    const events = deletes.map(({ change, inversePatch }): RxDBEntityLocalRemovedEventData => ({
      namespace: change.namespace!,
      entity: change.entity,
      type: change.type,
      id: change.entityId,
      patch: null,
      inversePatch: inversePatch as unknown as EntityPatch<EntityType>,
      recordAt: change.createdAt
    }));
    adapter.rxdb.dispatchEvent(new EntityLocalRemovedEvent(events));
  }
};

const build_rxdb_change_meta_event = <T extends EntityType>(
  entity: InstanceType<T>,
  metadata: EntityMetadata
): RxDBEntityLocalCreatedEventData => ({
  namespace: metadata.namespace,
  entity: metadata.name,
  type: (entity as unknown as RxDBChange).type,
  id: entity.id,
  patch: { ...entity } as EntityFull<EntityType>,
  inversePatch: null,
  recordAt: entity.createdAt
});

const handle_rxdb_change_table = async <T extends EntityType>(
  adapter: RxDBAdapterSqliteBase,
  result: InstanceType<T>[],
  event: SqliteChangeEvent,
  metadata: EntityMetadata
): Promise<void> => {
  const entities = result as unknown as RxDBChange[];
  for (const change of entities) {
    if (!adapter.rxdb.schemaManager.getEntityMetadata(change.entity, change.namespace)) {
      console.warn(`Entity metadata not found for ${change.namespace}.${change.entity}`);
    }
  }

  if (event.type === SQLiteChangeType.SQLITE_INSERT) {
    // 必须等解密完成再派发元事件：两者的先后顺序是既有契约（实体事件在前）
    await emit_change_event(adapter, entities);
    const rxDBChangeEvent = entities.map(d => build_rxdb_change_meta_event(d as unknown as InstanceType<T>, metadata));
    adapter.rxdb.dispatchEvent(new EntityLocalCreatedEvent(rxDBChangeEvent));
    return;
  }

  if (event.type === SQLiteChangeType.SQLITE_UPDATE) {
    // 跨 Tab 同步 undo/redo 状态（如 revertChangeId 变更）
    const rxDBChangeEvent: RxDBEntityLocalUpdatedEventData[] = entities.map(d => ({
      namespace: metadata.namespace,
      entity: metadata.name,
      type: d.type,
      id: d.id,
      patch: { ...getEntityStatus(d).origin } as unknown as EntityPatch<EntityType>,
      inversePatch: {} as EntityPatch<EntityType>,
      recordAt: d.createdAt
    }));
    adapter.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(rxDBChangeEvent));
  }
  // DELETE 操作不发出任何事件
};

const build_system_event_data = <T extends EntityType>(
  entity: InstanceType<T>,
  metadata: EntityMetadata,
  eventType: SQLiteChangeType
): RxDBEntityLocalEventData => {
  const id = entity.id;
  const recordAt = entity.createdAt || new Date();
  const namespace = metadata.namespace;
  const entityName = metadata.name;
  switch (eventType) {
    case SQLiteChangeType.SQLITE_INSERT:
      return {
        namespace,
        entity: entityName,
        type: 'INSERT',
        id,
        patch: { ...entity } as unknown as EntityFull<EntityType>,
        inversePatch: null,
        recordAt
      };
    case SQLiteChangeType.SQLITE_DELETE:
      return {
        namespace,
        entity: entityName,
        type: 'DELETE',
        id,
        patch: null,
        inversePatch: { ...entity } as unknown as EntityPatch<EntityType>,
        recordAt
      };
    case SQLiteChangeType.SQLITE_UPDATE:
      return {
        namespace,
        entity: entityName,
        type: 'UPDATE',
        id,
        patch: { ...getEntityStatus(entity).origin } as unknown as EntityPatch<EntityType>,
        inversePatch: {} as EntityPatch<EntityType>,
        recordAt
      };
  }
};

const dispatch_system_event = (
  adapter: RxDBAdapterSqliteBase,
  type: ReturnType<typeof getRxDBChangeEventType>,
  events: RxDBEntityLocalEventData[]
): void => {
  switch (type) {
    case 'UPDATE':
      adapter.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(events as RxDBEntityLocalUpdatedEventData[]));
      return;
    case 'DELETE':
      adapter.rxdb.dispatchEvent(new EntityLocalRemovedEvent(events as RxDBEntityLocalRemovedEventData[]));
      return;
    case 'INSERT':
      adapter.rxdb.dispatchEvent(new EntityLocalCreatedEvent(events as RxDBEntityLocalCreatedEventData[]));
      return;
  }
};

const handle_system_table = <T extends EntityType>(
  adapter: RxDBAdapterSqliteBase,
  result: InstanceType<T>[],
  event: SqliteChangeEvent,
  metadata: EntityMetadata
): void => {
  const events = result.map(entity => build_system_event_data(entity, metadata, event.type));
  dispatch_system_event(adapter, getRxDBChangeEventType(event.type), events);
};

/**
 * 处理 SQLite 变更事件，将 update_hook 触发的行变更转换为 RxDB 实体事件。
 *
 * 设计为 fire-and-forget：由 update_hook 同步调用，内部异步查询不阻塞调用方。
 * 失败通过 {@link RxDBAdapterSqliteBase.emitChangeError} 上报（无监听器时降级为
 * `console.error`）；这条路径没有调用方，抛出只会变成 unhandled rejection（SQLC-012）。
 * 高频场景下事件处理可能堆积，但由于 SqliteClient 内部队列保证串行执行，不会产生并发问题。
 */
export const handle_rxdb_change = <T extends EntityType>(
  adapter: RxDBAdapterSqliteBase,
  event: SqliteChangeEvent
): Promise<void> => {
  const { tableName } = event;
  const [namespace, table_name] = get_table_name_info(tableName);
  const EntityType = adapter.rxdb.schemaManager.getEntityTypeByTableName<T>(table_name, namespace);
  if (!EntityType) return Promise.resolve();
  const repository = adapter.getRepository<T, SqliteRepository<T>>(EntityType);
  const metadata = getEntityMetadata(EntityType);
  const rxdb_change_meta = getEntityMetadata(RxDBChange);

  const { rowIds } = event;
  return repository
    .findByRowIds(rowIds, event.type === SQLiteChangeType.SQLITE_UPDATE)
    .then(async result => {
      try {
        if (metadata === rxdb_change_meta) {
          await handle_rxdb_change_table(adapter, result, event, metadata);
        } else {
          handle_system_table(adapter, result, event, metadata);
        }
      } catch (error) {
        adapter.emitChangeError({ error, tableName, rowIds, phase: 'process' });
      }
    })
    .catch(error => {
      // 断开期间被取消的查询不是失败：没有变更丢失，只是这个 adapter 不再服务
      if (error instanceof RxDBAdapterSqliteError && error.code === 'adapter_disconnected') return;
      adapter.emitChangeError({ error, tableName, rowIds, phase: 'query' });
    });
};
