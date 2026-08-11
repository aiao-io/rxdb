import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { RelationEntityObservable } from '../../entity/entity.interface.js';
import { PropertyType, RelationKind, SyncType } from '../../entity/metadata-options.interface.js';
import { createEntityProxy as createProxy } from '../../entity/proxy.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { getEntityMetadata, getEntityStatus } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';

describe('proxy', () => {
  @Entity({
    name: 'ProxyTestEntity',
    properties: [
      { name: 'title', type: PropertyType.string },
      { name: 'count', type: PropertyType.number },
      { name: 'payload', type: PropertyType.binary }
    ]
  })
  class ProxyTestEntity extends EntityBase {
    title!: string;
    count!: number;
    payload!: Uint8Array;
  }

  @Entity({
    name: 'ProxyRelationTarget',
    properties: [{ name: 'label', type: PropertyType.string }]
  })
  class ProxyRelationTarget extends EntityBase {
    label!: string;
  }

  @Entity({
    name: 'ProxyRelationOwner',
    properties: [{ name: 'title', type: PropertyType.string }],
    relations: [
      {
        name: 'target',
        kind: RelationKind.MANY_TO_ONE,
        mappedEntity: 'ProxyRelationTarget',
        mappedProperty: 'owners'
      }
    ]
  })
  class ProxyRelationOwner extends EntityBase {
    title!: string;
    target!: ProxyRelationTarget;
    targetId!: string | null;
    declare target$: RelationEntityObservable<typeof ProxyRelationTarget>;
  }

  const createTestProxy = (entity: ProxyTestEntity): ProxyTestEntity =>
    createProxy<typeof ProxyTestEntity>(entity) as unknown as ProxyTestEntity;

  beforeAll(async () => {
    const rxdb = new RxDB({
      dbName: 'proxy-test',
      entities: [ProxyTestEntity, ProxyRelationOwner, ProxyRelationTarget],
      sync: {
        local: {
          adapter: 'sqlite'
        },
        type: SyncType.None
      }
    });
    rxdb.adapter(
      'sqlite',
      () =>
        ({
          init: vi.fn(),
          create: vi.fn(),
          destroy: vi.fn(),
          internalQuery: vi.fn(),
          getRepository: vi.fn().mockReturnValue({
            find: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn(),
            update: vi.fn(),
            remove: vi.fn()
          })
        }) as unknown as IRxDBAdapter
    );

    rxdb.init();
  });

  describe('createProxy', () => {
    it('应该创建代理对象', () => {
      const entity = new ProxyTestEntity();
      const proxy = createTestProxy(entity);

      expect(proxy).toBeDefined();
      expect(typeof proxy).toBe('object');
    });

    it('应该在属性变更时标记为已修改', async () => {
      const entity = new ProxyTestEntity();
      entity.title = 'initial';
      const status = getEntityStatus(entity);
      status.modified = false;

      const proxy = createTestProxy(entity);
      proxy.title = 'changed';

      expect(status.modified).toBe(true);
    });

    it('应该在相同值时不标记为已修改', async () => {
      const entity = new ProxyTestEntity();
      entity.title = 'same';
      const status = getEntityStatus(entity);
      status.modified = false;

      const proxy = createTestProxy(entity);
      proxy.title = 'same';

      expect(status.modified).toBe(false);
    });

    it('应该忽略 Symbol 属性的变更', async () => {
      const entity = new ProxyTestEntity();
      const status = getEntityStatus(entity);
      status.modified = false;

      const proxy = createTestProxy(entity);
      const sym = Symbol('test');
      Reflect.set(proxy, sym, 'value');

      expect(status.modified).toBe(false);
    });

    it('应该防抖变更检查', async () => {
      const entity = new ProxyTestEntity();
      entity.title = 'initial';
      const status = getEntityStatus(entity);
      const checkChangeSpy = vi.spyOn(status, 'checkChange');

      const proxy = createTestProxy(entity);

      // 快速连续更改
      proxy.title = 'change1';
      proxy.title = 'change2';
      proxy.title = 'change3';

      // 等待防抖完成
      await new Promise(resolve => setTimeout(resolve, 10));

      // 防抖应该减少调用次数（但可能不是严格的1次）
      expect(checkChangeSpy).toHaveBeenCalled();
      expect(checkChangeSpy.mock.calls.length).toBeLessThan(3);
    });

    it('应该正确设置属性值', () => {
      const entity = new ProxyTestEntity();
      const proxy = createTestProxy(entity);

      proxy.title = 'test title';
      proxy.count = 42;

      expect(proxy.title).toBe('test title');
      expect(proxy.count).toBe(42);
    });

    it('应该支持读取属性', () => {
      const entity = new ProxyTestEntity();
      entity.title = 'existing';
      entity.count = 10;

      const proxy = createTestProxy(entity);

      expect(proxy.title).toBe('existing');
      expect(proxy.count).toBe(10);
    });

    it('应该在多次相同值赋值时返回 true', () => {
      const entity = new ProxyTestEntity();
      entity.title = 'value';

      const proxy = createTestProxy(entity);

      // 设置相同值应该返回 true（通过 Proxy handler）
      expect(() => {
        proxy.title = 'value';
        proxy.title = 'value';
      }).not.toThrow();
    });

    it('应该在 binary 原地修改后通过新引用赋值登记变更', () => {
      const entity = new ProxyTestEntity();
      const status = getEntityStatus(entity);
      status.replace({ payload: new Uint8Array([5, 6]) });

      const current = entity.payload;
      current[0] = 7;
      entity.payload = current;

      expect(status.modified).toBe(false);
      expect(status.patch).toEqual({});

      entity.payload = new Uint8Array([7, 6]);

      expect(status.modified).toBe(true);
      expect(status.patch).toEqual({ payload: new Uint8Array([7, 6]) });
    });

    it('应该在 binary 新引用与基线字节相同时保持空 patch', () => {
      const entity = new ProxyTestEntity();
      const status = getEntityStatus(entity);
      status.replace({ payload: new Uint8Array([5, 6]) });

      entity.payload = new Uint8Array([5, 6]);

      expect(status.modified).toBe(true);
      expect(status.patch).toEqual({});
    });
  });

  describe('外键直写同步已缓存的关系 Observable（RXD-012）', () => {
    it('绕过关系 set() 直接写外键属性时，已缓存的关系条目会收到新值同步', () => {
      const relation = getEntityMetadata(ProxyRelationOwner).relationMap.get('target')!;
      const owner = new ProxyRelationOwner();

      const cachedBefore = owner.target$;
      const entry = getEntityStatus(owner).getRelationObservableEntry(relation);
      if (!entry?.syncForeignKeyId) throw new Error('expected a memoized relation entry with syncForeignKeyId');
      const syncSpy = vi.fn(entry.syncForeignKeyId);
      Object.assign(entry, { syncForeignKeyId: syncSpy });

      const newTargetId = '20000000-0000-0000-0000-000000000001';
      owner.targetId = newTargetId;

      expect(syncSpy).toHaveBeenCalledWith(newTargetId);
      expect(owner.target$).toBe(cachedBefore);
    });
  });
});
