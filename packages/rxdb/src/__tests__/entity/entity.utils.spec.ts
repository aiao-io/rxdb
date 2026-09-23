import { beforeAll, describe, expect, it, vi } from 'vitest';
import { RxDB } from '../../RxDB.js';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import {
  fillDefaultValue,
  fillInitValue,
  getNeedSaveEntities,
  isEntityInternalName,
  normalizeCreateEntity,
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

  /**
   * 只为 `'CURRENT_TIMESTAMP'` 哨兵而立的实体。
   *
   * 不往 {@link TestEntity} 上加一列，是因为本文件里另有十几处断言按它现有的列集写死；
   * 为一条与它们无关的规则改动共用夹具，红起来的会是别人的用例。
   */
  @Entity({
    name: 'TimestampSentinelEntity',
    properties: [
      { name: 'title', type: PropertyType.string },
      { name: 'capturedAt', type: PropertyType.date, default: 'CURRENT_TIMESTAMP', readonly: true },
      { name: 'startAt', type: PropertyType.date, default: () => new Date(0) }
    ]
  })
  class TimestampSentinelEntity extends EntityBase {
    title!: string;
    // 列名特意不叫 createdAt：那个名字在 EntityBase 上已有声明，重复声明会撞 TS2612/TS4114，
    // 而哨兵这条规则与它是不是审计字段无关。
    capturedAt!: Date;
    startAt!: Date;
  }

  beforeAll(async () => {
    // 初始化 RxDB 用于注册实体
    const rxdb = new RxDB({
      dbName: 'entity-utils-test',
      entities: [TestEntity, TimestampSentinelEntity],
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

    it("'CURRENT_TIMESTAMP' 是数据库端哨兵，不得写进实例", () => {
      // 它不是一个 JS 值，是建表语句里的一段表达式：PGlite 建表器把它译成 `DEFAULT now()`，
      // SQLite 建表器译成 strftime。把这个字符串填进 date 属性，等于让一个 Date 列在内存里
      // 装着字符串 'CURRENT_TIMESTAMP'，然后原样送进 INSERT：
      //   - PGlite 直接报 22007 invalid input syntax for type timestamp with time zone，
      //     `RxDB.connect()` 在建表阶段就炸，整个后端不可用；
      //   - SQLite 是动态类型，照单收下这段文本，读回来 `new Date('CURRENT_TIMESTAMP')`
      //     是 Invalid Date → null，一声不响地丢掉时间戳。
      // 后者才是更坏的一种，所以这条规则必须钉在这一层，而不是让六个适配器各自去认哨兵。
      const metadata = getEntityMetadata(TimestampSentinelEntity);
      const entity = new TimestampSentinelEntity();

      fillDefaultValue(metadata, entity);

      // 断言的是**值**为 `undefined`，不是键不存在：`useDefineForClassFields`（target es2025 下默认开启）
      // 把 `capturedAt!: Date` 这行声明本身装成一个值为 `undefined` 的自有属性，键必然在。
      // 适配器侧认的也正是这个值——PGlite 单条 insert 把 `undefined` 的列整个滤掉、批量 insert
      // 写字面量 `DEFAULT`，两条路都落到建表时那句 `DEFAULT now()` 上。
      expect(entity.capturedAt).toBeUndefined();
      expect(Object.values(entity)).not.toContain('CURRENT_TIMESTAMP');
    });

    it('哨兵被跳过时，同一实体上的其它默认值照常填充', () => {
      // 防「一刀切掉整个 defaultValueProperties 循环」式的修法。
      const metadata = getEntityMetadata(TimestampSentinelEntity);
      const entity = new TimestampSentinelEntity();

      fillDefaultValue(metadata, entity);

      expect(entity.startAt).toEqual(new Date(0));
    });

    // 时钟每次读都往前走 1ms：两个默认值各自 `new Date()` 时，createdAt 与 updatedAt
    // 必然差 1ms —— 真实时钟下这只是偶发（跨毫秒边界才发）的 flake。
    it('同一次填充里的时间戳共享同一个时刻，不随时钟前进而错开', () => {
      const RealDate = Date;
      let tick = 0;
      class TickingDate extends RealDate {
        // `ConstructorParameters<typeof Date>` 对重载构造器只解析出 1 元组，
        // 联合 `[]` 才能让「无参调用」这个运行时必然存在的分支在类型上可判。
        constructor(...args: [] | ConstructorParameters<typeof Date>) {
          if (args.length === 0) super(RealDate.UTC(2026, 0, 1) + tick++);
          else super(...args);
        }
      }
      vi.stubGlobal('Date', TickingDate);
      try {
        const metadata = getEntityMetadata(TestEntity);
        const entity = new TestEntity();
        // 构造期已经填过一轮，这里手工验证填充函数本身。
        const bare = Object.create(Object.getPrototypeOf(entity) as object) as TestEntity;
        fillDefaultValue(metadata, bare);

        expect(bare.createdAt).toBeInstanceOf(RealDate);
        expect(bare.createdAt.getTime()).toBe(bare.updatedAt.getTime());
        // 两个字段各自持有实例，不共享引用。
        expect(bare.createdAt).not.toBe(bare.updatedAt);
      } finally {
        vi.unstubAllGlobals();
      }
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

  // INSERT 侧与 UPDATE 侧是同一个缺陷形态的两面：两个适配器各带一份按下标配对
  // `foreignKeyNames` / `foreignKeyColumnNames` 的实现，长度一旦不等就把 A 的值写进 B 的列，
  // 且完全无声。UPDATE 侧已经改成走 keyed 的 foreignKeyRelationMap，这里把 INSERT 侧也收进来。
  describe('normalizeCreateEntity', () => {
    it('按物理列名输出，且 readonly 字段照常写入', () => {
      const metadata = {
        namespace: 'public',
        name: 'Fixture',
        propertyMap: new Map([
          ['displayName', { columnName: 'display_name', readonly: false }],
          ['createdAt', { columnName: 'created_at', readonly: true }]
        ]),
        foreignKeyRelationMap: new Map()
      } as unknown as EntityMetadata;

      // 与 UPDATE 侧相反：INSERT 必须写 readonly 列。主键、createdAt 都是 readonly，
      // 照 UPDATE 的口径过滤会让每一行都缺主键。
      expect(normalizeCreateEntity(metadata, { displayName: 'n', createdAt: '2020-01-01' })).toEqual({
        display_name: 'n',
        created_at: '2020-01-01'
      });
    });

    it('按「值不为 undefined」判定，不按 key in entity', () => {
      const metadata = {
        namespace: 'public',
        name: 'Fixture',
        propertyMap: new Map([
          ['displayName', { columnName: 'display_name' }],
          ['updatedAt', { columnName: 'updated_at' }],
          ['cleared', { columnName: 'cleared' }]
        ]),
        foreignKeyRelationMap: new Map()
      } as unknown as EntityMetadata;

      // `useDefineForClassFields` 下 `updatedAt!: Date` 这行声明本身就在实例上装出一个值为
      // undefined 的自有属性，键恒在；按键判定会把它写进 INSERT，建表时的 DEFAULT 于是永不生效。
      // 显式 null 照常写：「没给值」与「就是要清空」是两件事。
      expect(normalizeCreateEntity(metadata, { displayName: 'n', updatedAt: undefined, cleared: null })).toEqual({
        display_name: 'n',
        cleared: null
      });
    });

    it('外键列名从关系上取，不按下标配对平行数组', () => {
      const metadata = {
        namespace: 'public',
        name: 'Fixture',
        propertyMap: new Map(),
        // 两个平行数组在这里被故意写反：按下标配对的实现会把 owner 的值写进 reviewer 的列。
        foreignKeyNames: ['ownerId', 'reviewerId'],
        foreignKeyColumnNames: ['reviewer_id', 'owner_id'],
        foreignKeyRelationMap: new Map([
          ['ownerId', { columnName: 'owner_id' }],
          ['reviewerId', { columnName: 'reviewer_id' }]
        ])
      } as unknown as EntityMetadata;

      expect(normalizeCreateEntity(metadata, { ownerId: 'owner-1', reviewerId: 'reviewer-1' })).toEqual({
        owner_id: 'owner-1',
        reviewer_id: 'reviewer-1'
      });
    });

    it('未赋值的外键不写入结果', () => {
      const metadata = {
        namespace: 'public',
        name: 'Fixture',
        propertyMap: new Map(),
        foreignKeyRelationMap: new Map([
          ['ownerId', { columnName: 'owner_id' }],
          ['absentId', { columnName: 'absent_id' }]
        ])
      } as unknown as EntityMetadata;

      expect(normalizeCreateEntity(metadata, { ownerId: 'owner-1' })).toEqual({ owner_id: 'owner-1' });
    });

    it('外键关系缺少 columnName 时抛错并点名该关系', () => {
      const metadata = {
        namespace: 'public',
        name: 'Fixture',
        propertyMap: new Map(),
        foreignKeyRelationMap: new Map([['brokenId', {}]])
      } as unknown as EntityMetadata;

      expect(() => normalizeCreateEntity(metadata, { brokenId: 'x' })).toThrow(/brokenId/);
    });
  });
});
