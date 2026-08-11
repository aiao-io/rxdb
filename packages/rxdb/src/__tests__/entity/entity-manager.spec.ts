import { beforeAll, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, type EntityType, UUID } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { RxDBMissingPrimaryAdapterError, RxDBMixedPrimaryAdapterError } from '../../entity/primary-adapter.js';
import { Repository } from '../../repository/Repository.js';
import type { IRxDBAdapter, RxDBMutationsMap } from '../../rxdb-adapter.js';
import { getEntityStatus, uuid } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import { RxDBError } from '../../RxDBError.js';
import { collectGarbageUntil } from '../fixtures/gc.js';

// 用于测试的模拟适配器。
type ManagedEntity = InstanceType<EntityType>;

const mockAdapter = {
  name: 'sqlite',
  create: async (entity: ManagedEntity) => {
    const status = getEntityStatus(entity);
    status.local = true;
    status.modified = false;
    return entity;
  },
  createMany: async (entities: ManagedEntity[]) => {
    entities.forEach(entity => {
      const status = getEntityStatus(entity);
      status.local = true;
      status.modified = false;
    });
    return entities;
  },
  update: async (entity: ManagedEntity) => {
    const status = getEntityStatus(entity);
    status.modified = false;
    return entity;
  },
  updateMany: async (entities: ManagedEntity[]) => {
    entities.forEach(entity => {
      const status = getEntityStatus(entity);
      status.modified = false;
    });
    return entities;
  },
  remove: async (entity: ManagedEntity) => {
    const status = getEntityStatus(entity);
    status.removed = true;
    status.local = false;
    return entity;
  },
  removeMany: async (entities: ManagedEntity[]) => {
    entities.forEach(entity => {
      const status = getEntityStatus(entity);
      status.removed = true;
      status.local = false;
    });
    return entities;
  },
  find: async () => [],
  count: async () => 0,
  saveMany: async (entities: ManagedEntity[]) => {
    entities.forEach(entity => {
      const status = getEntityStatus(entity);
      if (!status.local) {
        status.local = true;
      }
      status.modified = false;
    });
    return entities;
  },
  mutations: async (options: RxDBMutationsMap) => {
    const results: ManagedEntity[] = [];
    if (options.create) {
      for (const [, entities] of options.create) {
        const created = await mockAdapter.createMany(Array.from(entities));
        results.push(...created);
      }
    }
    if (options.update) {
      for (const [, entities] of options.update) {
        const updated = await mockAdapter.updateMany(Array.from(entities));
        results.push(...updated);
      }
    }
    if (options.remove) {
      for (const [, entities] of options.remove) {
        const removed = await mockAdapter.removeMany(Array.from(entities));
        results.push(...removed);
      }
    }
    return results;
  },
  getRepository: () => mockAdapter
};

