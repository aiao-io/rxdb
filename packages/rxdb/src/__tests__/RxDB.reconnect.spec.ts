import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import { RxDBTabsGateway } from '../gateway/RxDBTabsGateway.js';
import type { IRxDBAdapter } from '../rxdb-adapter.js';
import { ENTITY_LOCAL_CREATE_EVENT, EntityLocalCreatedEvent, TransactionBeginEvent } from '../rxdb-events.js';
import type { IRxDBPlugin } from '../rxdb-plugin.js';
import { RxDB } from '../RxDB.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

const databases = new Set<RxDB>();
let databaseSequence = 0;

/**
 * @param created - 适配器工厂每次产出的实例都会追加到这里，用于断言「拿到的是第几个适配器」
 */
const createDatabase = (created: IRxDBAdapter[] = []): RxDB => {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-reconnect-${databaseSequence}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', () => {
    const adapter = createMockAdapter();
    created.push(adapter);
    return adapter;
  });
  databases.add(database);
  return database;
};

afterEach(async () => {
  const pending = Array.from(databases);
  databases.clear();
  try {
    await Promise.all(pending.map(database => database.disconnectAll()));
  } finally {
    vi.restoreAllMocks();
  }
});

/**
 * 断连后重连的可用性契约。
 *
 * `#shutdown()` 会销毁插件、versionManager 与网关，却不复位任何初始化状态：
 * `#rxdb_initialized` 仍是 `true`，`#gateway` 仍指向已销毁的实例，事务游标停在断连那一刻。
 * 于是重连时 `init()` 静默早退 —— 得到的是一个「连上了但什么都不工作」的壳。
 */
describe('RxDB 断连后重连', () => {
  it('disconnectAll 后不再读到已销毁网关的状态', async () => {
    const connectedAt = new Date('2026-01-02T03:04:05.000Z');
    vi.spyOn(RxDBTabsGateway.prototype, 'firstConnectedAt', 'get').mockReturnValue(connectedAt);

    const database = createDatabase();
    await database.connect('local');
    expect(database.firstConnectedAt).toBe(connectedAt);

    await database.disconnectAll();

    expect(database.firstConnectedAt).toBeUndefined();
  });

  it('重连会重新安装插件并重建网关', async () => {
    const gatewayInit = vi.spyOn(RxDBTabsGateway.prototype, 'init');
    const gatewayDestroy = vi.spyOn(RxDBTabsGateway.prototype, 'destroy');
    const install = vi.fn();
    const destroy = vi.fn();
    const plugin = (): IRxDBPlugin => ({ name: 'reconnectPlugin', install, destroy });

    const database = createDatabase();
    database.use(plugin);

    await database.connect('local');
    expect(install).toHaveBeenCalledTimes(1);
    expect(gatewayInit).toHaveBeenCalledTimes(1);

    await database.disconnectAll();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(gatewayDestroy).toHaveBeenCalledTimes(1);

    await database.connect('local');

    expect(install).toHaveBeenCalledTimes(2);
    expect(gatewayInit).toHaveBeenCalledTimes(2);
  });

  it('断连会复位事务游标，重连后的事件不会被永久吞掉', async () => {
    const database = createDatabase();
    await database.connect('local');

    // 事务开启后直接断连（适配器崩溃 / 用户切库），COMMIT 与 ROLLBACK 都不会再来
    database.dispatchEvent(new TransactionBeginEvent());
    await database.disconnectAll();
    await database.connect('local');

    const listener = vi.fn();
    database.addEventListener(ENTITY_LOCAL_CREATE_EVENT, listener);
    database.dispatchEvent(new EntityLocalCreatedEvent([]));

    // 事务挂起标志未复位时，事件会被塞进 #need_dispatch_events 等一个永不到来的 COMMIT
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('重连后 localAdapter$ 吐出新适配器，而不是已断开的旧实例', async () => {
    const created: IRxDBAdapter[] = [];
    const database = createDatabase(created);

    await database.connect('local');
    expect(await firstValueFrom(database.localAdapter$)).toBe(created[0]);

    await database.disconnectAll();
    await database.connect('local');

    // connect 已经建了第二个适配器；localAdapter$ 若仍重放旧缓存，所有仓储都会打到已断开的实例上
    expect(created).toHaveLength(2);
    expect(await firstValueFrom(database.localAdapter$)).toBe(created[1]);
  });
});
