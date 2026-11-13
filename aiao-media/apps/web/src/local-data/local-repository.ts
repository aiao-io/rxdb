import {
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  getEntityMetadata,
  type EntityType,
  type IRepository,
  type RxDBEvent
} from '@aiao/rxdb';

/** 为不记录变更日志的本机实体接通 RxDB 查询与跨窗口事件。 */
export function localRepository<T extends EntityType>(
  entity: T,
  repository: IRepository<T>,
  publish: (event: RxDBEvent) => void
): IRepository<T> {
  const metadata = getEntityMetadata(entity);
  const identity = { namespace: metadata.namespace, entity: metadata.name };
  return {
    find: options => repository.find(options),
    count: options => repository.count(options),
    async create(value) {
      const saved = await repository.create(value);
      publish(
        new EntityLocalCreatedEvent([
          {
            ...identity,
            type: 'INSERT',
            id: saved.id,
            patch: structuredClone({ ...saved }),
            inversePatch: null,
            recordAt: saved.updatedAt
          }
        ])
      );
      return saved;
    },
    async update(value, patch) {
      const before = structuredClone({ ...value });
      const saved = await repository.update(value, patch);
      publish(
        new EntityLocalUpdatedEvent([
          {
            ...identity,
            type: 'UPDATE',
            id: saved.id,
            patch: structuredClone({ ...saved }),
            inversePatch: before,
            recordAt: saved.updatedAt
          }
        ])
      );
      return saved;
    },
    async remove(value) {
      const before = structuredClone({ ...value });
      const removed = await repository.remove(value);
      publish(
        new EntityLocalRemovedEvent([
          {
            ...identity,
            type: 'DELETE',
            id: before.id,
            patch: null,
            inversePatch: before,
            recordAt: new Date()
          }
        ])
      );
      return removed;
    }
  };
}
