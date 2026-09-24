/**
 * @fileoverview 自建 {@link RxDB} 实例的拆卸登记
 *
 * `createTestDB()` 一类的工厂自带 `cleanup`，而直接 `new RxDB(...)` 的用例没有出口：
 * 实例上的 reachability 退避定时器、宿主 `online` / `offline` 监听、插件与 gateway
 * 会一路活到进程结束。`isolate: true` 时每个 spec 文件一个 worker，泄漏被进程边界兜住，
 * 看不出问题；一旦切 `isolate: false` 或换 runner，这些实例就会跨文件互相串事件。
 * 本模块把「登记 + 销毁」收成一处，避免每个文件各写一份 after-hook。
 */

import { afterAll, afterEach } from 'vitest';

import { RxDB } from '../../RxDB.js';

/** {@link registerRxDBTeardown} 返回的两个登记函数，区别只在销毁时机。 */
export interface RxDBTeardownTrackers {
  /** 登记单个用例自建的实例，`afterEach` 销毁。原样返回入参，可直接包住 `new RxDB(...)`。 */
  trackRxDB: <T extends RxDB>(rxdb: T) => T;
  /** 登记 `beforeAll` 里建、整个文件共用的实例，`afterAll` 销毁。 */
  trackSharedRxDB: <T extends RxDB>(rxdb: T) => T;
}

/**
 * 在当前 spec 文件里开一份实例登记表，并挂上对应的 after-hook。
 *
 * @returns 两个登记函数，见 {@link RxDBTeardownTrackers}
 *
 * @remarks
 * 必须在文件顶层（或 `describe` 内）同步调用一次，hook 才挂得到本文件的 suite 上。
 * 刻意**不**在本模块顶层直接挂 hook：`isolate: false` 下模块在 worker 内只求值一次，
 * 那样只有第一个 import 它的文件能拿到 hook——恰好在本模块要防的场景里失效。
 *
 * 销毁走 {@link RxDB.destroy} 而不是 `disconnectAll()`：后者按设计保留 reachability
 * 与 syncState（它们不跟随连接纪元），而用例结束后没人再用这个实例，该连定时器一起放掉。
 * `destroy()` 幂等，用例自己已经销毁过的实例再登记一次也不会出错。
 *
 * @example
 * ```typescript
 * const { trackRxDB } = registerRxDBTeardown();
 *
 * it('...', () => {
 *   const rxdb = trackRxDB(new RxDB({ dbName: 'x', entities: [] }));
 * });
 * ```
 */
export function registerRxDBTeardown(): RxDBTeardownTrackers {
  const per_test = new Set<RxDB>();
  const per_file = new Set<RxDB>();

  const drain = async (tracked: Set<RxDB>): Promise<void> => {
    const instances = [...tracked];
    tracked.clear();
    await Promise.all(instances.map(rxdb => rxdb.destroy()));
  };

  afterEach(() => drain(per_test));
  afterAll(() => drain(per_file));

  return {
    trackRxDB: rxdb => {
      per_test.add(rxdb);
      return rxdb;
    },
    trackSharedRxDB: rxdb => {
      per_file.add(rxdb);
      return rxdb;
    }
  };
}
