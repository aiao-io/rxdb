import { describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, type SyncOptions, SyncType } from '../../entity/metadata-options.interface.js';
import { resolveBatchPrimaryAdapter, RxDBMissingPrimaryAdapterError } from '../../entity/primary-adapter.js';
import type { IRxDBAdapter, RxDBMutationsMap } from '../../rxdb-adapter.js';
import { getEntityMetadata, getEntityStatus } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { createEntitySyncResolver } from '../../sync-contract/entity-sync-resolver.js';
import { registerRxDBTeardown } from '../fixtures/rxdb-lifecycle.js';

const { trackRxDB } = registerRxDBTeardown();

@Entity({ name: 'DisabledBatchRow', properties: [{ name: 'title', type: PropertyType.string }] })
class DisabledBatchRow extends EntityBase {
  title!: string;
}

@Entity({ name: 'RegularBatchRow', properties: [{ name: 'title', type: PropertyType.string }] })
class RegularBatchRow extends EntityBase {
  title!: string;
}

@Entity({
  name: 'OwnLocalBatchRow',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
})
class OwnLocalBatchRow extends EntityBase {
  title!: string;
}

const SYNC_DISABLED: SyncOptions = { type: SyncType.None };
const LOCAL_DATABASE: SyncOptions = { type: SyncType.None, local: { adapter: 'pglite' } };

const disabledResolver = (databaseSync: SyncOptions | undefined) =>
  createEntitySyncResolver(databaseSync, new Map([[getEntityMetadata(DisabledBatchRow), SYNC_DISABLED]]));

describe('resolveBatchPrimaryAdapter：两侧都没声明的 SyncDisabled 覆盖', () => {
  it('纯同类批量沿用数据库级的本地适配器，与单条保存同一去向', () => {
    expect(resolveBatchPrimaryAdapter([DisabledBatchRow as EntityType], disabledResolver(LOCAL_DATABASE))).toEqual({
      kind: 'local',
      adapter: 'pglite'
    });
  });

  it('与继承库级配置的实体混批时结论相同', () => {
    expect(
      resolveBatchPrimaryAdapter(
        [DisabledBatchRow as EntityType, RegularBatchRow as EntityType],
        disabledResolver(LOCAL_DATABASE)
      )
    ).toEqual({ kind: 'local', adapter: 'pglite' });
  });

  it('数据库级没有本地适配器时，不靠批内别的实体放行，逐个点名缺适配器的实体', () => {
    let error: unknown;
    try {
      resolveBatchPrimaryAdapter(
        [OwnLocalBatchRow as EntityType, DisabledBatchRow as EntityType],
        disabledResolver(undefined)
      );
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(RxDBMissingPrimaryAdapterError);
    expect((error as RxDBMissingPrimaryAdapterError).entityNames).toEqual(['DisabledBatchRow']);
  });
});

type ManagedEntity = InstanceType<EntityType>;

const createRecordingAdapter = () => {
  const writes: string[] = [];
  const settle = (entity: ManagedEntity) => {
    const status = getEntityStatus(entity);
    status.replace({ ...entity });
    status.local = true;
  };
  const repository = {
    create: async (entity: ManagedEntity) => {
      writes.push(`create:${(entity as unknown as { title: string }).title}`);
      settle(entity);
      return entity;
    },
    update: async (entity: ManagedEntity) => {
      writes.push(`update:${(entity as unknown as { title: string }).title}`);
      settle(entity);
      return entity;
    },
    find: async () => [],
    count: async () => 0
  };
  const adapter = {
    name: 'pglite',
    getRepository: () => repository,
    mutations: async (options: RxDBMutationsMap) => {
      const saved: ManagedEntity[] = [];
      for (const entities of options.create.values()) {
        for (const entity of entities) {
          writes.push(`batch-create:${(entity as unknown as { title: string }).title}`);
          settle(entity);
          saved.push(entity);
        }
      }
      return saved;
    },
    disconnect: async () => undefined
  };
  return { adapter, writes };
};

describe('EntityManager：SyncDisabled 覆盖的实体单条、纯同类批量、混合批量同一规则', () => {
  it('三种保存形态都落到库级的本地适配器', async () => {
    const { adapter, writes } = createRecordingAdapter();
    const rxdb = trackRxDB(
      new RxDB({
        dbName: 'sync-disabled-batch',
        entities: [DisabledBatchRow, RegularBatchRow],
        sync: LOCAL_DATABASE,
        syncOverrides: [{ entity: DisabledBatchRow, sync: SYNC_DISABLED }],
        multiInstance: false
      })
    );
    rxdb.adapter('pglite', () => adapter as unknown as IRxDBAdapter);
    rxdb.init();

    await new DisabledBatchRow({ title: 'single' }).save();
    await rxdb.entityManager.saveMany([new DisabledBatchRow({ title: 'batch-alone' })]);
    await rxdb.entityManager.saveMany([
      new DisabledBatchRow({ title: 'mixed-disabled' }),
      new RegularBatchRow({ title: 'mixed-regular' })
    ]);

    expect(writes).toEqual([
      'create:single',
      'batch-create:batch-alone',
      'batch-create:mixed-disabled',
      'batch-create:mixed-regular'
    ]);
  });
});
