import { beforeAll, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { RxDBAdapters } from '../../index.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { RxDB } from '../../RxDB.js';

/**
 * RXD-039 残留项：**包入口导出的类型名，指向的不是运行时真正的东西**。
 *
 * 三处各自独立，但坏法一样 —— 类型能编译过、`d.ts` 也能生成，
 * 消费方按声明写出来的代码却跑不通：
 *
 * 1. `EntityBase.reset` 声明 `() => void`，运行时返回的是 `Promise<void>`
 *    （`EntityManager.reset` 是 `async`）。
 * 2. `RxDBAdapters` 带 `[name: string]: IRxDBAdapter` 索引签名，
 *    5 个适配器包的 `declare module` 合并因此**完全失效** ——
 *    `keyof RxDBAdapters` 恒为 `string`，`getAdapter('sqlite')` 永远只能拿到基类型。
 *
 * 本文件的 2 是**编译期**红线：vitest 不做类型检查，
 * 它只会在 `tsc -p tsconfig.spec.json --noEmit` 这道单独的门禁里转红。
 *
 * 原本还有第三条 —— `CheckRepositoryUpdatesResult` 在仓库里存在两份漂移的形状。
 * 那份类型随 `VersionManager` 搬去了 `@aiao/rxdb-plugin-history`（US-025 阶段 C），
 * 核心侧漂移的那份同时删除，于是同一条判据改由
 * `packages/rxdb-plugin-history/src/__tests__/contracts/entry-type-honesty.spec.ts` 守。
 */
describe('RXD-039 · 包入口导出的类型必须与运行时一致', () => {
  @Entity({
    name: 'EntryTypeHonestyEntity',
    properties: [{ name: 'title', type: PropertyType.string }]
  })
  class EntryTypeHonestyEntity extends EntityBase {
    title!: string;
  }

  let rxdb!: RxDB;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: 'entry-type-honesty',
      entities: [EntryTypeHonestyEntity],
      sync: {
        local: { adapter: 'sqlite' },
        type: SyncType.None
      }
    });
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

  describe('EntityBase.reset', () => {
    it('声明是 () => void，运行时就必须真的返回 undefined 而不是 Promise', () => {
      const entity = new EntryTypeHonestyEntity({ title: 'x' });
      entity.title = 'y';
      const returned: void = entity.reset();
      // 旧实现返回 `Promise<void>`：这里会拿到一个 Promise 对象。
      expect(returned).toBeUndefined();
      expect(entity.title).toBe('x');
    });
  });

  describe('RxDBAdapters', () => {
    /**
     * 索引签名在的时候 `string extends keyof RxDBAdapters` 恒成立，
     * 这个常量就只能是 `true`，赋给 `false` 编译不过 —— 这就是红线。
     */
    it('不能带 [name: string] 索引签名，否则适配器包的 declare module 合并全废（编译期断言）', () => {
      type IsStringKeyed = string extends keyof RxDBAdapters ? true : false;
      const isStringKeyed: IsStringKeyed = false;
      expect(isStringKeyed).toBe(false);
    });

    it('未注册的适配器名仍然可以传入并在运行时报错，不是编译期拒绝', async () => {
      await expect(rxdb.getAdapter('never-registered')).rejects.toThrow(/not found/);
    });
  });
});
