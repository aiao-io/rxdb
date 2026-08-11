/**
 * @fileoverview PGlite 数据库变更事件处理器
 *
 * 将 PGlite NOTIFY 事件转换为 RxDB 标准事件。
 * 支持 RxDBChange 表的双重事件触发机制。
 *
 * @module handle_rxdb_change
 */

import {
  type EntityData,
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  type EntityMetadata,
  type EntityType,
  RxDBChange,
  type RxDBEntityId,
  type RxDBEntityLocalCreatedEventData,
  type RxDBEntityLocalRemovedEventData,
  type RxDBEntityLocalUpdatedEventData,
  getEntityMetadata,
  isAdapterShutdownError
} from '@aiao/rxdb';
import { chunk, unionBy } from '@aiao/utils';
import { PGliteChangeEvent, PGliteChangeType } from './pglite.interface.js';
import { PGliteRepository } from './repository/PGliteRepository.js';
import { RxDBAdapterPGlite } from './RxDBAdapterPGlite.js';

const MAX_ROW_IDS_PER_QUERY = 200;
const RXDB_SYSTEM_TABLES = new Set(['rxdb_change', 'rxdb_branch', 'rxdb_migration']);

type EntityId = RxDBEntityId;
type EventEntity = EntityData & { id: EntityId };
type EventEntityType = EntityType<object, EventEntity>;

const rowIdKey = (rowId: EntityId) => String(rowId);

const getTableNameInfo = (tableName: string): [string, string] => {
  const sep = tableName.indexOf('$');
  if (sep !== -1) return [tableName.slice(0, sep), tableName.slice(sep + 1)];
  if (RXDB_SYSTEM_TABLES.has(tableName)) return ['rxdb', tableName];
  return ['public', tableName];
};

const isRxDBChangeMetadata = (metadata: EntityMetadata): boolean => {
  const changeMetadata = getEntityMetadata(RxDBChange);
  return metadata.tableName === changeMetadata.tableName;
};

const isEntityId = (value: unknown): value is EntityId =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint';

const getRecordAt = (entity: object, fallback: Date): Date => {
  const createdAt = Reflect.get(entity, 'createdAt');
  return createdAt instanceof Date ? createdAt : fallback;
};

const toEventEntity = (entity: object): EventEntity | undefined => {
  const id = Reflect.get(entity, 'id');
  if (!isEntityId(id)) return undefined;
  return { ...entity, id };
};

const isRxDBChangeEntity = (entity: object): entity is RxDBChange => {
  const id = Reflect.get(entity, 'id');
  const type = Reflect.get(entity, 'type');
  return (
    typeof id === 'number' &&
    (type === 'INSERT' || type === 'UPDATE' || type === 'DELETE') &&
    typeof Reflect.get(entity, 'namespace') === 'string' &&
    typeof Reflect.get(entity, 'entity') === 'string' &&
    isEntityId(Reflect.get(entity, 'entityId'))
  );
};

const emitChangeEvent = (adapter: RxDBAdapterPGlite, changes: RxDBChange[]): void => {
  const created: RxDBEntityLocalCreatedEventData<EventEntityType>[] = [];
  const updated: RxDBEntityLocalUpdatedEventData<EventEntityType>[] = [];
  const removed: RxDBEntityLocalRemovedEventData<EventEntityType>[] = [];

  for (const change of changes) {
    if (!change.namespace || !change.entity) {
      console.warn(`RxDBChange record missing namespace or entity: id=${change.id}`);
      continue;
    }

    if (!adapter.rxdb.schemaManager.getEntityMetadata(change.entity, change.namespace)) {
      console.warn(`Entity metadata not found for ${change.namespace}.${change.entity}`);
    }

    const base = {
      namespace: change.namespace,
      entity: change.entity,
      id: change.entityId,
      recordAt: change.createdAt
    };

    switch (change.type) {
      case 'INSERT':
        if (!change.patch) {
          console.warn(`RxDBChange INSERT missing patch: id=${change.id}`);
          continue;
        }
        created.push({
          ...base,
          type: 'INSERT',
          patch: { ...change.patch, id: change.entityId },
          inversePatch: null
        });
        break;
      case 'UPDATE':
        if (!change.patch || !change.inversePatch) {
          console.warn(`RxDBChange UPDATE missing patch pair: id=${change.id}`);
          continue;
        }
        updated.push({
          ...base,
          type: 'UPDATE',
          patch: change.patch,
          inversePatch: change.inversePatch
        });
        break;
      case 'DELETE':
        if (!change.inversePatch) {
          console.warn(`RxDBChange DELETE missing inverse patch: id=${change.id}`);
          continue;
        }
        removed.push({
          ...base,
          type: 'DELETE',
          patch: null,
          inversePatch: change.inversePatch
        });
        break;
    }
  }

  if (created.length > 0) adapter.rxdb.dispatchEvent(new EntityLocalCreatedEvent(created));
  if (updated.length > 0) adapter.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(updated));
  if (removed.length > 0) adapter.rxdb.dispatchEvent(new EntityLocalRemovedEvent(removed));
};

