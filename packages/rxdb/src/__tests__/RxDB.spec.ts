import { firstValueFrom } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../entity/entity-base.js';
import { Entity } from '../entity/entity.decorator.js';
import { EntityType, RelationEntitiesObservable } from '../entity/entity.interface.js';
import { PropertyType, RelationKind, SyncType } from '../entity/metadata-options.interface.js';
import { AdapterFactory, IRxDBAdapter } from '../rxdb-adapter.js';
import {
  ENTITY_LOCAL_CREATE_EVENT,
  EntityLocalCreatedEvent,
  TRANSACTION_BEGIN,
  TransactionBeginEvent,
  TransactionCommitEvent,
  TransactionRollbackEvent
} from '../rxdb-events.js';
import { RxDBOptions } from '../rxdb.interface.js';
import { RxDB } from '../RxDB.js';
import { RxDBMigration } from '../system/migration.js';
import { RXDB_DB_NAME_SUFFIX } from '../version.js';

type MockAdapter = IRxDBAdapter & {
  isTableExisted: ReturnType<typeof vi.fn>;
  createTables: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  getRepository: ReturnType<typeof vi.fn>;
};

const REBIND_USER_ID = '00000000-0000-0000-0000-000000000101';
const REBIND_PARENT_ID = '00000000-0000-0000-0000-000000000102';

// 用于测试的模拟适配器。
const createMockAdapter = (): MockAdapter =>
  ({
    name: 'mock-adapter',
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    version: vi.fn().mockResolvedValue('1.0.0'),
    isTableExisted: vi.fn().mockResolvedValue(false),
    createTables: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue({}),
    saveMany: vi.fn().mockResolvedValue([]),
    removeMany: vi.fn().mockResolvedValue([]),
    mutations: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    transaction: vi.fn(),
    getRepository: vi.fn().mockReturnValue({
      find: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn()
    })
  }) as MockAdapter;

const createEntityCreatedEvent = (id: string) =>
  new EntityLocalCreatedEvent([
    {
      type: 'INSERT',
      namespace: 'default',
      entity: 'TestEntity',
      id,
      patch: { id },
      inversePatch: null,
      recordAt: new Date()
    }
  ]);

@Entity({
  name: 'TestUser',
  properties: [
    { name: 'name', type: PropertyType.string },
    { name: 'age', type: PropertyType.integer }
  ]
})
class TestUser extends EntityBase {
  name!: string;
  age!: number;
}

@Entity({
  name: 'BrokenRepositoryEntity',
  repository: 'MissingRepository',
  properties: [{ name: 'name', type: PropertyType.string }]
})
class BrokenRepositoryEntity extends EntityBase {
  name!: string;
}

@Entity({
  name: 'RebindUser',
  properties: [{ name: 'name', type: PropertyType.string }]
})
class RebindUser extends EntityBase {
  name!: string;
}

@Entity({
  name: 'RebindParent',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'children',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'RebindChild',
      mappedProperty: 'parent'
    }
  ]
})
class RebindParent extends EntityBase {
  name!: string;
  declare children$: RelationEntitiesObservable<typeof RebindChild>;
}

@Entity({
  name: 'RebindChild',
  properties: [{ name: 'name', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RebindParent',
      mappedProperty: 'children'
    }
  ]
})
class RebindChild extends EntityBase {
  name!: string;
  parentId!: string;
}

