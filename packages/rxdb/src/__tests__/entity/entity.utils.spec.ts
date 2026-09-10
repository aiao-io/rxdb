import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RxDB } from '../../RxDB.js';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import {
  fillDefaultValue,
  fillInitValue,
  getNeedSaveEntities,
  isEntityInternalName,
  normalizeUpdateEntity,
  setSafeObjectKey,
  setSafeObjectKeyLazyInitOnce,
  setSafeObjectWritableKey
} from '../../entity/entity.utils.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { getEntityMetadata } from '../../rxdb-utils.js';

describe('entity.utils', () => {
  @Entity({
    name: 'TestEntity',
    properties: [
      { name: 'title', type: PropertyType.string },
      { name: 'count', type: PropertyType.number, default: 0 },
      { name: 'timestamp', type: PropertyType.number, default: () => Date.now() },
      { name: 'readonly', type: PropertyType.string, readonly: true }
    ]
  })
  class TestEntity extends EntityBase {
    title!: string;
    count!: number;
    timestamp!: number;
    readonly!: string;
  }

  beforeAll(async () => {
    // 初始化 RxDB 用于注册实体
    const rxdb = new RxDB({
      dbName: 'entity-utils-test',
      entities: [TestEntity],
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

  describe('isEntityInternalName', () => {
    it('应该识别基类字段为内部字段', () => {
      expect(isEntityInternalName('id')).toBe(true);
      expect(isEntityInternalName('createdAt')).toBe(true);
      expect(isEntityInternalName('updatedAt')).toBe(true);
      expect(isEntityInternalName('createdBy')).toBe(true);
      expect(isEntityInternalName('updatedBy')).toBe(true);
    });

    it('应该识别私有字段为内部字段', () => {
      expect(isEntityInternalName('rev')).toBe(true);
    });

    it('应该识别下划线开头的字段为内部字段', () => {
      expect(isEntityInternalName('_private')).toBe(true);
      expect(isEntityInternalName('_internal')).toBe(true);
      expect(isEntityInternalName('__proto__')).toBe(true);
    });

    it('应该识别普通字段为非内部字段', () => {
      expect(isEntityInternalName('title')).toBe(false);
      expect(isEntityInternalName('name')).toBe(false);
      expect(isEntityInternalName('count')).toBe(false);
      expect(isEntityInternalName('data')).toBe(false);
    });
  });

  describe('setSafeObjectKey', () => {
    it('应该设置不可枚举属性', () => {
      const obj = {};
      setSafeObjectKey(obj, 'test', 'value');

      expect(obj).toHaveProperty('test');
      expect(Object.keys(obj)).not.toContain('test');
      expect(Object.getOwnPropertyDescriptor(obj, 'test')?.enumerable).toBe(false);
    });

    it('应该设置不可写属性', () => {
      const obj = {} as Record<PropertyKey, unknown>;
      setSafeObjectKey(obj, 'test', 'value');

      expect(() => {
        obj.test = 'new value';
      }).toThrow();
    });

    it('应该支持 Symbol 作为 key', () => {
      const obj = {} as Record<PropertyKey, unknown>;
      const sym = Symbol('test');
      setSafeObjectKey(obj, sym, 'value');
      expect(obj[sym]).toBe('value');
    });

    it('应该返回修改后的对象', () => {
      const obj = {};
      const result = setSafeObjectKey(obj, 'test', 'value');

      expect(result).toBe(obj);
    });
  });

  describe('setSafeObjectWritableKey', () => {
    it('应该设置可写属性', () => {
      const obj = {} as Record<PropertyKey, unknown>;
      setSafeObjectWritableKey(obj, 'test', 'value');

      obj.test = 'new value';
      expect(obj.test).toBe('new value');
    });

    it('应该设置不可枚举属性', () => {
      const obj = {};
      setSafeObjectWritableKey(obj, 'test', 'value');

      expect(Object.keys(obj)).not.toContain('test');
      expect(Object.getOwnPropertyDescriptor(obj, 'test')?.enumerable).toBe(false);
    });

    it('应该支持 Symbol 作为 key', () => {
      const obj = {} as Record<PropertyKey, unknown>;
      const sym = Symbol('writable');
      setSafeObjectWritableKey(obj, sym, 'initial');

      obj[sym] = 'modified';
      expect(obj[sym]).toBe('modified');
    });
  });

  describe('setSafeObjectKeyLazyInitOnce', () => {
    it('应该在首次访问时调用初始化函数', () => {
      const obj = {} as Record<PropertyKey, unknown>;
      const init = vi.fn(() => 'lazy value');

      setSafeObjectKeyLazyInitOnce(obj, 'lazy', init);

      expect(init).not.toHaveBeenCalled();
      const value = obj.lazy;
      expect(init).toHaveBeenCalledTimes(1);
      expect(value).toBe('lazy value');
    });

    it('应该只调用一次初始化函数', () => {
      const obj = {} as Record<PropertyKey, unknown>;
      let callCount = 0;
      const init = () => {
        callCount++;
        return 'lazy value';
      };

      setSafeObjectKeyLazyInitOnce(obj, 'lazy', init);

      const val1 = obj.lazy;
      const val2 = obj.lazy;
      const val3 = obj.lazy;

      expect(callCount).toBe(1);
      expect(val1).toBe('lazy value');
      expect(val2).toBe('lazy value');
      expect(val3).toBe('lazy value');
    });

    it('应该缓存初始化结果', () => {
      const obj = {} as Record<PropertyKey, unknown>;
      let counter = 0;
      const init = () => {
        counter++;
        return counter;
      };

      setSafeObjectKeyLazyInitOnce(obj, 'lazy', init);

      const val1 = obj.lazy;
      const val2 = obj.lazy;
      const val3 = obj.lazy;

      // 缓存的是同一个值，不是「每次重算恰好相等」
      expect(counter).toBe(1);
      expect(val1).toBe(1);
      expect(val2).toBe(1);
      expect(val3).toBe(1);
    });

    it('缓存的引用类型每次返回同一个实例', () => {
      const obj = {} as Record<PropertyKey, unknown>;
      setSafeObjectKeyLazyInitOnce(obj, 'lazy', () => ({ items: [] }));

      // 元数据的派生属性（foreignKeyRelations 等）全走这里：若每次访问都重算，
      // 下游按引用做的缓存与比较全部失效，且写入热路径每次都要重建数组与 Map
      expect(obj.lazy).toBe(obj.lazy);
    });

    it('初始化抛错后不缓存失败状态，下次访问重试', () => {
      const obj = {} as Record<PropertyKey, unknown>;
      const init = vi.fn(() => {
        if (init.mock.calls.length === 1) throw new Error('init failed');
        return 'recovered';
      });

      setSafeObjectKeyLazyInitOnce(obj, 'lazy', init);

      expect(() => obj.lazy).toThrow('init failed');
      expect(obj.lazy).toBe('recovered');
      expect(init).toHaveBeenCalledTimes(2);
    });

    it('应该设置不可枚举属性', () => {
      const obj = {} as Record<PropertyKey, unknown>;
      setSafeObjectKeyLazyInitOnce(obj, 'lazy', () => 'value');

      const val = obj.lazy; // 触发初始化
      expect(Object.keys(obj)).not.toContain('lazy');
      expect(val).toBe('value');
    });

    it('应该支持 Symbol 作为 key', () => {
      const obj = {} as Record<PropertyKey, unknown>;
      const sym = Symbol('lazy');
      const init = vi.fn(() => 'symbol value');

      setSafeObjectKeyLazyInitOnce(obj, sym, init);

      expect(obj[sym]).toBe('symbol value');
      expect(init).toHaveBeenCalledTimes(1);
    });
  });

  describe('fillDefaultValue', () => {
    it('应该填充静态默认值', () => {
      const metadata = getEntityMetadata(TestEntity);
      const entity = new TestEntity();

      fillDefaultValue(metadata, entity);

      expect(entity.count).toBe(0);
    });

    it('应该填充函数默认值', () => {
      const metadata = getEntityMetadata(TestEntity);
      const entity = new TestEntity();

      fillDefaultValue(metadata, entity);

      expect(entity.timestamp).toBeTypeOf('number');
      expect(entity.timestamp).toBeGreaterThan(0);
    });

    it('不应该覆盖已设置的值', () => {
      const metadata = getEntityMetadata(TestEntity);
      const entity = new TestEntity();
      entity.count = 10;

      fillDefaultValue(metadata, entity);

      expect(entity.count).toBe(10);
    });
  });

  describe('fillInitValue', () => {
    it('应该填充初始值', () => {
      const metadata = getEntityMetadata(TestEntity);
      const entity = new TestEntity();

      fillInitValue(metadata, entity, { title: 'filled', count: 5 });

      expect(entity.title).toBe('filled');
      expect(entity.count).toBe(5);
    });

    it('构造期应允许设置 readonly 属性（含自定义字段与基类 id）', () => {
      const metadata = getEntityMetadata(TestEntity);
      const entity = new TestEntity();
      const fixedId = '11111111-1111-4111-8111-111111111111';
      const createdAt = new Date('2020-01-01T00:00:00.000Z');

      fillInitValue(metadata, entity, {
        id: fixedId,
        createdAt,
        readonly: 'seeded-readonly',
        title: 'seeded'
      } as Partial<TestEntity>);

      expect(entity.id).toBe(fixedId);
      expect(entity.createdAt).toEqual(createdAt);
      expect(entity.readonly).toBe('seeded-readonly');
      expect(entity.title).toBe('seeded');
    });

    it('new Entity({ id }) 应保留调用方主键（经装饰器 fillInitValue）', () => {
      const fixedId = '22222222-2222-4222-8222-222222222222';
      const entity = new TestEntity({ id: fixedId, title: 'via-ctor' });

      expect(entity.id).toBe(fixedId);
      expect(entity.title).toBe('via-ctor');
    });

    it('应该只设置元数据中定义的属性', () => {
      const metadata = getEntityMetadata(TestEntity);
      const entity = new TestEntity();

      fillInitValue(metadata, entity, { title: 'test', unknownField: 'value' });

      expect(entity.title).toBe('test');
      expect('unknownField' in entity).toBe(false);
    });

    it('应该处理空初始值', () => {
      const metadata = getEntityMetadata(TestEntity);
      const entity = new TestEntity();
      entity.title = 'initial';

      expect(() => fillInitValue(metadata, entity, {})).not.toThrow();
      expect(entity.title).toBe('initial');
    });
  });

  describe('normalizeUpdateEntity', () => {
    it('保留可写字段并过滤 readonly 字段', () => {
      const metadata = getEntityMetadata(TestEntity);

      expect(
        normalizeUpdateEntity(metadata, {
          title: 'updated',
          count: 5,
          id: 'replacement-id',
          createdAt: new Date('2020-01-01T00:00:00.000Z'),
          readonly: 'replacement'
        })
      ).toEqual({ title: 'updated', count: 5 });
    });

    // 列名从关系对象上取，不再按下标去 foreignKeyColumnNames 里配对 ——
    // 那两个平行数组长度一旦不等就会把值写进相邻的列，且完全无声。
    it('使用物理列名并过滤 readonly 外键', () => {
      const metadata = {
        namespace: 'public',
        name: 'Fixture',
        propertyMap: new Map([
          ['displayName', { columnName: 'display_name', readonly: false }],
          ['immutable', { columnName: 'immutable', readonly: true }]
        ]),
        foreignKeyRelationMap: new Map([
          ['ownerId', { columnName: 'owner_id' }],
          ['reviewerId', { columnName: 'reviewer_id', readonly: true }]
        ])
      } as unknown as EntityMetadata;

      expect(
        normalizeUpdateEntity(metadata, {
          displayName: 'updated',
          immutable: 'ignored',
          ownerId: 'owner-1',
          reviewerId: 'reviewer-1'
        })
      ).toEqual({ display_name: 'updated', owner_id: 'owner-1' });
    });

    it('未出现在更新数据里的外键不写入结果', () => {
      const metadata = {
        namespace: 'public',
        name: 'Fixture',
        propertyMap: new Map(),
        foreignKeyRelationMap: new Map([
          ['ownerId', { columnName: 'owner_id' }],
          ['absentId', { columnName: 'absent_id' }]
        ])
      } as unknown as EntityMetadata;

      expect(normalizeUpdateEntity(metadata, { ownerId: 'owner-1' })).toEqual({ owner_id: 'owner-1' });
    });

    // 从前缺 columnName 会退回属性名，把值写进一个通常并不存在的列；建表阶段不报错，
    // 写入阶段才炸，且错误信息与真正的原因（元数据没装好）无关。
    it('外键关系缺少 columnName 时抛错并点名该关系', () => {
      const metadata = {
        namespace: 'public',
        name: 'Fixture',
        propertyMap: new Map(),
        foreignKeyRelationMap: new Map([['ownerId', {}]])
      } as unknown as EntityMetadata;

      expect(() => normalizeUpdateEntity(metadata, { ownerId: 'owner-1' })).toThrow(/ownerId.*columnName/);
    });
  });

  describe('getNeedSaveEntities', () => {
    it('应该返回修改过的实体', () => {
      const metadata = getEntityMetadata(TestEntity);
      const entity1 = new TestEntity();
      const entity2 = new TestEntity();

      fillDefaultValue(metadata, entity1);
      fillDefaultValue(metadata, entity2);
      fillInitValue(metadata, entity1, { title: 'entity1' });
      fillInitValue(metadata, entity2, { title: 'entity2' });

      entity1.title = 'modified';

      const needSave = getNeedSaveEntities([entity1, entity2]);

      // Entity1 应该被识别为修改过的实体
      expect(needSave.length).toBeGreaterThan(0);
    });

    it('应该处理空数组', () => {
      const needSave = getNeedSaveEntities([]);

      expect(needSave).toEqual([]);
    });

    it('应该去重实体', () => {
      const metadata = getEntityMetadata(TestEntity);
      const entity = new TestEntity();

      fillDefaultValue(metadata, entity);
      fillInitValue(metadata, entity, { title: 'entity' });
      entity.title = 'modified';

      const needSave = getNeedSaveEntities([entity, entity, entity]);

      // 应该去重，最多只有一个实体
      expect(needSave.length).toBeLessThanOrEqual(1);
    });
  });
});