const dispatchRxDBChangeTableEvent = (
  adapter: RxDBAdapterPGlite,
  eventType: PGliteChangeType,
  changes: RxDBChange[],
  fallbackRecordAt: Date
): void => {
  const metadata = getEntityMetadata(RxDBChange);

  if (eventType === PGliteChangeType.INSERT) {
    const events: RxDBEntityLocalCreatedEventData<typeof RxDBChange>[] = changes.map(change => ({
      namespace: metadata.namespace,
      entity: metadata.name,
      type: 'INSERT',
      id: change.id,
      patch: change,
      inversePatch: null,
      recordAt: getRecordAt(change, fallbackRecordAt)
    }));
    adapter.rxdb.dispatchEvent(new EntityLocalCreatedEvent(events));
    return;
  }

  if (eventType === PGliteChangeType.UPDATE) {
    const events: RxDBEntityLocalUpdatedEventData<typeof RxDBChange>[] = changes.map(change => ({
      namespace: metadata.namespace,
      entity: metadata.name,
      type: 'UPDATE',
      id: change.id,
      patch: change,
      inversePatch: {},
      recordAt: getRecordAt(change, fallbackRecordAt)
    }));
    adapter.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(events));
  }
};

const dispatchEntityTableEvent = <T extends EntityType>(
  adapter: RxDBAdapterPGlite,
  event: PGliteChangeEvent,
  metadata: EntityMetadata,
  entities: InstanceType<T>[]
): void => {
  const eventEntities = entities.flatMap(entity => {
    const data = toEventEntity(entity);
    if (data) return [data];
    console.warn(`Entity ${metadata.namespace}.${metadata.name} missing string, number or bigint id`);
    return [];
  });

  if (event.type === PGliteChangeType.INSERT) {
    const events: RxDBEntityLocalCreatedEventData<EventEntityType>[] = eventEntities.map(entity => ({
      namespace: metadata.namespace,
      entity: metadata.name,
      type: 'INSERT',
      id: entity.id,
      patch: entity,
      inversePatch: null,
      recordAt: getRecordAt(entity, event.recordAt)
    }));
    if (events.length > 0) adapter.rxdb.dispatchEvent(new EntityLocalCreatedEvent(events));
    return;
  }

  if (event.type === PGliteChangeType.UPDATE) {
    const events: RxDBEntityLocalUpdatedEventData<EventEntityType>[] = eventEntities.map(entity => ({
      namespace: metadata.namespace,
      entity: metadata.name,
      type: 'UPDATE',
      id: entity.id,
      patch: entity,
      inversePatch: {},
      recordAt: getRecordAt(entity, event.recordAt)
    }));
    if (events.length > 0) adapter.rxdb.dispatchEvent(new EntityLocalUpdatedEvent(events));
    return;
  }

  const events: RxDBEntityLocalRemovedEventData<EventEntityType>[] = eventEntities.map(entity => ({
    namespace: metadata.namespace,
    entity: metadata.name,
    type: 'DELETE',
    id: entity.id,
    patch: null,
    inversePatch: entity,
    recordAt: getRecordAt(entity, event.recordAt)
  }));
  if (events.length > 0) adapter.rxdb.dispatchEvent(new EntityLocalRemovedEvent(events));
};

export const handle_rxdb_change = <T extends EntityType = EntityType>(
  adapter: RxDBAdapterPGlite,
  event: PGliteChangeEvent
): Promise<void> => {
  const [namespace, name] = getTableNameInfo(event.tableName);
  const entityType = adapter.rxdb.schemaManager.getEntityTypeByTableName<T>(name, namespace);
  if (!entityType) return Promise.resolve();

  const metadata = adapter.rxdb.schemaManager.getEntityMetadataByTableName(name, namespace);
  if (!metadata) {
    console.warn(`Metadata not found for entity ${namespace}.${name}`);
    return Promise.resolve();
  }

  const uniqueRowIds = unionBy(event.rowIds, rowIdKey);
  if (uniqueRowIds.length === 0) return Promise.resolve();

  const repository = adapter.getRepository<T, PGliteRepository<T>>(entityType);
  const rowIds = isRxDBChangeMetadata(metadata) ? uniqueRowIds.map(String) : uniqueRowIds;
  return (async () => {
    const entities =
      rowIds.length <= MAX_ROW_IDS_PER_QUERY ?
        await repository.findByRowIds(rowIds)
      : (await Promise.all(chunk(rowIds, MAX_ROW_IDS_PER_QUERY).map(ids => repository.findByRowIds(ids)))).flat();
    if (entities.length === 0) return;

    if (isRxDBChangeMetadata(metadata)) {
      const changes = entities.filter(isRxDBChangeEntity);
      if (changes.length !== entities.length) {
        console.warn(`Invalid RxDBChange rows received: expected=${entities.length}, valid=${changes.length}`);
      }
      if (changes.length === 0) return;
      emitChangeEvent(adapter, changes);
      dispatchRxDBChangeTableEvent(adapter, event.type, changes, event.recordAt);
      return;
    }

    dispatchEntityTableEvent(adapter, event, metadata, entities);
  })().catch((error: unknown) => {
    if (isAdapterShutdownError(error)) return;
    throw error;
  });
};
