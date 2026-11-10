import { describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import {
  ENTITY_STATIC_TYPES,
  type EntityType,
  type RelationEntitiesObservable,
  type RelationEntityObservable
} from '../../entity/entity.interface.js';
import { PropertyType, RelationKind, SyncType } from '../../entity/metadata-options.interface.js';
import type { IRxDBAdapter, RxDBMutationsMap } from '../../rxdb-adapter.js';
import { getEntityStatus } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { registerRxDBTeardown } from '../fixtures/rxdb-lifecycle.js';

const { trackRxDB } = registerRxDBTeardown();

@Entity({
  name: 'DetachParent',
  properties: [{ name: 'label', type: PropertyType.string, nullable: true }],
  relations: [
    { name: 'children', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'DetachChild', mappedProperty: 'parent' }
  ]
})
class DetachParent extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  label!: string | null;
  declare children$: RelationEntitiesObservable<typeof DetachChild>;
}

@Entity({
  name: 'DetachChild',
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'DetachParent',
      mappedProperty: 'children',
      nullable: true
    }
  ]
})
class DetachChild extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
  parentId!: string | null;
  declare parent$: RelationEntityObservable<typeof DetachParent>;
}

type ManagedEntity = InstanceType<EntityType>;

interface RecordedWrite {
  op: 'create' | 'update';
  entity: ManagedEntity;
  patch?: Record<string, unknown>;
}

/** 记录每一次写入并按「写库成功」收尾的替身；`failNext` 让下一次更新失败一次 */
const createRecordingAdapter = () => {
  const writes: RecordedWrite[] = [];
  const control = { failNext: false };
  const settle = (entity: ManagedEntity) => {
    const status = getEntityStatus(entity);
    status.replace({ ...entity });
    status.local = true;
  };
  const repository = {
    create: async (entity: ManagedEntity) => {
      writes.push({ op: 'create', entity });
      settle(entity);
      return entity;
    },
    update: async (entity: ManagedEntity, patch: Record<string, unknown>) => {
      if (control.failNext) {
        control.failNext = false;
        throw new Error('write failed');
      }
      writes.push({ op: 'update', entity, patch: { ...patch } });
      settle(entity);
      return entity;
    },
    remove: async (entity: ManagedEntity) => entity,
    find: async () => [],
    count: async () => 0
  };
  const adapter = {
    name: 'sqlite',
    getRepository: () => repository,
    mutations: async (options: RxDBMutationsMap) => {
      const saved: ManagedEntity[] = [];
      for (const [kind, bucket] of [
        ['create', options.create],
        ['update', options.update]
      ] as const) {
        for (const entities of bucket.values()) {
          for (const entity of entities) {
            writes.push({ op: kind, entity, patch: { ...getEntityStatus(entity).patch } });
            settle(entity);
            saved.push(entity);
          }
        }
      }
      return saved;
    },
    disconnect: async () => undefined
  };
  return { adapter, writes, control };
};

const PARENT_ID = 'parent';
const CHILD_ID = 'child';
const STAMP = new Date('2026-01-01T00:00:00.000Z');

const setup = (dbName: string) => {
  const { adapter, writes, control } = createRecordingAdapter();
  const rxdb = trackRxDB(
    new RxDB({
      dbName,
      entities: [DetachParent, DetachChild],
      sync: { local: { adapter: 'sqlite' }, type: SyncType.None },
      multiInstance: false
    })
  );
  rxdb.adapter('sqlite', () => adapter as unknown as IRxDBAdapter);
  rxdb.init();
  const parent = rxdb.entityManager.createEntityRef(
    DetachParent,
    { id: PARENT_ID, label: null, createdAt: STAMP, updatedAt: STAMP },
    { local: true, modified: false }
  );
  const child = rxdb.entityManager.createEntityRef(
    DetachChild,
    { id: CHILD_ID, title: 'child', parentId: PARENT_ID, createdAt: STAMP, updatedAt: STAMP },
    { local: true, modified: false }
  );
  return { rxdb, parent, child, writes, control };
};

const childWrites = (writes: readonly RecordedWrite[], child: ManagedEntity) =>
  writes.filter(write => write.entity === child);

describe('一对多集合解绑后保存所属实体', () => {
  it('add 后 remove 再保存父实体，子实体的外键置空随之写出', async () => {
    const { parent, child, writes } = setup('detach-after-add');
    parent.children$.add(child);
    parent.children$.remove(child);
    expect(child.parentId).toBeNull();

    await parent.save();

    expect(childWrites(writes, child)).toEqual([{ op: 'update', entity: child, patch: { parentId: null } }]);
    expect(getEntityStatus(child).modified).toBe(false);
  });

  it('查询得到、没进过关系缓存的子实体 remove 后同样随父实体保存', async () => {
    const { parent, child, writes } = setup('detach-queried-child');
    parent.children$.remove(child);

    await parent.save();

    expect(childWrites(writes, child)).toEqual([{ op: 'update', entity: child, patch: { parentId: null } }]);
  });

  it('解绑落库之后，子实体的后续编辑不再跟着父实体保存', async () => {
    const { parent, child, writes } = setup('detach-forgotten-after-save');
    parent.children$.remove(child);
    await parent.save();
    child.title = 'later edit';

    await parent.save();

    expect(childWrites(writes, child)).toHaveLength(1);
    expect(getEntityStatus(child).patch).toEqual({ title: 'later edit' });
  });

  it('保存失败时解绑仍待写，重试会再写一次', async () => {
    const { parent, child, writes, control } = setup('detach-retry');
    parent.children$.remove(child);
    control.failNext = true;

    await expect(parent.save()).rejects.toThrow('write failed');
    expect(childWrites(writes, child)).toHaveLength(0);

    await parent.save();

    expect(childWrites(writes, child)).toEqual([{ op: 'update', entity: child, patch: { parentId: null } }]);
  });

  it('批量保存同样收集解绑的子实体', async () => {
    const { rxdb, parent, child, writes } = setup('detach-save-many');
    parent.children$.remove(child);

    await rxdb.entityManager.saveMany([parent]);

    expect(childWrites(writes, child)).toEqual([{ op: 'update', entity: child, patch: { parentId: null } }]);
  });

  it('从未落库的子实体加了又移除，保存父实体时不会凭空建出来', async () => {
    const { rxdb, parent, writes } = setup('detach-new-child');
    const draft = rxdb.entityManager.createEntityRef(DetachChild, { id: 'draft', title: 'draft' });
    parent.children$.add(draft);
    parent.children$.remove(draft);

    await parent.save();

    expect(childWrites(writes, draft)).toHaveLength(0);
  });
});