describe('RxDB', () => {
  let rxdbOptions: RxDBOptions;
  let rxdb: RxDB;

  beforeAll(async () => {
    rxdbOptions = {
      dbName: 'test-db',
      entities: [TestUser] as EntityType[],
      sync: {
        local: {
          adapter: 'sqlite'
        },
        type: SyncType.None
      }
    };
    // 创建一个全局 RxDB 实例供所有测试使用
    rxdb = new RxDB(rxdbOptions);
    rxdb.adapter('sqlite', createMockAdapter);
    rxdb.init();
  });

  describe('构造函数', () => {
    it('应该正确初始化 RxDB 实例', () => {
      expect(rxdb).toBeDefined();
      // config 是 options 的副本：dbName 加了库名后缀，entities 另起一份注册表
      expect(rxdb.config).not.toBe(rxdbOptions);
      expect(rxdb.config.dbName).toBe(`${rxdbOptions.dbName}@${RXDB_DB_NAME_SUFFIX}`);
      expect(rxdb.config.sync).toEqual(rxdbOptions.sync);
      expect(rxdb.config.entities).toContain(TestUser);
      expect(rxdb.schemaManager).toBeDefined();
      expect(rxdb.entityManager).toBeDefined();
      expect(rxdb.versionManager).toBeDefined();
    });

    it('应该冻结配置项', () => {
      expect(Object.isFrozen(rxdb.config)).toBe(true);
    });

    it('应该设置上下文', () => {
      const context = { userId: 'user123' };
      // 直接设置上下文而不是创建新实例
      const originalContext = rxdb.context;
      rxdb.context = context;

      // clientId 由 init() 内部管理，替换 context 不应被业务传入的对象抹掉（RXD-005）
      expect(rxdb.context).toEqual({ ...context, clientId: originalContext.clientId });

      // 恢复原始上下文
      rxdb.context = originalContext;
    });

    it('应在 init 阶段拒绝无效 repository 配置', () => {
      const invalidRxDB = new RxDB({
        dbName: 'invalid-repository',
        entities: [BrokenRepositoryEntity] as EntityType[],
        sync: {
          local: {
            adapter: 'sqlite'
          },
          type: SyncType.None
        }
      });
      invalidRxDB.adapter('sqlite', createMockAdapter);

      expect(() => invalidRxDB.init()).toThrow(
        "Repository 'MissingRepository' not found for entity 'BrokenRepositoryEntity'"
      );
    });

    it('init() 失败后修复配置重试，应该真正执行剩余初始化，而不是被首次失败时已置 true 的内部标记挡住悄悄空跑（RXD-002）', () => {
      const localRxdb = new RxDB({
        dbName: 'init-retry-after-failure',
        entities: [BrokenRepositoryEntity] as EntityType[],
        sync: {
          local: {
            adapter: 'sqlite'
          },
          type: SyncType.None
        }
      });
      localRxdb.adapter('sqlite', createMockAdapter);

      expect(() => localRxdb.init()).toThrow(
        "Repository 'MissingRepository' not found for entity 'BrokenRepositoryEntity'"
      );

      // 修复配置：补上首次 init() 时缺失的 repository
      localRxdb.repository('MissingRepository', localRxdb.getRepositoryConfig('Repository')!);

      expect(() => localRxdb.init()).not.toThrow();
      // EntityManager.init() 的 per-entity 处理（挂载 save/remove/reset）只有真正跑完才会生效——
      // 若重试被 #rxdb_initialized 挡住空跑，这里仍是 undefined。
      expect(typeof new BrokenRepositoryEntity().save).toBe('function');
    });

    it('应允许注册同一实体类，但拒绝无上下文的类级构造', () => {
      const createInstance = (dbName: string) => {
        const instance = new RxDB({
          dbName,
          entities: [TestUser] as EntityType[],
          sync: {
            local: {
              adapter: 'sqlite'
            },
            type: SyncType.None
          }
        });
        instance.adapter('sqlite', createMockAdapter);
        return instance;
      };

      const first = createInstance('rebind-1');
      const second = createInstance('rebind-2');

      expect(() => first.init()).not.toThrow();
      expect(() => second.init()).not.toThrow();
      expect(() => new TestUser()).toThrow(/multiple RxDB instances/);
      first.entityManager.destroy();
      second.entityManager.destroy();
    });

    it('同一实体类绑定多个数据库后，已有实例仍路由到原数据库且歧义入口 fail-fast（RXD-046）', async () => {
      const createInstance = (dbName: string) => {
        const adapter = createMockAdapter();
        const repository = {
          find: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(async <T>(entity: T) => entity),
          update: vi.fn(async <T>(entity: T) => entity),
          remove: vi.fn(async <T>(entity: T) => entity)
        };
        adapter.getRepository.mockReturnValue(repository);
        const instance = new RxDB({
          dbName,
          entities: [RebindUser] as EntityType[],
          sync: {
            local: {
              adapter: 'sqlite'
            },
            type: SyncType.None
          }
        });
        instance.adapter('sqlite', () => adapter);
        return { instance, repository };
      };

      const first = createInstance('rebind-routing-1');
      const second = createInstance('rebind-routing-2');
      first.instance.init();
      const entity = first.instance.entityManager.createEntityRef(
        RebindUser,
        {
          id: REBIND_USER_ID,
          name: 'first'
        },
        { modified: true, local: false, remote: false }
      );
      second.instance.init();

      await entity.save();
      const freshEntity = first.instance.entityManager.instantiate(RebindUser, { name: 'fresh first' });
      await freshEntity.save();

      expect(first.repository.create).toHaveBeenNthCalledWith(1, entity);
      expect(first.repository.create).toHaveBeenNthCalledWith(2, freshEntity);
      expect(second.repository.create).not.toHaveBeenCalled();
      expect(() => new RebindUser()).toThrow(/multiple RxDB instances/);
      expect(() => RebindUser.findAll({ where: { combinator: 'and', rules: [] } })).toThrow(/multiple RxDB instances/);
      first.instance.entityManager.destroy();
      second.instance.entityManager.destroy();
    });

    it('同一实体类绑定多个数据库后，已有实体的关系 getter 仍路由到原数据库（RXD-046）', async () => {
      const createInstance = (dbName: string) => {
        const adapter = createMockAdapter();
        const repository = {
          find: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(async <T>(entity: T) => entity),
          update: vi.fn(async <T>(entity: T) => entity),
          remove: vi.fn(async <T>(entity: T) => entity)
        };
        adapter.getRepository.mockReturnValue(repository);
        const instance = new RxDB({
          dbName,
          entities: [RebindParent, RebindChild] as EntityType[],
          sync: {
            local: {
              adapter: 'sqlite'
            },
            type: SyncType.None
          }
        });
        instance.adapter('sqlite', () => adapter);
        return { instance, repository };
      };

      const first = createInstance('rebind-relation-1');
      const second = createInstance('rebind-relation-2');
      first.instance.init();
      const parent = first.instance.entityManager.createEntityRef(RebindParent, {
        id: REBIND_PARENT_ID,
        name: 'first'
      });
      second.instance.init();
      first.repository.find.mockClear();
      second.repository.find.mockClear();

      await expect(firstValueFrom(parent.children$)).resolves.toEqual([]);
      const relationQuery = {
        where: {
          combinator: 'and',
          rules: [{ field: 'parentId', operator: '=', value: REBIND_PARENT_ID }]
        }
      };
      expect(first.repository.find).toHaveBeenCalledWith(relationQuery);
      expect(second.repository.find).not.toHaveBeenCalledWith(relationQuery);

      first.instance.entityManager.destroy();
      second.instance.entityManager.destroy();
    });
  });

  describe('适配器管理', () => {
    it('应该注册适配器', () => {
      const mockFactory: AdapterFactory = vi.fn().mockReturnValue(createMockAdapter());
      rxdb.adapter('test-adapter', mockFactory);

      // 适配器已注册，不会抛出错误
      expect(() => rxdb.adapter('test-adapter-2', mockFactory)).not.toThrow();
    });

    it('应该获取已注册的适配器', async () => {
      const mockAdapterInstance = createMockAdapter();
      const mockFactory: AdapterFactory = vi.fn().mockReturnValue(mockAdapterInstance);
      rxdb.adapter('get-test', mockFactory);

      const adapter = await rxdb.getAdapter('get-test');

      expect(adapter).toBe(mockAdapterInstance);
      expect(mockFactory).toHaveBeenCalledWith(rxdb);
    });

    it('应该缓存适配器实例', async () => {
      const mockAdapterInstance = createMockAdapter();
      const mockFactory: AdapterFactory = vi.fn().mockReturnValue(mockAdapterInstance);
      rxdb.adapter('cache-test', mockFactory);

      const adapter1 = await rxdb.getAdapter('cache-test');
      const adapter2 = await rxdb.getAdapter('cache-test');

      expect(adapter1).toBe(adapter2);
      expect(mockFactory).toHaveBeenCalledTimes(1);
    });

    it('应该在适配器未注册时抛出错误', async () => {
      await expect(rxdb.getAdapter('non-existent')).rejects.toThrow(
        'Adapter "non-existent" not found. Please register it first using rxdb.adapter()'
      );
    });

    it('应该支持异步适配器工厂', async () => {
      const mockAdapterInstance = createMockAdapter();
      const mockFactory: AdapterFactory = vi.fn().mockResolvedValue(mockAdapterInstance);
      rxdb.adapter('async-test', mockFactory);

      const adapter = await rxdb.getAdapter('async-test');

      expect(adapter).toBe(mockAdapterInstance);
    });

    it('异步适配器工厂失败后应该允许重试', async () => {
      const adapter = createMockAdapter();
      const factory = vi
        .fn<AdapterFactory>()
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValue(adapter);
      rxdb.adapter('retry-adapter', factory);

      await expect(rxdb.getAdapter('retry-adapter')).rejects.toThrow('temporary failure');
      await expect(rxdb.getAdapter('retry-adapter')).resolves.toBe(adapter);
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe('连接和断开', () => {
    it('应该连接适配器', async () => {
      const mockAdapterInstance = createMockAdapter();
      const mockFactory: AdapterFactory = vi.fn().mockReturnValue(mockAdapterInstance);
      rxdb.adapter('connect-test', mockFactory);

      await rxdb.connect('connect-test');

      expect(mockAdapterInstance.connect).toHaveBeenCalled();
    });

    it('应该在连接时跳过表创建（已存在数据库）', async () => {
      const mockAdapterInstance = createMockAdapter();
      mockAdapterInstance.isTableExisted = vi.fn().mockResolvedValue(true);
      const mockFactory: AdapterFactory = vi.fn().mockReturnValue(mockAdapterInstance);
      rxdb.adapter('existing-db-test', mockFactory);

      await rxdb.connect('existing-db-test');

      expect(mockAdapterInstance.createTables).not.toHaveBeenCalled();
    });

    it('应该在已存在数据库时补建缺失的实体表', async () => {
      const localRxdb = new RxDB({
        dbName: 'existing-db-missing-entity-table',
        entities: [TestUser] as EntityType[],
        sync: {
          local: {
            adapter: 'sqlite'
          },
          type: SyncType.None
        }
      });
      const mockAdapterInstance = createMockAdapter();
      mockAdapterInstance.isTableExisted = vi.fn(async (EntityType: EntityType) => EntityType === RxDBMigration);
      localRxdb.adapter('sqlite', () => mockAdapterInstance);
      localRxdb.init();

      await localRxdb.connect('sqlite');

      expect(mockAdapterInstance.createTables).toHaveBeenCalledTimes(1);
      const [missingEntities] = mockAdapterInstance.createTables.mock.calls[0] as [EntityType[]];
      expect(missingEntities).toContain(TestUser);
    });

    it('应该断开单个适配器', async () => {
      const mockAdapterInstance = createMockAdapter();
      const mockFactory: AdapterFactory = vi.fn().mockReturnValue(mockAdapterInstance);
      rxdb.adapter('disconnect-test', mockFactory);
      await rxdb.connect('disconnect-test');

      await rxdb.disconnect('disconnect-test');

      expect(mockAdapterInstance.disconnect).toHaveBeenCalled();
    });

    it('应该断开所有适配器', async () => {
      const mockAdapter1 = createMockAdapter();
      const mockAdapter2 = createMockAdapter();
      rxdb.adapter('disconnect-all-1', () => mockAdapter1);
      rxdb.adapter('disconnect-all-2', () => mockAdapter2);
      await rxdb.getAdapter('disconnect-all-1');
      await rxdb.getAdapter('disconnect-all-2');

      await rxdb.disconnectAll();

      expect(mockAdapter1.disconnect).toHaveBeenCalled();
      expect(mockAdapter2.disconnect).toHaveBeenCalled();
    });

    it('应在断开适配器前先销毁插件', async () => {
      const callOrder: string[] = [];
      const disconnectAdapter = createMockAdapter();
      disconnectAdapter.disconnect = vi.fn(async () => {
        callOrder.push('adapter-disconnect');
      });

      const localRxdb = new RxDB({
        dbName: 'disconnect-plugin-order',
        entities: [TestUser] as EntityType[],
        sync: {
          local: {
            adapter: 'sqlite'
          },
          type: SyncType.None
        }
      });

      const orderPlugin = vi.fn(() => ({
        name: 'orderPlugin' as const,
        install: vi.fn(),
        destroy: vi.fn(() => {
          callOrder.push('plugin-destroy');
        })
      }));

      localRxdb.adapter('sqlite', () => disconnectAdapter);
      localRxdb.use(orderPlugin);
      localRxdb.init();
      await localRxdb.connect('sqlite');

      await localRxdb.disconnectAll();

      expect(callOrder).toEqual(['plugin-destroy', 'adapter-disconnect']);
    });

    it('应等待异步插件销毁完成后再断开适配器', async () => {
      const callOrder: string[] = [];
      let resolveDestroy!: () => void;
      const disconnectAdapter = createMockAdapter();
      disconnectAdapter.disconnect = vi.fn(async () => {
        callOrder.push('adapter-disconnect');
      });

      const localRxdb = new RxDB({
        dbName: 'disconnect-plugin-await-order',
        entities: [TestUser] as EntityType[],
        sync: {
          local: {
            adapter: 'sqlite'
          },
          type: SyncType.None
        }
      });

      const orderPlugin = vi.fn(() => ({
        name: 'orderPlugin' as const,
        install: vi.fn(),
        destroy: vi.fn(
          async () =>
            await new Promise<void>(resolve => {
              callOrder.push('plugin-destroy-start');
              resolveDestroy = () => {
                callOrder.push('plugin-destroy-end');
                resolve();
              };
            })
        )
      }));

      localRxdb.adapter('sqlite', () => disconnectAdapter);
      localRxdb.use(orderPlugin);
      localRxdb.init();
      await localRxdb.connect('sqlite');

      const disconnectPromise = localRxdb.disconnectAll();

      await vi.waitFor(() => {
        expect(callOrder).toEqual(['plugin-destroy-start']);
      });
      expect(disconnectAdapter.disconnect).not.toHaveBeenCalled();

      resolveDestroy();
      await disconnectPromise;

      expect(callOrder).toEqual(['plugin-destroy-start', 'plugin-destroy-end', 'adapter-disconnect']);
    });

    it('disconnect 后再次 getAdapter 应工厂重建（而不是返回已死实例）', async () => {
      const firstInstance = createMockAdapter();
      const secondInstance = createMockAdapter();
      let callCount = 0;
      const factory: AdapterFactory = vi.fn(() => {
        callCount += 1;
        return callCount === 1 ? firstInstance : secondInstance;
      });

      rxdb.adapter('reconnect-test', factory);
      const before = await rxdb.getAdapter('reconnect-test');
      expect(before).toBe(firstInstance);

      await rxdb.disconnect('reconnect-test');
      const after = await rxdb.getAdapter('reconnect-test');

      expect(after).toBe(secondInstance);
      expect(after).not.toBe(firstInstance);
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('disconnect 时 adapter.disconnect() 抛错，不应残留死实例——重试应工厂重建而不是复用失败的旧实例（RXD-003）', async () => {
      const firstInstance = createMockAdapter();
      firstInstance.disconnect = vi.fn().mockRejectedValueOnce(new Error('disconnect failed'));
      const secondInstance = createMockAdapter();
      let callCount = 0;
      const factory: AdapterFactory = vi.fn(() => {
        callCount += 1;
        return callCount === 1 ? firstInstance : secondInstance;
      });

      const localRxdb = new RxDB({
        dbName: 'disconnect-reject-reconnect',
        entities: [TestUser] as EntityType[],
        sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
      });
      localRxdb.adapter('sqlite', factory);
      localRxdb.init();
      await localRxdb.connect('sqlite');

      await expect(localRxdb.disconnect('sqlite')).rejects.toThrow('disconnect failed');

      const after = await localRxdb.getAdapter('sqlite');
      expect(after).toBe(secondInstance);
      expect(after).not.toBe(firstInstance);
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('disconnectAll 后再次 getAdapter 应工厂重建（清空 adapter 缓存）', async () => {
      const firstInstance = createMockAdapter();
      const secondInstance = createMockAdapter();
      let callCount = 0;
      const factory: AdapterFactory = vi.fn(() => {
        callCount += 1;
        return callCount === 1 ? firstInstance : secondInstance;
      });

      const localRxdb = new RxDB({
        dbName: 'disconnect-all-reconnect',
        entities: [TestUser] as EntityType[],
        sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
      });
      localRxdb.adapter('sqlite', factory);
      localRxdb.init();
      await localRxdb.connect('sqlite');

      await localRxdb.disconnectAll();

      const after = await localRxdb.getAdapter('sqlite');
      expect(after).toBe(secondInstance);
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });

  describe('实例字段', () => {
    it('不应在 RxDB 实例上意外暴露 options 字段', () => {
      // defineProperty 的 key 列表与实际类成员对齐，options 不存在；
      // 不应通过 defineProperty 静默创建 undefined 字段。
      expect(Object.prototype.hasOwnProperty.call(rxdb, 'options')).toBe(false);
    });
  });

  describe('事件系统', () => {
    it('应该注册和触发事件监听器', () => {
      const listener = vi.fn();
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);

      const event = createEntityCreatedEvent('1');
      rxdb.dispatchEvent(event);

      expect(listener).toHaveBeenCalled();
      // 清理
      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
    });

    it('应该移除事件监听器', () => {
      const listener = vi.fn();
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);

      const event = createEntityCreatedEvent('1');
      rxdb.dispatchEvent(event);

      expect(listener).not.toHaveBeenCalled();
    });

    it('应该支持多个监听器', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener1);
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener2);

      const event = createEntityCreatedEvent('1');
      rxdb.dispatchEvent(event);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      // 清理
      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener1);
      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener2);
    });

    it('事务事件监听器抛错后仍应继续派发并重抛首个异常', () => {
      const firstError = new Error('first transaction listener failure');
      const secondError = new Error('second transaction listener failure');
      const firstListener = vi.fn(() => {
        throw firstError;
      });
      const secondListener = vi.fn(() => {
        throw secondError;
      });
      rxdb.addEventListener(TRANSACTION_BEGIN, firstListener);
      rxdb.addEventListener(TRANSACTION_BEGIN, secondListener);

      let dispatchError: unknown;
      try {
        rxdb.dispatchEvent(new TransactionBeginEvent());
      } catch (error) {
        dispatchError = error;
      }

      rxdb.removeEventListener(TRANSACTION_BEGIN, firstListener);
      rxdb.removeEventListener(TRANSACTION_BEGIN, secondListener);
      rxdb.dispatchEvent(new TransactionRollbackEvent());

      expect(dispatchError).toBe(firstError);
      expect(firstListener).toHaveBeenCalledTimes(1);
      expect(secondListener).toHaveBeenCalledTimes(1);
    });

    /**
     * RXD-004：#listener() 返回内部活 Set，dispatchEvent 若直接 .forEach 遍历它，
     * 监听器在回调中新增的同类型监听器会被同一次遍历捕获到（Set.forEach 访问遍历
     * 期间新增的条目），导致新监听器错误地收到本次派发的事件。应在遍历前快照。
     */
    it('派发过程中新增的监听器不应该收到本次派发的事件', () => {
      const laterListener = vi.fn();
      const firstListener = vi.fn(() => {
        rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, laterListener);
      });
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, firstListener);

      rxdb.dispatchEvent(createEntityCreatedEvent('snapshot-1'));
      expect(laterListener).not.toHaveBeenCalled();

      // 注册本身应该成功保留，下一次派发要收到
      rxdb.dispatchEvent(createEntityCreatedEvent('snapshot-2'));
      expect(laterListener).toHaveBeenCalledTimes(1);

      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, firstListener);
      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, laterListener);
    });

    /**
     * RXD-004：on_commit 排空 #need_dispatch_events 时用 for...of 直接调用 dispatchEvent，
     * 某个队列事件的监听器抛错会中止循环——它之后的队列事件永久丢失（队列在循环前已清空，
     * 无法重放）。批量排空必须为每个事件独立隔离错误，全部派发完再重抛首个异常。
     */
    it('事务提交排空时某个事件的监听器抛错，不应丢弃队列中其余事件', () => {
      const seenIds: string[] = [];
      const drainError = new Error('drain failure');
      const listener = vi.fn((event: EntityLocalCreatedEvent) => {
        const id = event.entities[0].id;
        seenIds.push(id);
        if (id === 'first') throw drainError;
      });
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);

      rxdb.dispatchEvent(new TransactionBeginEvent());
      rxdb.dispatchEvent(createEntityCreatedEvent('first'));
      rxdb.dispatchEvent(createEntityCreatedEvent('second'));

      let commitError: unknown;
      try {
        rxdb.dispatchEvent(new TransactionCommitEvent());
      } catch (error) {
        commitError = error;
      }

      expect(commitError).toBe(drainError);
      expect(seenIds).toEqual(['first', 'second']);

      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
    });

    it('普通事件监听器抛错时应该保持 fail-fast', () => {
      const failure = new Error('ordinary listener failure');
      const firstListener = vi.fn(() => {
        throw failure;
      });
      const secondListener = vi.fn();
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, firstListener);
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, secondListener);

      let dispatchError: unknown;
      try {
        rxdb.dispatchEvent(createEntityCreatedEvent('fail-fast'));
      } catch (error) {
        dispatchError = error;
      }

      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, firstListener);
      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, secondListener);

      expect(dispatchError).toBe(failure);
      expect(firstListener).toHaveBeenCalledTimes(1);
      expect(secondListener).not.toHaveBeenCalled();
    });

    it('应该在事务期间暂存实体事件', () => {
      const listener = vi.fn();
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);

      rxdb.dispatchEvent(new TransactionBeginEvent());
      const event = createEntityCreatedEvent('1');
      rxdb.dispatchEvent(event);

      expect(listener).not.toHaveBeenCalled();
      // 清理
      rxdb.dispatchEvent(new TransactionRollbackEvent());
      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
    });

    it('应该在事务提交后触发暂存的事件', () => {
      const listener = vi.fn();
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);

      rxdb.dispatchEvent(new TransactionBeginEvent());
      const event = createEntityCreatedEvent('1');
      rxdb.dispatchEvent(event);
      rxdb.dispatchEvent(new TransactionCommitEvent());

      expect(listener).toHaveBeenCalled();
      // 清理
      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
    });

    it('应该在事务回滚后清空暂存的事件', () => {
      const listener = vi.fn();
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);

      rxdb.dispatchEvent(new TransactionBeginEvent());
      rxdb.dispatchEvent(createEntityCreatedEvent('rollback-1'));
      rxdb.dispatchEvent(new TransactionRollbackEvent());

      expect(listener).not.toHaveBeenCalled();
      // 清理
      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
    });

    /**
     * 回滚只该丢弃**本 tab 本次事务**产生的事件。队列里还可能躺着他 tab 的变更 ——
     * 那些是别处**已经成功提交**的写入，本地回滚跟它们没有因果关系。
     * 一并丢掉会让本 tab 的 UI 与其他 tab 永久不一致，直到下次全量刷新。
     */
    it('事务回滚不得丢弃队列中他 tab 已提交的变更事件', () => {
      const listener = vi.fn();
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);

      const crossTabEvent = createEntityCreatedEvent('from-other-tab');
      crossTabEvent.entities[0].origin = 'cross-tab';

      rxdb.dispatchEvent(new TransactionBeginEvent());
      rxdb.dispatchEvent(createEntityCreatedEvent('local-1'));
      rxdb.dispatchEvent(crossTabEvent);
      rxdb.dispatchEvent(new TransactionRollbackEvent());

      // 本地那条随回滚丢弃；他 tab 那条必须照常派发
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].entities[0].id).toBe('from-other-tab');

      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
    });

    it('应该立即触发事务事件', () => {
      const listener = vi.fn();
      rxdb.addEventListener(TRANSACTION_BEGIN, listener);

      rxdb.dispatchEvent(new TransactionBeginEvent());
      rxdb.dispatchEvent(new TransactionBeginEvent());

      expect(listener).toHaveBeenCalledTimes(2);
      rxdb.dispatchEvent(new TransactionRollbackEvent());
      // 清理
      rxdb.removeEventListener(TRANSACTION_BEGIN, listener);
    });

    it('应仅在最外层事务提交后触发暂存事件', () => {
      const listener = vi.fn();
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);

      rxdb.dispatchEvent(new TransactionBeginEvent());
      rxdb.dispatchEvent(new TransactionBeginEvent());
      rxdb.dispatchEvent(createEntityCreatedEvent('nested-1'));

      rxdb.dispatchEvent(new TransactionCommitEvent());
      expect(listener).not.toHaveBeenCalled();

      rxdb.dispatchEvent(new TransactionCommitEvent());
      expect(listener).toHaveBeenCalledTimes(1);

      rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
    });

    /**
     * RXD-062：事务深度与挂起队列此前是全实例各一份，两个适配器并发 BEGIN 会被当成嵌套。
     * 带上事务身份后，只有**同一身份**的再次 BEGIN 才算 savepoint 嵌套，不同身份各自成队。
     */
    describe('并发独立事务（RXD-062）', () => {
      const createdIds = (listener: ReturnType<typeof vi.fn>): string[] =>
        listener.mock.calls.flatMap(([event]) => event.entities.map((entity: { id: string }) => entity.id));

      it('回滚 A 不得清空并发事务 B 的挂起事件', () => {
        const listener = vi.fn();
        rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);

        rxdb.dispatchEvent(new TransactionBeginEvent('tx-a'));
        rxdb.dispatchEvent(createEntityCreatedEvent('a-1'));
        rxdb.dispatchEvent(new TransactionBeginEvent('tx-b'));
        rxdb.dispatchEvent(createEntityCreatedEvent('b-1'));

        rxdb.dispatchEvent(new TransactionRollbackEvent('tx-a'));
        // A 回滚只丢 A 自己的；B 还没提交，它的事件仍该挂着
        expect(listener).not.toHaveBeenCalled();

        rxdb.dispatchEvent(new TransactionCommitEvent('tx-b'));
        expect(createdIds(listener)).toEqual(['b-1']);

        rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
      });

      it('提交 A 只排空 A 的队列，不提前放行 B 的事件', () => {
        const listener = vi.fn();
        rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);

        rxdb.dispatchEvent(new TransactionBeginEvent('tx-a'));
        rxdb.dispatchEvent(createEntityCreatedEvent('a-1'));
        rxdb.dispatchEvent(new TransactionBeginEvent('tx-b'));
        rxdb.dispatchEvent(createEntityCreatedEvent('b-1'));

        rxdb.dispatchEvent(new TransactionCommitEvent('tx-a'));
        expect(createdIds(listener)).toEqual(['a-1']);

        rxdb.dispatchEvent(new TransactionCommitEvent('tx-b'));
        expect(createdIds(listener)).toEqual(['a-1', 'b-1']);

        rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
      });

      it('同一事务身份的再次 BEGIN 仍按 savepoint 计深度', () => {
        const listener = vi.fn();
        rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);

        rxdb.dispatchEvent(new TransactionBeginEvent('tx-a'));
        rxdb.dispatchEvent(new TransactionBeginEvent('tx-a'));
        rxdb.dispatchEvent(createEntityCreatedEvent('nested-1'));

        rxdb.dispatchEvent(new TransactionCommitEvent('tx-a'));
        expect(listener).not.toHaveBeenCalled();

        rxdb.dispatchEvent(new TransactionCommitEvent('tx-a'));
        expect(createdIds(listener)).toEqual(['nested-1']);

        rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
      });
    });
  });

  describe('上下文管理', () => {
    it('应该获取上下文', () => {
      expect(rxdb.context).toBeDefined();
    });

    it('应该设置上下文', () => {
      const newContext = { userId: 'user456' };
      const clientIdBeforeReplace = rxdb.context.clientId;

      rxdb.context = newContext;

      // clientId 由 init() 内部管理，替换 context 不应被业务传入的对象抹掉（RXD-005）
      expect(rxdb.context).toEqual({ ...newContext, clientId: clientIdBeforeReplace });
    });

    it('替换 context 不应该抹掉 init 生成的 clientId（RXD-005）', () => {
      const clientIdBeforeReplace = rxdb.context.clientId;
      expect(clientIdBeforeReplace).toBeTruthy();

      rxdb.context = { userId: 'user789' };

      expect(rxdb.context.clientId).toBe(clientIdBeforeReplace);
      expect(rxdb.context.userId).toBe('user789');
    });
  });
});
