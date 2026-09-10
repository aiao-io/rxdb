import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import type { IRxDBAdapter } from '../rxdb-adapter.js';
import { RxDB } from '../RxDB.js';
import { createMockAdapter, type MockLocalAdapter } from './fixtures/test-db-setup.js';

const databases = new Set<RxDB>();
let databaseSequence = 0;

/** 手动放行的 `connect()`：把适配器钉在引导链的第一个 await 上，制造断连窗口。 */
interface StalledAdapter {
  adapter: MockLocalAdapter;
  release: () => void;
}

const createStalledAdapter = (rxdb: RxDB): StalledAdapter => {
  const adapter = createMockAdapter(rxdb);
  let release!: () => void;
  const stalled = new Promise<IRxDBAdapter>(resolve => {
    release = () => resolve(adapter);
  });
  adapter.connect = vi.fn(() => stalled);
  return { adapter, release };
};

const createDatabase = (): RxDB => {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-disconnect-race-${databaseSequence}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  databases.add(database);
  return database;
};

/**
 * 建库 → 造适配器 → 注册，顺序不可颠倒：适配器构造时要拿到自己所属的 `RxDB`，
 * 这跟真实适配器由 `AdapterFactory` 接收数据库实例是同一条路径。
 */
const createStalledDatabase = (): StalledAdapter & { database: RxDB } => {
  const database = createDatabase();
  const { adapter, release } = createStalledAdapter(database);
  database.adapter('local', () => adapter);
  return { database, adapter, release };
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
 * 断连与在飞 `connect()` 的仲裁契约。
 *
 * `connect()` 的引导链（工厂 → `adapter.connect()` → 建表/迁移）全程是 await，期间调用
 * `disconnect()` 会拆掉当前状态，而引导链醒来后仍会无条件把适配器标回已连接。结果是
 * 「`disconnect()` 已经 resolve，实例却又活了过来」：`#shutdown()` 从未执行，插件、网关与
 * 查询缓存全部留存；更糟的是重连之后，旧链路的写回会用**已断开的实例**覆盖掉新实例，
 * 而那正是 `localAdapterSync` 交给插件的东西。
 */
describe('RxDB 断连与在飞 connect 的仲裁', () => {
  it('引导期 disconnect 后，connect 不得把适配器标回已连接', async () => {
    const { database, adapter, release } = createStalledDatabase();

    const connecting = database.connect('local');
    await vi.waitFor(() => expect(adapter.connect).toHaveBeenCalled());

    const disconnected = database.disconnect('local');
    release();
    await disconnected;

    await expect(connecting).rejects.toThrow(/aborted/);
    expect(await firstValueFrom(database.connected$)).toBe(false);
  });

  it('引导期 disconnectAll 后，connect 不得把适配器标回已连接', async () => {
    const { database, adapter, release } = createStalledDatabase();

    const connecting = database.connect('local');
    await vi.waitFor(() => expect(adapter.connect).toHaveBeenCalled());

    const disconnected = database.disconnectAll();
    release();
    await disconnected;

    await expect(connecting).rejects.toThrow(/aborted/);
    expect(await firstValueFrom(database.connected$)).toBe(false);
  });

  it('disconnect 不等在飞的 connect 落地：适配器卡住也能停机', async () => {
    const { database, adapter } = createStalledDatabase();

    void database.connect('local').catch(() => undefined);
    await vi.waitFor(() => expect(adapter.connect).toHaveBeenCalled());

    // 闸门始终不放：适配器的 connect() 卡死（对端不可达 / 文件锁）时，停机不能跟着一起卡住
    await database.disconnect('local');

    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
    expect(await firstValueFrom(database.connected$)).toBe(false);
  });

  it('中止的引导链不重复关连接：adapter.disconnect() 只来自 disconnect 一处', async () => {
    const { database, adapter, release } = createStalledDatabase();

    const connecting = database.connect('local');
    await vi.waitFor(() => expect(adapter.connect).toHaveBeenCalled());

    await database.disconnect('local');
    release();
    await expect(connecting).rejects.toThrow(/aborted/);

    // 中止的链自己也去关一遍的话，适配器会收到两次 disconnect()——多数实现并不幂等
    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
  });

  it('引导期断开后重连，旧链路不得用已断开的实例覆盖新实例', async () => {
    const database = createDatabase();
    const first = createStalledAdapter(database);
    const created: IRxDBAdapter[] = [];
    database.adapter('local', db => {
      const adapter = created.length === 0 ? first.adapter : createMockAdapter(db);
      created.push(adapter);
      return adapter;
    });

    const stale = database.connect('local');
    await vi.waitFor(() => expect(first.adapter.connect).toHaveBeenCalled());

    const disconnected = database.disconnect('local');
    first.release();
    await disconnected;
    await expect(stale).rejects.toThrow(/aborted/);

    const fresh = await database.connect('local');

    expect(created).toHaveLength(2);
    expect(fresh).toBe(created[1]);
    // 插件经 localAdapterSync 拿连接；旧链路写回死实例的话，它们会打在一条已关闭的连接上
    expect(database.localAdapterSync).toBe(created[1]);
  });

  it('没有断连介入时，connect 照常完成', async () => {
    const database = createDatabase();
    const adapter = createMockAdapter(database);
    database.adapter('local', () => adapter);

    await expect(database.connect('local')).resolves.toBe(adapter);
    expect(await firstValueFrom(database.connected$)).toBe(true);
  });
});
