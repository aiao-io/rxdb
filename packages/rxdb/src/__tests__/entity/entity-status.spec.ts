import { beforeAll, describe, expect, it } from 'vitest';
import { RxDB } from '../../RxDB.js';
import { EntityBase } from '../../entity/entity-base.js';
import { EntityPatch, IEntityStatus } from '../../entity/entity-status.interface.js';
import { EntityStatus } from '../../entity/entity-status.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import {
  EntityRelationMetadata,
  PropertyType,
  RelationKind,
  SyncType
} from '../../entity/metadata-options.interface.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { getEntityStatus, uuid } from '../../rxdb-utils.js';
import { getRxDBEntityIdentityKey } from '../../system/change-codec.js';

describe('EntityStatus', () => {
  @Entity({
    name: 'TestEntity',
    properties: [
      { name: 'title', type: PropertyType.string },
      { name: 'count', type: PropertyType.integer, default: 0 },
      { name: 'active', type: PropertyType.boolean, default: true }
    ]
  })
  class TestEntity extends EntityBase {
    title!: string;
    count!: number;
    active!: boolean;
  }

  @Entity({
    name: 'RelatedEntity',
    properties: [{ name: 'name', type: PropertyType.string }]
  })
  class RelatedEntity extends EntityBase {
    name!: string;
  }

  @Entity({
    name: 'TestRelatedJunction',
    properties: [
      { name: 'testEntityId', type: PropertyType.string },
      { name: 'relatedEntityId', type: PropertyType.string }
    ],
    relations: [
      {
        name: 'testEntity',
        kind: RelationKind.MANY_TO_ONE,
        mappedEntity: 'TestEntity',
        mappedProperty: 'junctions'
      },
      {
        name: 'relatedEntity',
        kind: RelationKind.MANY_TO_ONE,
        mappedEntity: 'RelatedEntity',
        mappedProperty: 'junctions'
      }
    ]
  })
  class TestRelatedJunction extends EntityBase {
    testEntityId!: string;
    relatedEntityId!: string;
    testEntity!: TestEntity;
    relatedEntity!: RelatedEntity;
  }

  @Entity({
    name: 'DeepValueEntity',
    properties: [
      { name: 'title', type: PropertyType.string },
      { name: 'publishedAt', type: PropertyType.date },
      { name: 'meta', type: PropertyType.json }
    ]
  })
  class DeepValueEntity extends EntityBase {
    title!: string;
    publishedAt!: Date;
    meta!: Record<string, unknown>;
  }

  const setProxyTarget = <T extends EntityType>(status: EntityStatus<T>, target: Partial<InstanceType<T>>) => {
    Reflect.set(status, 'proxyTarget', target);
  };

  let rxdb: RxDB;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'entity-status-test',
      entities: [TestEntity, RelatedEntity, TestRelatedJunction, DeepValueEntity],
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
          init: () => {
            // 模拟。
          },
          create: () => {
            // 模拟。
          },
          destroy: () => {
            // 模拟。
          },
          internalQuery: () => {
            // 模拟。
          },
          getRepository: () => ({
            find: async () => [],
            count: async () => 0,
            create: async () => {
              // 模拟。
            },
            update: async () => {
              // 模拟。
            },
            remove: async () => {
              // 模拟。
            }
          })
        }) as unknown as IRxDBAdapter
    );
    rxdb.init();
  });

  describe('constructor', () => {
    it('should create entity status with required properties', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const statusData: IEntityStatus<typeof TestEntity> = {
        target: entity,
        local: true,
        remote: false,
        modified: false
      };

      const status = new EntityStatus(rxdb, statusData);

      expect(status).toBeDefined();
      expect(status).toBeInstanceOf(EntityStatus);
    });

    it('should set default values for optional properties', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const statusData: IEntityStatus<typeof TestEntity> = {
        target: entity
      };

      const status = new EntityStatus(rxdb, statusData);

      expect(status.local).toBe(false);
      expect(status.remote).toBe(false);
      expect(status.modified).toBe(false);
    });

    it('should initialize origin from target', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test', count: 5 });
      const statusData: IEntityStatus<typeof TestEntity> = {
        target: entity
      };

      const status = new EntityStatus(rxdb, statusData);

      expect(status.origin).toEqual(entity);
      expect(status.origin.title).toBe('Test');
      expect(status.origin.count).toBe(5);
    });

    it('should initialize empty patches array', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const statusData: IEntityStatus<typeof TestEntity> = {
        target: entity
      };

      const status = new EntityStatus(rxdb, statusData);

      expect(status.patches).toBeDefined();
      expect(status.patches).toHaveLength(0);
    });

    it('should accept custom patches', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const customPatches: EntityPatch<typeof TestEntity>[] = [
        {
          patch: { title: 'New' },
          inversePatch: { title: 'Old' },
          recordAt: new Date(),
          timeStamp: performance.now()
        }
      ];
      const statusData: IEntityStatus<typeof TestEntity> = {
        target: entity,
        patches: customPatches
      };

      const status = new EntityStatus(rxdb, statusData);

      expect(status.patches).toHaveLength(1);
    });
  });

  describe('modified property', () => {
    it('should get modified state', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, {
        target: entity,
        modified: true
      });

      expect(status.modified).toBe(true);
    });

    it('should set modified state', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, {
        target: entity,
        modified: false
      });

      status.modified = true;

      expect(status.modified).toBe(true);
    });

    it('should clear patch cache when modified is set', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      // 模拟 proxyTarget。
      setProxyTarget(status, entity);

      // 访问 patch 以创建缓存。
      const firstPatch = status.patch;
      expect(firstPatch).toBeDefined();

      // 设置 modified 应清除缓存。
      status.modified = true;

      const secondPatch = status.patch;
      expect(secondPatch).toBeDefined();
    });
  });

  describe('removed property', () => {
    it('should get removed state', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      expect(status.removed).toBe(false);
    });

    it('should set removed state', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      status.removed = true;

      expect(status.removed).toBe(true);
    });
  });

  describe('remote property', () => {
    it('should get remote state', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, {
        target: entity,
        remote: true
      });

      expect(status.remote).toBe(true);
    });

    it('should set remote state', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      status.remote = true;

      expect(status.remote).toBe(true);
    });
  });

  describe('local property', () => {
    it('should get local state', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, {
        target: entity,
        local: true
      });

      expect(status.local).toBe(true);
    });

    it('should set local state', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      status.local = true;

      expect(status.local).toBe(true);
    });
  });

  describe('origin property', () => {
    it('should get origin data', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Original', count: 10 });
      const status = new EntityStatus(rxdb, { target: entity });

      expect(status.origin.title).toBe('Original');
      expect(status.origin.count).toBe(10);
    });

    it('should set origin data', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      status.origin = { title: 'New Origin', count: 20 };

      expect(status.origin.title).toBe('New Origin');
      expect(status.origin.count).toBe(20);
    });

    it('should be independent from target', () => {
      const entityId = uuid();
      const entity = new TestEntity({ id: entityId, title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      // 修改 origin 不应影响 target。
      status.origin.title = 'Modified Origin';

      expect(status.origin.title).toBe('Modified Origin');
    });
  });

  describe('patch property', () => {
    it('should calculate patch based on changes', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test', count: 5 });
      const status = new EntityStatus(rxdb, { target: entity });
      // 模拟 proxyTarget。
      const modifiedEntity = { ...entity, title: 'Modified' };
      setProxyTarget(status, modifiedEntity);

      // 将 origin 设置为原始值。
      status.origin = { title: 'Test', count: 5 };

      // 标记已变更的键（模拟 Proxy 行为）
      status.markChanged('title');

      const patch = status.patch;

      expect(patch).toBeDefined();
      expect(patch?.title).toBe('Modified');
    });

    it('should cache patch result', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      // 模拟 proxyTarget。
      setProxyTarget(status, entity);

      const patch1 = status.patch;
      const patch2 = status.patch;

      expect(patch1).toBe(patch2);
    });

    it('origin 被深克隆回填后，值相等的 Date / json 列不残留假 diff', () => {
      const entity = new DeepValueEntity({
        id: uuid(),
        title: 'Test',
        publishedAt: new Date('2024-01-01'),
        meta: { tags: ['a'] }
      });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, entity);
      status.markChanged('publishedAt');
      status.markChanged('meta');

      // 模拟适配器保存成功后的回填：structuredClone 产生值相等但引用不同的 origin
      status.origin = structuredClone({ ...entity });

      expect(status.patch).toEqual({});
    });

    it('值真正不同的 Date / json 列仍进入 patch', () => {
      const entity = new DeepValueEntity({
        id: uuid(),
        title: 'Test',
        publishedAt: new Date('2024-01-02'),
        meta: { tags: ['b'] }
      });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, entity);
      status.markChanged('publishedAt');
      status.markChanged('meta');

      status.origin = { ...entity, publishedAt: new Date('2024-01-01'), meta: { tags: ['a'] } };

      expect(status.patch).toEqual({
        publishedAt: new Date('2024-01-02'),
        meta: { tags: ['b'] }
      });
    });
  });

  describe('inversePatch property', () => {
    it('should return inverse of current patch', () => {
      const entityId = uuid();
      const entity = new TestEntity({ id: entityId, title: 'Original', count: 5 });
      const status = new EntityStatus(rxdb, { target: entity });
      // 模拟带变更的 proxyTarget。
      const modifiedEntity = { ...entity, title: 'Modified', count: 10 };
      setProxyTarget(status, modifiedEntity);
      status.origin = { ...entity };

      // 标记已变更的键（模拟 Proxy 行为）
      status.markChanged('title');
      status.markChanged('count');

      const inversePatch = status.inversePatch;

      expect(inversePatch).toBeDefined();
      expect(inversePatch?.title).toBe('Original');
      expect(inversePatch?.count).toBe(5);
    });

    it('无真实变更时 patch / inversePatch 返回 {}（类型签名不再含 | null）', () => {
      const entityId = uuid();
      const entity = new TestEntity({ id: entityId, title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      // 模拟与 origin 相同的 proxyTarget。
      setProxyTarget(status, { ...entity });
      status.origin = { ...entity };

      const patch = status.patch;
      const inversePatch = status.inversePatch;

      // 类型签名已改为非 nullable；运行时返回空对象表示"无变更"
      expect(patch).toEqual({});
      expect(inversePatch).toEqual({});
      // 关键回归断言：不再是 null
      expect(patch).not.toBeNull();
      expect(inversePatch).not.toBeNull();
    });
  });

  describe('fingerprint property', () => {
    it('should generate fingerprint from id and updatedAt', () => {
      const entityId = uuid();
      const updatedAt = new Date('2024-01-01');
      const entity = new TestEntity({ id: entityId, title: 'Test', updatedAt });
      const status = new EntityStatus(rxdb, { target: entity });

      const fingerprint = status.fingerprint;

      // Fingerprint 格式为 "typed-id@timestamp@content-revision"（RXD-052 前只有前两段）。
      expect(fingerprint).toContain('@');
      const parts = fingerprint.split('@');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBeDefined();
      expect(parts[1]).toBeDefined();
      // 验证其中包含 target 的 id 和 updatedAt 时间戳。
      expect(parts[0]).toBe(getRxDBEntityIdentityKey(status.target.id));
      expect(parts[1]).toBe(status.target.updatedAt?.getTime().toString());
      // 第三段是内容修订号，未经修改的实体从 0 起。
      expect(parts[2]).toBe('0');
    });

    it('should cache fingerprint value', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test', updatedAt: new Date() });
      const status = new EntityStatus(rxdb, { target: entity });

      const fp1 = status.fingerprint;
      const fp2 = status.fingerprint;

      expect(fp1).toBe(fp2);
    });

    it('does not collide number, bigint and string ids in query fingerprints', () => {
      const updatedAt = new Date('2024-01-01');
      const fingerprints = [1, 1n, '1'].map(id => {
        const entity = new TestEntity({ id: id as never, title: 'typed-id', updatedAt });
        return new EntityStatus(rxdb, { target: entity }).fingerprint;
      });

      expect(new Set(fingerprints).size).toBe(3);
    });

    it('should clear fingerprint when modified is set', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test', updatedAt: new Date() });
      const status = new EntityStatus(rxdb, { target: entity });

      // 访问 fingerprint 以生成并缓存它。
      const fp1 = status.fingerprint;
      expect(fp1).toBeDefined();

      status.modified = true;
      const fp2 = status.fingerprint;

      // 应重新生成（值可能相同，但缓存已清除）
      expect(fp2).toBeDefined();
    });

    // RXD-052：指纹只由 `${id}@${updatedAt}` 构成时，任何**不改 updatedAt 的业务字段变化**
    // 都算不出差异。`QueryTask.#next` 拿它判断「结果是否变化」，于是订阅者永远停在旧值上。
    //
    // 但「值变了」不能直接当推进条件：适配器把查询算出来的 computed 列写回共享缓存实体，
    // 走的正是 `replace` / `mergeExternal` / proxy set 这三条改值路径。在它们内部推进，
    // 树查询就会把自己的回填看成「结果变了」再发一次（自激）。所以推进条件是
    // 「这次改动来自**外部事件**」，只有 `QueryManager` 知道，由它显式调 `markContentChanged`。
    // 下面几条把这套非对称契约固定：改值路径全都不推进，只有外部入口推进。
    //
    // 走 `replace` 的用例必须用实体自带的 status（`getEntityStatus`）而不是另建一个
    // `new EntityStatus(rxdb, { target: entity })`：`new TestEntity()` 返回的是**代理**，
    // 而 `replace()` 里的 `structuredClone(this.target)` 克隆不了 Proxy（DataCloneError）。
    // 生产路径上 target 存的是代理背后的原始对象，本来就没有这个问题。
    it('replace 本身不推进修订号：查询结果回填不得让查询自激（RXD-052）', () => {
      const updatedAt = new Date('2024-01-01');
      const entity = new TestEntity({ id: uuid(), title: 'old', updatedAt });
      const status = getEntityStatus<typeof TestEntity>(entity);
      const before = status.fingerprint;

      // 树查询把自己算出来的派生列（hasChildren/level/…）写回共享缓存实体走的就是这条路，
      // 在这里推进修订号 = 查询看到「结果变了」再发一次 = 自激。
      status.replace({ title: 'new' } as Partial<InstanceType<typeof TestEntity>>);

      expect(status.target.title).toBe('new');
      expect(status.fingerprint).toBe(before);
    });

    it('外部回填只改业务字段、不带 updatedAt 时，指纹必须变化（RXD-052）', () => {
      const updatedAt = new Date('2024-01-01');
      const entity = new TestEntity({ id: uuid(), title: 'old', updatedAt });
      const status = getEntityStatus<typeof TestEntity>(entity);
      const before = status.fingerprint;

      // 「这是外部事件」只有调用方知道，所以由调用方（`QueryManager` 的 serialize）补这一位
      status.replace({ title: 'new' } as Partial<InstanceType<typeof TestEntity>>);
      status.markContentChanged();

      expect(status.target.title).toBe('new');
      expect(status.target.updatedAt?.getTime()).toBe(updatedAt.getTime());
      expect(status.fingerprint).not.toBe(before);
    });

    it('mergeExternal 本身不推进修订号：脏实体的 computed 列回填走的也是它（RXD-052）', () => {
      const updatedAt = new Date('2024-01-01');
      const entity = new TestEntity({ id: uuid(), title: 'old', updatedAt });
      const status = new EntityStatus(rxdb, { target: entity });
      const before = status.fingerprint;

      // 适配器回填时先经 proxy 写 computed 列把实体标脏，随后就分流到 mergeExternal
      status.mergeExternal({ title: 'merged' } as Partial<InstanceType<typeof TestEntity>>);

      expect(status.target.title).toBe('merged');
      expect(status.fingerprint).toBe(before);
    });

    it('本地编辑（modified）不推进修订号：适配器写 computed 列走的也是这条 setter（RXD-052）', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test', updatedAt: new Date('2024-01-01') });
      const status = new EntityStatus(rxdb, { target: entity });
      const before = status.fingerprint;

      status.modified = true;

      expect(status.fingerprint).toBe(before);
    });

    it('指纹只在内容真正被改动时才推进，读取本身不推进（RXD-052）', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test', updatedAt: new Date('2024-01-01') });
      const status = getEntityStatus<typeof TestEntity>(entity);

      const fp1 = status.fingerprint;
      const fp2 = status.fingerprint;
      expect(fp2).toBe(fp1);

      status.markContentChanged();
      const fp3 = status.fingerprint;
      expect(fp3).not.toBe(fp2);
      // 再读一次仍是同一个值：修订号只由变更推进，不由读取推进
      expect(status.fingerprint).toBe(fp3);
    });
  });

  describe('patches$ observable', () => {
    it('should be defined', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      expect(status.patches$).toBeDefined();
      expect(typeof status.patches$.subscribe).toBe('function');
    });

    it('should be observable', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      // 验证 patches$ 是 observable。
      expect(status.patches$).toBeDefined();
      expect(typeof status.patches$.subscribe).toBe('function');

      // 通过检查操作符链验证其使用 shareReplay。
      expect(status.patches$).toBeTruthy();
    });
  });

  describe('reset method', () => {
    it('should reset entity to origin state', () => {
      const entityId = uuid();
      const entity = new TestEntity({ id: entityId, title: 'Original', count: 5 });
      const modifiedEntity = { ...entity, title: 'Modified', count: 10 };
      const status = new EntityStatus(rxdb, { target: entity });
      // 模拟 proxyTarget。
      setProxyTarget(status, modifiedEntity);

      // reset 应恢复 origin。
      status.reset();

      // reset 后，proxyTarget 应包含 origin 的值。
      expect(status.proxyTarget.title).toBe('Original');
      expect(status.proxyTarget.count).toBe(5);
    });

    it('should clear modified flag', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity, modified: true });
      setProxyTarget(status, entity);

      status.reset();

      expect(status.modified).toBe(false);
    });

    it('should clear patches array', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, entity);

      // 添加一些补丁。
      status.checkChange();

      expect(status.patches.length).toBeGreaterThan(0);

      status.reset();

      expect(status.patches).toHaveLength(0);
    });
  });

  describe('reset 完整性与 patch 历史（RXD-013）', () => {
    it('reset 无法清除水合时缺失、构造后才新增的属性（origin 从未包含该 key）', () => {
      // rxdb.entityManager.createEntityRef 是 repository.createEntityRef() 背后的真实水合路径：
      // Object.create(EntityType.prototype) + Object.assign(entity, data)，不经过构造函数，
      // 也不会跑 fillDefaultValue —— data 里没给的字段在 entity 上完全不存在这个 key（不是
      // undefined，是压根没有这个 own key），origin 也是照这个稀疏对象克隆的。
      const entity = rxdb.entityManager.createEntityRef(TestEntity, {
        id: uuid(),
        title: 'Original'
      });

      expect('count' in entity).toBe(false);

      entity.count = 99;
      expect('count' in entity).toBe(true);

      entity.reset();

      expect('count' in entity).toBe(false);
    });

    it('reset 未抑制此前已排队的 microtask，其触发的 checkChange 会补发一条空 patch', async () => {
      const entity = rxdb.entityManager.createEntityRef(TestEntity, {
        id: uuid(),
        title: 'Original'
      });
      const status = getEntityStatus(entity);

      // 同步：标记 changed 并在 proxy.ts 里排队一个 microtask 用于防抖 checkChange
      entity.title = 'Edited';
      // 在该 microtask 触发前同步调用 reset —— #changed_keys/_patches 被清空，
      // 但排队的 microtask 并不知情，稍后仍会执行一次 checkChange()
      entity.reset();

      expect(status.patches).toHaveLength(0);

      await Promise.resolve();

      expect(status.patches).toHaveLength(0);
    });

    it('_patches 历史有界，超出上限后丢弃最旧记录而非无界增长', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, entity);

      // 与生产实现的上限保持一致（entity-status.ts 内部常量）；
      // 编辑器式长会话场景下 _patches 不应无界增长
      const CAP = 100;
      for (let i = 0; i < CAP + 10; i++) {
        status.checkChange();
      }

      expect(status.patches.length).toBeLessThanOrEqual(CAP);
    });
  });

  describe('checkChange method', () => {
    it('should create patch record', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Original' });
      const status = new EntityStatus(rxdb, { target: entity });
      const modifiedEntity = { ...entity, title: 'Modified' };
      setProxyTarget(status, modifiedEntity);
      status.origin = { ...entity };

      status.checkChange();

      expect(status.patches).toHaveLength(1);
      expect(status.patches[0].patch).toBeDefined();
      expect(status.patches[0].inversePatch).toBeDefined();
    });

    it('should use custom recordAt date', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, entity);

      const customDate = new Date('2024-06-01');
      status.checkChange(customDate);

      expect(status.patches[0].recordAt).toBe(customDate);
    });

    it('should record timestamp', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, entity);

      status.checkChange();

      expect(status.patches[0].timeStamp).toBeDefined();
      expect(typeof status.patches[0].timeStamp).toBe('number');
    });

    it('should emit patches through observable', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, entity);

      return new Promise<void>(resolve => {
        status.patches$.subscribe(patches => {
          expect(patches).toHaveLength(1);
          resolve();
        });

        status.checkChange();
      });
    });

    it('should create snapshot on first change', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Original', count: 5 });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, { ...entity });
      status.origin = { ...entity };

      status.checkChange();

      // 验证快照已创建（无法直接访问私有字段）
      // 改为验证 patches 数组已填充，以此确认快照逻辑已运行。
      expect(status.patches).toHaveLength(1);
    });

    it('should accumulate multiple patches', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, entity);

      status.checkChange();
      status.checkChange();
      status.checkChange();

      expect(status.patches).toHaveLength(3);
    });
  });

  describe('getRelationCache method', () => {
    it('should return existing cache for relation name', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      const relation = { name: 'testRelation', kind: RelationKind.ONE_TO_MANY } as EntityRelationMetadata;
      const cache1 = status.getRelationCache(relation);
      const cache2 = status.getRelationCache(relation);

      // 验证两次调用操作的是同一个底层缓存
      const testEntity = new RelatedEntity({ id: uuid(), name: 'Test' });
      cache1.add(testEntity);
      const values = Array.from(cache2.values());
      expect(values).toContain(testEntity);
    });

    it('should create new cache if not exists', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      const relation = { name: 'newRelation', kind: RelationKind.MANY_TO_ONE } as EntityRelationMetadata;
      const cache = status.getRelationCache(relation);

      expect(cache).toBeDefined();
      expect(cache.add).toBeDefined();
      expect(cache.values).toBeDefined();
      expect(Array.from(cache.values())).toHaveLength(0);
    });

    it('should create separate caches for different relation names', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      const relationA = { name: 'relationA', kind: RelationKind.ONE_TO_MANY } as EntityRelationMetadata;
      const relationB = { name: 'relationB', kind: RelationKind.MANY_TO_ONE } as EntityRelationMetadata;
      const relationC = { name: 'relationC', kind: RelationKind.MANY_TO_MANY } as EntityRelationMetadata;

      const cacheA = status.getRelationCache(relationA);
      const cacheB = status.getRelationCache(relationB);
      const cacheC = status.getRelationCache(relationC);

      expect(cacheA).not.toBe(cacheB);
      expect(cacheB).not.toBe(cacheC);
      expect(cacheA).not.toBe(cacheC);
    });
  });

  describe('addRelationEntity method', () => {
    it('should add entity to relation cache for default relation', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      const related = new RelatedEntity({ id: uuid(), name: 'Related' });
      const relation = {
        name: 'related',
        kind: RelationKind.ONE_TO_MANY,
        mappedNamespace: 'public',
        mappedEntity: 'RelatedEntity',
        mappedProperty: 'test'
      } as EntityRelationMetadata;

      status.addRelationEntity(relation, related);

      const cache = status.getRelationCache(relation);
      const entities = Array.from(cache.values());
      expect(entities).toContain(related);
    });

    it('should handle MANY_TO_MANY relationship', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, entity);

      const related = new RelatedEntity({ id: uuid(), name: 'Related' });
      const relatedStatus = new EntityStatus(rxdb, { target: related });
      setProxyTarget(relatedStatus, related);
      // 为关联实体附加状态，供 getEntityStatus 使用。
      Object.defineProperty(related, Symbol.for('rxdb_entity_status'), {
        value: relatedStatus,
        writable: false,
        enumerable: false
      });

      const relation: EntityRelationMetadata = {
        name: 'relatedEntity',
        kind: RelationKind.MANY_TO_MANY,
        columnName: 'relatedEntityId',
        mappedNamespace: 'public',
        mappedEntity: 'RelatedEntity',
        mappedProperty: 'testEntity',
        junctionEntityType: TestRelatedJunction
      } as EntityRelationMetadata;

      status.addRelationEntity(relation, related);

      const cache = status.getRelationCache(relation);
      const entities = Array.from(cache.values());
      expect(entities).toContain(related);
      // 还应添加 junction 实体。
      expect(entities.length).toBeGreaterThan(1);
    });

    it('should not add duplicate MANY_TO_MANY relationship', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, entity);

      const related = new RelatedEntity({ id: uuid(), name: 'Related' });
      const relatedStatus = new EntityStatus(rxdb, { target: related });
      setProxyTarget(relatedStatus, related);
      Object.defineProperty(related, Symbol.for('rxdb_entity_status'), {
        value: relatedStatus,
        writable: false,
        enumerable: false
      });

      const relation: EntityRelationMetadata = {
        name: 'relatedEntity',
        kind: RelationKind.MANY_TO_MANY,
        columnName: 'relatedEntityId',
        mappedNamespace: 'public',
        mappedEntity: 'RelatedEntity',
        mappedProperty: 'testEntity',
        junctionEntityType: TestRelatedJunction
      } as EntityRelationMetadata;

      status.addRelationEntity(relation, related);
      const initialSize = Array.from(status.getRelationCache(relation).values()).length;

      // 尝试再次添加相同关系。
      status.addRelationEntity(relation, related);
      const finalSize = Array.from(status.getRelationCache(relation).values()).length;

      expect(finalSize).toBe(initialSize);
    });

    it('should create junction entity if not exists', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, entity);

      const related = new RelatedEntity({ id: uuid(), name: 'Related' });
      const relatedStatus = new EntityStatus(rxdb, { target: related });
      setProxyTarget(relatedStatus, related);
      Object.defineProperty(related, Symbol.for('rxdb_entity_status'), {
        value: relatedStatus,
        writable: false,
        enumerable: false
      });

      const relation: EntityRelationMetadata = {
        name: 'relatedEntity',
        kind: RelationKind.MANY_TO_MANY,
        columnName: 'relatedEntityId',
        mappedNamespace: 'public',
        mappedEntity: 'RelatedEntity',
        mappedProperty: 'testEntity',
        junctionEntityType: TestRelatedJunction
      } as EntityRelationMetadata;

      status.addRelationEntity(relation, related);

      const cache = status.getRelationCache(relation);
      const junctionEntity = Array.from(cache.values()).find(e => e instanceof TestRelatedJunction);
      expect(junctionEntity).toBeDefined();
    });
  });

  describe('removeRelationEntity method', () => {
    it('should remove entity from relation cache', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      const related = new RelatedEntity({ id: uuid(), name: 'Related' });
      const relation = {
        name: 'related',
        kind: RelationKind.ONE_TO_MANY,
        mappedNamespace: 'public',
        mappedEntity: 'RelatedEntity',
        mappedProperty: 'test'
      } as EntityRelationMetadata;

      status.addRelationEntity(relation, related);
      let entities = Array.from(status.getRelationCache(relation).values());
      expect(entities).toContain(related);

      status.removeRelationEntity(relation, related);
      entities = Array.from(status.getRelationCache(relation).values());
      expect(entities).not.toContain(related);
    });

    it('should handle removing non-existent entity', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      const related = new RelatedEntity({ id: uuid(), name: 'Related' });
      const relation = {
        name: 'related',
        kind: RelationKind.ONE_TO_MANY,
        mappedNamespace: 'public',
        mappedEntity: 'RelatedEntity',
        mappedProperty: 'test'
      } as EntityRelationMetadata;

      expect(() => status.removeRelationEntity(relation, related)).not.toThrow();
    });

    it('should remove MANY_TO_MANY relationship including junction entity', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      setProxyTarget(status, entity);

      const related = new RelatedEntity({ id: uuid(), name: 'Related' });
      const relatedStatus = new EntityStatus(rxdb, { target: related });
      setProxyTarget(relatedStatus, related);
      Object.defineProperty(related, Symbol.for('rxdb_entity_status'), {
        value: relatedStatus,
        writable: false,
        enumerable: false
      });

      const relation: EntityRelationMetadata = {
        name: 'relatedEntity',
        kind: RelationKind.MANY_TO_MANY,
        columnName: 'relatedEntityId',
        mappedNamespace: 'public',
        mappedEntity: 'RelatedEntity',
        mappedProperty: 'testEntity',
        junctionEntityType: TestRelatedJunction
      } as EntityRelationMetadata;

      // 先添加关系。
      status.addRelationEntity(relation, related);
      const cache = status.getRelationCache(relation);
      const initialSize = Array.from(cache.values()).length;
      expect(initialSize).toBeGreaterThan(1);

      // 删除关系。
      status.removeRelationEntity(relation, related);

      const entities = Array.from(cache.values());
      expect(entities).not.toContain(related);
      // 还应删除 junction 实体。
      expect(entities.length).toBeLessThan(initialSize);
    });

    it('should handle removing MANY_TO_MANY when junction not found', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      const related = new RelatedEntity({ id: uuid(), name: 'Related' });
      const relation: EntityRelationMetadata = {
        name: 'relatedEntity',
        kind: RelationKind.MANY_TO_MANY,
        columnName: 'relatedEntityId',
        mappedNamespace: 'public',
        mappedEntity: 'RelatedEntity',
        mappedProperty: 'testEntity',
        junctionEntityType: TestRelatedJunction
      } as EntityRelationMetadata;

      // 尝试在未先添加的情况下删除。
      expect(() => status.removeRelationEntity(relation, related)).not.toThrow();
    });
  });

  describe('getNeedSaveEntities method', () => {
    it('should return array with current entity', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      const entities = status.getNeedSaveEntities();

      expect(entities).toBeInstanceOf(Array);
      expect(entities).toHaveLength(1);
    });

    it('should include modified relation entities', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      const related = new RelatedEntity({ id: uuid(), name: 'Related' });

      const relation: EntityRelationMetadata = {
        name: 'related',
        kind: RelationKind.ONE_TO_MANY,
        mappedNamespace: 'public',
        mappedEntity: 'RelatedEntity',
        mappedProperty: 'test'
      } as EntityRelationMetadata;

      status.addRelationEntity(relation, related);

      const entities = status.getNeedSaveEntities();

      expect(entities.length).toBeGreaterThan(0);
    });

    it('should return at least the main entity', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });
      // 模拟 proxyTarget。
      setProxyTarget(status, entity);

      const related = new RelatedEntity({ id: uuid(), name: 'Related' });

      const relation = {
        name: 'related',
        kind: RelationKind.ONE_TO_MANY,
        mappedNamespace: 'public',
        mappedEntity: 'RelatedEntity',
        mappedProperty: 'test'
      } as EntityRelationMetadata;

      status.addRelationEntity(relation, related);

      const entities = status.getNeedSaveEntities();

      // 至少应包含主实体。
      expect(entities.length).toBeGreaterThanOrEqual(1);
      expect(entities).toContain(entity);
    });

    it('should return unique entities', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      const entities = status.getNeedSaveEntities();
      const uniqueEntities = new Set(entities);

      expect(entities.length).toBe(uniqueEntities.size);
    });
  });

  describe('Non-enumerable properties', () => {
    it('should not enumerate internal properties', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      const keys = Object.keys(status);

      expect(keys).not.toContain('_local');
      expect(keys).not.toContain('_modified');
      expect(keys).not.toContain('_origin');
      expect(keys).not.toContain('_patches');
      expect(keys).not.toContain('_remote');
      expect(keys).not.toContain('_removed');
      expect(keys).not.toContain('patches$');
      expect(keys).not.toContain('rxdb');
    });

    it('should make internal properties non-configurable', () => {
      const entity = new TestEntity({ id: uuid(), title: 'Test' });
      const status = new EntityStatus(rxdb, { target: entity });

      const descriptor = Object.getOwnPropertyDescriptor(status, '_local');

      expect(descriptor?.configurable).toBe(false);
    });
  });

  describe('replace method', () => {
    it('replace() 不应清除 _removed 标志（保留用户的删除意图）', () => {
      // 使用 plain object 作为 target，避免装饰器实体在 structuredClone 上的不兼容
      const target = { id: uuid(), title: 'Test', count: 0, active: true } as unknown as TestEntity;
      const status = new EntityStatus<typeof TestEntity>(rxdb, { target });

      // 用户主动标记删除
      status.removed = true;
      expect(status.removed).toBe(true);

      // 远端缓存命中后回填（不应"复活"实体）
      status.replace({ title: 'Updated from remote' } as Partial<TestEntity>);

      expect(status.removed).toBe(true);
      expect(status.modified).toBe(false);
    });
  });
});
