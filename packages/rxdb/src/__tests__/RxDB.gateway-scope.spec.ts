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
import { RxDB } from '../RxDB.js';
import { VersionManager } from '../version/VersionManager.js';
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
  it('A3 停机时网关经作用域逆序释放，排在 versionManager.destroy() 之前', async () => {
    const database = createDatabase();
    const order: string[] = [];
    vi.spyOn(RxDBTabsGateway.prototype, 'destroy').mockImplementation(() => void order.push('gateway'));
    vi.spyOn(VersionManager.prototype, 'destroy').mockImplementation(() => void order.push('versionManager'));

    await database.connect('sqlite');
    await database.disconnectAll();

    // 点名写法下网关排在最后（`#release_connection_scope()` → versionManager → gateway）；
    // 登记进作用域后它是最晚登记的那一条，逆序释放让它第一个跑。
    expect(order).toEqual(['gateway', 'versionManager']);
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