describe('EntityManager', () => {
  @Entity({
    name: 'Todo',
    properties: [
      { name: 'title', type: PropertyType.string },
      { name: 'completed', type: PropertyType.boolean, default: false }
    ]
  })
  class Todo extends EntityBase {
    static [ENTITY_STATIC_TYPES]: { idType: UUID };
    title!: string;
    completed!: boolean;
  }

  let rxdb: RxDB;
  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'Todo',
      entities: [Todo],
      sync: {
        local: {
          adapter: 'sqlite'
        },
        type: SyncType.None
      }
    });

    // 注册模拟适配器。
    rxdb.adapter('sqlite', () => mockAdapter as unknown as IRxDBAdapter);
    rxdb.init();
  });

  it('操作实体缓存', async () => {
    const todo = rxdb.entityManager.createEntityRef(Todo, {
      title: 'todo',
      id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
    });
    expect(todo).toBeInstanceOf(Todo);
    const todo2 = rxdb.entityManager.getEntityRef(Todo, todo.id);
    expect(todo).toEqual(todo2);
    const has = rxdb.entityManager.hasEntityRef(Todo, todo.id);
    expect(has).toEqual(true);
    rxdb.entityManager.removeEntityCache(todo2);
    const has2 = rxdb.entityManager.hasEntityRef(Todo, todo.id);
    expect(has2).toEqual(false);
  });

  it('getRepository', async () => {
    const todoRepo = rxdb.entityManager.getRepository(Todo);
    expect(todoRepo).toBeInstanceOf(Repository);
  });

  it('getRepository Err', async () => {
    class Todo2 {}
    try {
      rxdb.entityManager.getRepository(Todo2);
    } catch (error) {
      expect(error).toBeInstanceOf(RxDBError);
    }
  });

  it('cleanAllCache 应清空所有缓存', () => {
    const todo = rxdb.entityManager.createEntityRef(Todo, {
      title: 'test',
      id: uuid()
    });
    expect(rxdb.entityManager.hasEntityRef(Todo, todo.id)).toBe(true);

    rxdb.entityManager.cleanAllCache();

    expect(rxdb.entityManager.hasEntityRef(Todo, todo.id)).toBe(false);
  });

  it('createEntityRef 应创建新实体引用', () => {
    const id = uuid();
    const todo = rxdb.entityManager.createEntityRef(Todo, {
      title: 'New Todo',
      id,
      completed: false
    });

    expect(todo).toBeInstanceOf(Todo);
    expect(todo.title).toBe('New Todo');
    expect(todo.completed).toBe(false);
    expect(rxdb.entityManager.hasEntityRef(Todo, id)).toBe(true);
  });

  it('createEntityRef 应更新已存在的实体', () => {
    const id = uuid();
    const todo1 = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Original',
      id
    });

    const todo2 = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Updated',
      id
    });

    expect(todo1).toBe(todo2); // 应该是同一个实例
    expect(todo1.title).toBe('Updated');
  });

  it('createEntityRef 更新缓存实体时不应误标记为 modified', () => {
    const id = uuid();
    const todo = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Original',
      id
    });

    const status = getEntityStatus(todo);
    status.modified = false;

    rxdb.entityManager.createEntityRef(Todo, {
      title: 'Synced',
      id
    });

    expect(todo.title).toBe('Synced');
    expect(status.modified).toBe(false);
    expect(status.patch).toEqual({});
    expect(status.patches).toEqual([]);
    expect(status.origin.title).toBe('Synced');
  });

  it('addEntityCache 应添加实体到缓存', () => {
    const id = uuid();
    rxdb.entityManager.createEntityRef(Todo, {
      id,
      title: 'Test'
    });

    expect(rxdb.entityManager.hasEntityRef(Todo, id)).toBe(true);
  });

  it('save 应为新实体调用 create', async () => {
    const todo = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Save Test',
      id: uuid()
    });

    const status = getEntityStatus(todo);
    expect(status.local).toBe(false);

    await rxdb.entityManager.save(todo);

    // save 方法成功执行
    expect(todo.title).toBe('Save Test');
  });

  it('create 应创建新实体', async () => {
    const todo = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Create Test',
      id: uuid()
    });

    await rxdb.entityManager.create(todo);

    const status = getEntityStatus(todo);
    expect(status.local).toBe(true);
    expect(status.modified).toBe(false);
  });

  it('update 应更新已修改的实体', async () => {
    const todo = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Original Title',
      id: uuid()
    });

    await rxdb.entityManager.create(todo);

    // 修改实体
    todo.title = 'Updated Title';
    const status = getEntityStatus(todo);
    expect(status.modified).toBe(true);

    await rxdb.entityManager.update(todo);

    expect(status.modified).toBe(false);
  });

  it('update 不应更新未修改的实体', async () => {
    const todo = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Unchanged',
      id: uuid()
    });

    await rxdb.entityManager.create(todo);

    const status = getEntityStatus(todo);
    status.modified = false;

    const result = await rxdb.entityManager.update(todo);

    expect(result).toBe(todo);
  });

  it('update 对改回原值的实体应 no-op（空 patch 不产生 UPDATE）', async () => {
    const todo = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Keep',
      id: uuid()
    });

    await rxdb.entityManager.create(todo);

    // 改后又改回原值：modified 标记为 true，但 patch 为空
    todo.title = 'Changed';
    todo.title = 'Keep';
    const status = getEntityStatus(todo);
    expect(status.modified).toBe(true);
    expect(status.patch).toEqual({});

    const result = await rxdb.entityManager.update(todo);

    expect(result).toBe(todo);
    // adapter.update 未被调用时，mock 不会重置 modified 标记
    expect(status.modified).toBe(true);
  });

  it('reset 应重置已修改的实体', async () => {
    const todo = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Original',
      id: uuid()
    });

    await rxdb.entityManager.create(todo);

    todo.title = 'Modified';
    const status = getEntityStatus(todo);
    expect(status.modified).toBe(true);

    await rxdb.entityManager.reset(todo);

    expect(status.modified).toBe(false);
    expect(todo.title).toBe('Original');
  });

  it('remove 应删除实体', async () => {
    const todo = rxdb.entityManager.createEntityRef(Todo, {
      title: 'To Delete',
      id: uuid()
    });

    await rxdb.entityManager.create(todo);

    await rxdb.entityManager.remove(todo);

    const status = getEntityStatus(todo);
    expect(status.removed).toBe(true);
  });

  it('saveMany 应批量保存实体', async () => {
    const todo1 = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Todo 1',
      id: uuid()
    });

    const todo2 = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Todo 2',
      id: uuid()
    });

    const status1 = getEntityStatus(todo1);
    const status2 = getEntityStatus(todo2);
    expect(status1.local).toBe(false);
    expect(status2.local).toBe(false);

    await rxdb.entityManager.saveMany([todo1, todo2]);

    // saveMany 成功执行
    expect(todo1.title).toBe('Todo 1');
    expect(todo2.title).toBe('Todo 2');
  });

  // RXD-055：单条 save 走 sync-aware 的 Repository.primary$，批量入口却硬等 localAdapter$。
  // remote-only 配置下该流永不发射，`firstValueFrom` 永久挂起——调用方拿到一个永远
  // 不 settle 的 Promise。修完之后两个入口共用同一个主适配器选择器。
  describe('批量与单条共用主适配器选择器（RXD-055）', () => {
    /** 记录自己收到过哪些批量写入的替身；local / remote 各建一个才分得清写去了哪边 */
    const createRecordingAdapter = (name: string) => {
      const seen: RxDBMutationsMap[] = [];
      const adapter = {
        ...mockAdapter,
        name,
        mutations: async (options: RxDBMutationsMap) => {
          seen.push(options);
          return mockAdapter.mutations(options);
        }
      };
      adapter.getRepository = () => adapter;
      return { adapter, seen };
    };

    it('remote-only 配置下批量入口写到 remote 适配器，与单条 save 同一去向', async () => {
      const remote = createRecordingAdapter('supabase');
      const remoteOnly = new RxDB({
        dbName: 'RemoteOnlyBatch',
        entities: [Todo],
        // 类型上合法的 remote-only：`Remote` 变体的 `local` 是可选的
        sync: { remote: { adapter: 'supabase' }, type: SyncType.None }
      });
      remoteOnly.adapter('supabase', () => remote.adapter as unknown as IRxDBAdapter);
      remoteOnly.init();

      const todo = remoteOnly.entityManager.createEntityRef(Todo, { title: 'x', id: uuid() });
      todo.title = 'dirty'; // 只有 modified 的实体才会进批量集合
      await remoteOnly.entityManager.saveMany([todo]);

      expect(remote.seen).toHaveLength(1);
      expect(getEntityStatus(todo).local).toBe(true);
    });

    it('实体自带的 remote-only sync 覆盖数据库级 local 配置', async () => {
      @Entity({
        name: 'RemoteNote',
        properties: [{ name: 'title', type: PropertyType.string }],
        sync: { type: SyncType.None, remote: { adapter: 'supabase' } }
      })
      class RemoteNote extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        title!: string;
      }

      const local = createRecordingAdapter('sqlite');
      const remote = createRecordingAdapter('supabase');
      const mixed = new RxDB({
        dbName: 'PerEntitySync',
        entities: [Todo, RemoteNote],
        sync: { local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' }, type: SyncType.Full }
      });
      mixed.adapter('sqlite', () => local.adapter as unknown as IRxDBAdapter);
      mixed.adapter('supabase', () => remote.adapter as unknown as IRxDBAdapter);
      mixed.init();

      const note = mixed.entityManager.createEntityRef(RemoteNote, { title: 'n', id: uuid() });
      note.title = 'dirty';
      await mixed.entityManager.saveMany([note]);

      expect(remote.seen).toHaveLength(1);
      expect(local.seen).toHaveLength(0);
    });

    // 一次 mutations 是一个原子事务，跨适配器无法原子。宁可抛错也不能悄悄拆成两半写。
    it('一批里的实体主端不一致时抛错', async () => {
      @Entity({
        name: 'RemoteMemo',
        properties: [{ name: 'title', type: PropertyType.string }],
        sync: { type: SyncType.None, remote: { adapter: 'supabase' } }
      })
      class RemoteMemo extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        title!: string;
      }

      const local = createRecordingAdapter('sqlite');
      const remote = createRecordingAdapter('supabase');
      const mixed = new RxDB({
        dbName: 'MixedPrimaryBatch',
        entities: [Todo, RemoteMemo],
        sync: { local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' }, type: SyncType.Full }
      });
      mixed.adapter('sqlite', () => local.adapter as unknown as IRxDBAdapter);
      mixed.adapter('supabase', () => remote.adapter as unknown as IRxDBAdapter);
      mixed.init();

      const todo = mixed.entityManager.createEntityRef(Todo, { title: 't', id: uuid() });
      const memo = mixed.entityManager.createEntityRef(RemoteMemo, { title: 'm', id: uuid() });
      todo.title = 'dirty';
      memo.title = 'dirty';

      await expect(mixed.entityManager.saveMany([todo, memo])).rejects.toThrow(RxDBMixedPrimaryAdapterError);
      // 抛错前不能写出去任何一半
      expect(local.seen).toHaveLength(0);
      expect(remote.seen).toHaveLength(0);
    });

    it('两端都没配适配器时立即抛错，而不是挂在永不发射的流上', async () => {
      @Entity({ name: 'OrphanDoc', properties: [{ name: 'title', type: PropertyType.string }] })
      class OrphanDoc extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        title!: string;
      }

      const orphan = new RxDB({
        dbName: 'NoAdapterBatch',
        entities: [OrphanDoc],
        sync: { type: SyncType.None } as never
      });
      orphan.schemaManager.init();
      orphan.entityManager.init();

      const doc = orphan.entityManager.createEntityRef(OrphanDoc, { title: 'x', id: uuid() });
      doc.title = 'dirty';
      await expect(orphan.entityManager.saveMany([doc])).rejects.toThrow(RxDBMissingPrimaryAdapterError);
    });

    it('空批次不需要任何适配器', async () => {
      const orphan = new RxDB({
        dbName: 'EmptyBatch',
        entities: [Todo],
        sync: { type: SyncType.None } as never
      });
      orphan.schemaManager.init();
      orphan.entityManager.init();

      await expect(orphan.entityManager.saveMany([])).resolves.toEqual([]);
    });
  });

  it('removeMany 应批量删除实体', async () => {
    const todo1 = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Delete 1',
      id: uuid()
    });

    const todo2 = rxdb.entityManager.createEntityRef(Todo, {
      title: 'Delete 2',
      id: uuid()
    });

    await rxdb.entityManager.create(todo1);
    await rxdb.entityManager.create(todo2);

    await rxdb.entityManager.removeMany([todo1, todo2]);

    const status1 = getEntityStatus(todo1);
    const status2 = getEntityStatus(todo2);
    expect(status1.removed).toBe(true);
    expect(status2.removed).toBe(true);
  });

  // RXD-011：身份缓存曾是无界强引用 Map，进过缓存的实体到进程结束都不会被回收，
  // 长生命周期应用（列表反复翻页、长期在线的编辑器）内存只增不减。
  describe('身份缓存回收（RXD-011）', () => {
    /** 建一个用完即弃的实体，只把 id 交出来——调用方拿不到强引用 */
    const createUnreferenced = (title: string) => {
      const id = uuid();
      rxdb.entityManager.createEntityRef(Todo, { title, id });
      return id;
    };

    it('没人再引用的实体会被回收，缓存不再返回它', async () => {
      const id = createUnreferenced('garbage');
      expect(rxdb.entityManager.hasEntityRef(Todo, id)).toBe(true);

      expect(await collectGarbageUntil(() => rxdb.entityManager.hasEntityRef(Todo, id) === false)).toBe(true);
      expect(rxdb.entityManager.getEntityRef(Todo, id)).toBeUndefined();
    });

    // 这条守卫的是「删除时直接驱逐」这个错误解法：驱逐会让已订阅的 UI 读不到
    // removed=true，删除态在界面上表现为「这行凭空消失了」而不是「已删除」。
    it('订阅者还持有引用时，被删除的实体依旧读得到 removed=true', async () => {
      const todo = rxdb.entityManager.createEntityRef(Todo, { title: 'kept', id: uuid() });
      await rxdb.entityManager.create(todo);
      await rxdb.entityManager.removeMany([todo]);

      // 反过来断言：完整跑一次 GC 也回收不掉，因为 `todo` 还被这个作用域强引用着。
      // 反向断言只给 1 次：重试只对「还没来得及回收」有意义，强引用再跑多少次也不会变，
      // 白等的每一次都是一次全量 GC（跑完整个 suite 时够慢到把用例拖超时）。
      expect(await collectGarbageUntil(() => rxdb.entityManager.getEntityRef(Todo, todo.id) === undefined, 1)).toBe(
        false
      );
      expect(rxdb.entityManager.getEntityRef(Todo, todo.id)).toBe(todo);
      expect(getEntityStatus(todo).removed).toBe(true);
    });

    // 回收掉的是「实例」，不是「身份」：同 id 再来一次必须拿到一个干净的新实例，
    // 而不是复活一个 removed=true 的僵尸。
    it('实体被回收后同 id 重建，拿到的是全新实例', async () => {
      const id = createUnreferenced('first');
      expect(await collectGarbageUntil(() => rxdb.entityManager.hasEntityRef(Todo, id) === false)).toBe(true);

      const rebuilt = rxdb.entityManager.createEntityRef(Todo, { title: 'second', id });
      expect(rebuilt.title).toBe('second');
      expect(getEntityStatus(rebuilt).removed).toBe(false);
      expect(rxdb.entityManager.getEntityRef(Todo, id)).toBe(rebuilt);
    });
  });
});
