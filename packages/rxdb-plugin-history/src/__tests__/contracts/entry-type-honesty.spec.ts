import { Entity, EntityBase, type IRxDBAdapter, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkRepositoryUpdates } from '../../check-repository-updates.js';
import type { CheckRepositoryUpdatesResult } from '../../index.js';

/**
 * RXD-039 残留项的历史侧那一条：**包入口导出的类型名，指向的不是运行时真正的东西**。
 *
 * `CheckRepositoryUpdatesResult` 原本在仓库里**存在两份不同形状**：核心 `index.ts` 导出的是
 * `VersionManager.interface.ts` 里那份漂移过的（`updateCount` / `latestChangeId` /
 * `lastPulledChangeId`），而 `VersionManager.checkRepositoryUpdates()` 实际返回的是
 * `check-repository-updates.ts` 里那份（`repository` / `pendingCount` / `remoteLatestChangeId` /
 * `localLastPullRemoteChangeId`）。两份**没有一个字段重名对得上**（除了 `hasUpdates`），
 * 消费方照导出的类型解构会全拿到 `undefined`。
 *
 * US-025 阶段 C 把实现搬进本包、同时删掉核心那份漂移声明之后，这条判据跟着实现走：
 * 只剩一份类型了，那它就必须逐字接得住运行时真正返回的对象。
 *
 * 第一个 it 是**编译期**红线 —— vitest 不做类型检查，它只会在
 * `tsc -p tsconfig.spec.json --noEmit` 这道单独的门禁里转红。
 */
@Entity({
  name: 'EntryTypeHonestyEntity',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class EntryTypeHonestyEntity extends EntityBase {
  title!: string;
}

describe('RXD-039 · 包入口导出的类型必须与运行时一致', () => {
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
});
