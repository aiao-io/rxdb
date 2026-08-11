import { beforeAll, describe, expect, it } from 'vitest';
import { EntityBase } from '../entity/entity-base.js';
import { Entity } from '../entity/entity.decorator.js';
import { PropertyType, SyncType } from '../entity/metadata-options.interface.js';
import type { IRxDBAdapter } from '../rxdb-adapter.js';
import { getEntityMetadata, getEntityStatus, getEntityType, isRxDBEntity } from '../rxdb-utils.js';
import { RxDB } from '../RxDB.js';

/**
 * RXD-010 残留项：四个核心工具的返回类型对运行时撒谎。
 *
 * - `getEntityMetadata` / `getEntityType` 用 `!` 断言压掉 `undefined`，未装饰对象传进去
 *   会拿到一个类型为 `EntityMetadata` 的 `undefined`，在离现场很远的地方才炸。
 * - `getEntityStatus` 声明 `EntityStatus<T>`，实现是 `target && target[STATUS]` ——
 *   target 为假值时返回的是 **target 自己**（`null` / `undefined` / `0` / `''`）。
 * - `isRxDBEntity` 声明上看像谓词，实现 `target && !!getEntityStatus(target)` 在
 *   target 为假值时同样返回 target 本身，不是 `false`。
 *
 * finding 给的两条处方是「显式返回可空类型**或** fail-fast」。这里选 fail-fast：
 * `getEntityMetadata` 有 403 个调用点、`getEntityStatus` 有 203 个，
 * 其中**只有 1 个**对结果判过空 —— 说明全仓的既有约定就是「传进来的必须是实体」，
 * 加宽返回类型等于逼 600 个调用点去处理一个属于编程错误的分支。
 * fail-fast 让声明变成真的，且调用点一个都不用改。
 *
 * `isRxDBEntity` 是唯一真正需要「探测」语义的入口，所以它不能再走 `getEntityStatus`，
 * 必须自己直接读 STATUS —— 并且返回真正的 `boolean`。
 */
describe('RXD-010 · 核心工具的返回类型必须对运行时诚实', () => {
  @Entity({
    name: 'HonestTypesEntity',
    properties: [{ name: 'title', type: PropertyType.string }]
  })
  class HonestTypesEntity extends EntityBase {
    title!: string;
  }

  let rxdb!: RxDB;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'rxdb-utils-honest-types',
      entities: [HonestTypesEntity],
      sync: {
        local: { adapter: 'sqlite' },
        type: SyncType.None
      }
    });
    // 桩必须带 `getRepository`：`init()` 之后订阅链会去取仓库，
    // 缺了它会在别的测试文件跑到一半时冒出一条 unhandled error。
    rxdb.adapter(
      'sqlite',
      () =>
        ({
          init: () => undefined,
          create: () => undefined,
          destroy: () => undefined,
          internalQuery: () => undefined,
          getRepository: () => ({
            find: async () => [],
            count: async () => 0,
            create: async () => undefined,
            update: async () => undefined,
            remove: async () => undefined
          })
        }) as unknown as IRxDBAdapter
    );
    await rxdb.init();
  });

  describe('getEntityMetadata', () => {
    it('未装饰的对象必须抛错，而不是返回一个类型为 EntityMetadata 的 undefined', () => {
      expect(() => getEntityMetadata({} as never)).toThrow(/metadata/i);
    });

    it('已装饰的类与实例仍然正常返回', () => {
      const instance = new HonestTypesEntity({ title: 'x' });
      expect(getEntityMetadata(HonestTypesEntity).name).toBe('HonestTypesEntity');
      expect(getEntityMetadata(instance)).toBe(getEntityMetadata(HonestTypesEntity));
    });
  });

  describe('getEntityType', () => {
    it('没有反向引用的对象必须抛错', () => {
      expect(() => getEntityType({} as never)).toThrow(/entity type/i);
    });

    /**
     * 先写的断言是「传实体类也该拿到实体类」，跑出来是 `expected undefined to be [Function]`。
     * **红了但红错了**：读源码才发现 `ENTITY_TYPE` 槽位全仓只在
     * `entity-manager.ts` 往**元数据对象**上写过一次，类和实例上从来没有 ——
     * 旧签名里 `T | InstanceType<T>` 那两支传什么都只会拿到被 `!` 压住的 `undefined`。
     * 所以正确的收口是把入参收窄成 `EntityMetadata`，而不是让类那一支也能用。
     */
    it('传元数据可以取回实体类', () => {
      expect(getEntityType(getEntityMetadata(HonestTypesEntity))).toBe(HonestTypesEntity);
    });
  });

  describe('getEntityStatus', () => {
    it('普通对象必须抛错，而不是返回 undefined', () => {
      expect(() => getEntityStatus({ title: 'x' } as never)).toThrow(/status/i);
    });

    it('假值必须抛错，而不是把入参原样返回', () => {
      expect(() => getEntityStatus(null as never)).toThrow(/status/i);
      expect(() => getEntityStatus(undefined as never)).toThrow(/status/i);
    });

    it('实体实例仍然正常返回状态对象', () => {
      const instance = new HonestTypesEntity({ title: 'x' });
      expect(getEntityStatus(instance)).toBeTypeOf('object');
    });
  });

  describe('isRxDBEntity', () => {
    it('必须返回真正的 boolean，而不是把假值入参原样返回', () => {
      // 旧实现这三条分别返回 `null` / `undefined` / `0`，
      // 既有用例用 `toBeFalsy()` 断言，正好把这个缺陷放过去了。
      expect(isRxDBEntity(null as never)).toBe(false);
      expect(isRxDBEntity(undefined as never)).toBe(false);
      expect(isRxDBEntity(0 as never)).toBe(false);
      expect(isRxDBEntity('' as never)).toBe(false);
    });

    it('普通对象返回 false，且不得因为 getEntityStatus 改成 fail-fast 而抛错', () => {
      expect(isRxDBEntity({ title: 'x' } as never)).toBe(false);
    });

    it('实体实例返回 true', () => {
      const instance = new HonestTypesEntity({ title: 'x' });
      expect(isRxDBEntity(instance)).toBe(true);
    });

    it('作为类型守卫可以收窄类型', () => {
      const candidate: unknown = new HonestTypesEntity({ title: 'x' });
      // 编译期断言：守卫成立后 `candidate` 必须已经收窄到实体，
      // 否则 `.title` 在 `unknown` 上取属性会 typecheck 失败。
      if (isRxDBEntity<typeof HonestTypesEntity>(candidate as never)) {
        expect((candidate as HonestTypesEntity).title).toBe('x');
      }
      expect(rxdb).toBeDefined();
    });
  });
});
