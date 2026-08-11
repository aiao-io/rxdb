import { beforeAll, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { CheckRepositoryUpdatesResult, RxDBAdapters } from '../../index.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { RxDB } from '../../RxDB.js';
import { checkRepositoryUpdates } from '../../version/check-repository-updates.js';

/**
 * RXD-039 残留项：**包入口导出的类型名，指向的不是运行时真正的东西**。
 *
 * 三处各自独立，但坏法一样 —— 类型能编译过、`d.ts` 也能生成，
 * 消费方按声明写出来的代码却跑不通：
 *
 * 1. `CheckRepositoryUpdatesResult` 在仓库里**存在两份不同形状**，
 *    `index.ts` 导出的是 `VersionManager.interface.ts` 里那份漂移过的
 *    （`updateCount` / `latestChangeId` / `lastPulledChangeId`），
 *    而 `VersionManager.checkRepositoryUpdates()` 实际返回的是
 *    `check-repository-updates.ts` 里那份（`repository` / `pendingCount` /
 *    `remoteLatestChangeId` / `localLastPullRemoteChangeId`）。两份**没有一个字段重名对得上**
 *    （除了 `hasUpdates`），消费方照导出的类型解构会全拿到 `undefined`。
 * 2. `EntityBase.reset` 声明 `() => void`，运行时返回的是 `Promise<void>`
 *    （`EntityManager.reset` 是 `async`）。
 * 3. `RxDBAdapters` 带 `[name: string]: IRxDBAdapter` 索引签名，
 *    5 个适配器包的 `declare module` 合并因此**完全失效** ——
 *    `keyof RxDBAdapters` 恒为 `string`，`getAdapter('sqlite')` 永远只能拿到基类型。
 *
 * 本文件的 1 与 3 是**编译期**红线：vitest 不做类型检查，
 * 它们只会在 `tsc -p tsconfig.spec.json --noEmit` 这道单独的门禁里转红。
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

  describe('CheckRepositoryUpdatesResult', () => {
    it('入口导出的类型必须能接住运行时真正返回的对象（编译期断言）', async () => {
      // 走 `needsPull === false` 的短路分支：不碰任何适配器 I/O，拿到的仍是真实返回值。
      const runtime = await checkRepositoryUpdates(rxdb, 'public', 'EntryTypeHonestyEntity');

      // 红线在这一行：漂移那份类型缺 `repository` / `pendingCount` /
      // `remoteLatestChangeId` / `localLastPullRemoteChangeId`，且多要 3 个运行时不给的字段。
      const declared: CheckRepositoryUpdatesResult = runtime;

      expect(declared.hasUpdates).toBe(false);
      expect(declared.pendingCount).toBe(0);
      expect(declared.remoteLatestChangeId).toBe(0);
      expect(declared.localLastPullRemoteChangeId).toBeNull();
      expect(declared.repository).toEqual({ namespace: 'public', entity: 'EntryTypeHonestyEntity' });
    });

    it('运行时返回的字段集必须与声明一一对应，不能多也不能少', async () => {
      const runtime = await checkRepositoryUpdates(rxdb, 'public', 'EntryTypeHonestyEntity');
      expect(Object.keys(runtime).sort()).toEqual(
        ['hasUpdates', 'localLastPullRemoteChangeId', 'pendingCount', 'remoteLatestChangeId', 'repository'].sort()
      );
    });
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
