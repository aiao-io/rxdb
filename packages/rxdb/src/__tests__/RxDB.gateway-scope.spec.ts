/**
 * 跨 tab 网关的作用域化拆卸（US-025 阶段 A：A3）。
 *
 * 网关**不外移成包**（判定见 US-025「不拆的理由」），但它的拆卸必须从 `#shutdown()` 里
 * 那条手写的点名代码，改成向连接纪元作用域登记一条撤销条目 —— 症状 3 说的正是这个：
 * 每多一个由宿主逐条点名销毁的子系统，就多一处必须手工保持对称的拆卸。
 *
 * 点名写法还带着一个今天就踩得到的故障：`#shutdown()` 里 `this.#gateway?.destroy()`
 * 之后还有六行复位（`#rxdb_initialized` / `#shutting_down` / 适配器名解绑 / 已连接集合），
 * 网关销毁一抛错，这六行全部跳过，实例永久卡在停机窗口里 —— 此后每次 `init()` 都只会
 * 抛 `instance is shutting down`。作用域负责逆序释放且**不短路**，这条故障随之消失。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import { RxDBTabsGateway } from '../gateway/RxDBTabsGateway.js';
import type { IRxDBPlugin } from '../rxdb-plugin.js';
import { RxDB } from '../RxDB.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

const databases = new Set<RxDB>();
let databaseSequence = 0;

function createDatabase(multiInstance?: false): RxDB {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-gateway-scope-${databaseSequence}`,
    entities: [],
    multiInstance,
    sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
  });
  database.adapter('sqlite', db => createMockAdapter(db));
  databases.add(database);
  return database;
}

afterEach(async () => {
  const pending = Array.from(databases);
  databases.clear();
  try {
    await Promise.all(pending.map(database => database.disconnectAll()));
  } finally {
    vi.restoreAllMocks();
  }
});

describe('网关随连接纪元作用域释放', () => {
  it('A3 网关由连接纪元作用域释放，且晚于每一个插件作用域', async () => {
    const database = createDatabase();
    const order: string[] = [];
    vi.spyOn(RxDBTabsGateway.prototype, 'destroy').mockImplementation(() => void order.push('gateway'));
    database.use(
      (): IRxDBPlugin => ({
        name: 'gatewayScopeProbe',
        lifecycle: 'scoped',
        install: scope => void scope.acquire(() => () => void order.push('plugin'), 'probe:marker')
      })
    );

    await database.connect('sqlite');
    await database.disconnectAll();

    // `#shutdown()` 分两段：先 `#destroy_plugin()` 逐个释放插件作用域，再
    // `#release_connection_scope()` 释放连接纪元作用域本身 —— 网关登记在后者里，
    // 于是它**晚于**所有插件条目。这个先后不是巧合而是契约：插件的撤销动作可能还要经网关
    // 广播一声（「本 tab 要走了」之类），网关先死的话那一声就发不出去，而且发不出去这件事
    // 在日志里看不见。
    //
    // 参照物原本是 `versionManager.destroy()` —— 点名写法下它排在网关前面，用来证明网关
    // 已经从点名代码挪进了作用域。US-025 阶段 C 把版本子系统搬进
    // `@aiao/rxdb-plugin-history` 之后核心不再构造它，参照物换成一个作用域化插件探针：
    // 它走的正是 `versionManager` 现在走的那条路（插件作用域），判据因此逐字等价。
    expect(order).toEqual(['plugin', 'gateway']);
  });

  it('A3 网关销毁抛错不再中断停机：实例仍复位成可重新 init()', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();
    vi.spyOn(RxDBTabsGateway.prototype, 'destroy').mockImplementationOnce(() => {
      throw new Error('gateway destroy boom');
    });

    await database.connect('sqlite');
    await expect(database.disconnectAll()).resolves.toBeUndefined();

    // 停机窗口没关上的话，这里只会抛 `[RxDB] init() rejected: instance is shutting down`
    expect(() => database.init()).not.toThrow();
    // 复位到底：适配器名已解绑、已连接集合已清空，重连走的是完整的一轮引导
    await expect(database.connect('sqlite')).resolves.not.toThrow();
  });

  it('A3 重连拿到全新网关，上一纪元的那个已释放', async () => {
    const database = createDatabase();
    const destroy = vi.spyOn(RxDBTabsGateway.prototype, 'destroy');

    await database.connect('sqlite');
    await database.disconnectAll();

    expect(destroy).toHaveBeenCalledTimes(1);
    const firstEpochGateway = destroy.mock.instances[0];

    await database.connect('sqlite');
    await database.disconnectAll();

    // 新纪元装的是新实例：复用上一个等于在一个 LeaderElection 已 dispose 的网关上重新 elect()
    expect(destroy).toHaveBeenCalledTimes(2);
    expect(destroy.mock.instances[1]).not.toBe(firstEpochGateway);
  });

  it('A3 multiInstance:false 时不建网关，作用域里也就没有这条登记', async () => {
    const database = createDatabase(false);
    const init = vi.spyOn(RxDBTabsGateway.prototype, 'init');
    const destroy = vi.spyOn(RxDBTabsGateway.prototype, 'destroy');

    await database.connect('sqlite');
    await database.disconnectAll();

    expect(init).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });
});
