import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import type { IRxDBAdapter } from '../rxdb-adapter.js';
import { RxDB } from '../RxDB.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

const databases = new Set<RxDB>();
let databaseSequence = 0;

/** 手动放行的 `connect()`：把适配器钉在引导链的第一个 await 上，制造断连窗口。 */
interface StalledAdapter {
  adapter: IRxDBAdapter;
  release: () => void;
}

const createStalledAdapter = (): StalledAdapter => {
  const adapter = createMockAdapter();
  let release!: () => void;
  const stalled = new Promise<IRxDBAdapter>(resolve => {
    release = () => resolve(adapter);
  });
  adapter.connect = vi.fn(() => stalled);
  return { adapter, release };
};

/**
 * @param created - 适配器工厂每次产出的实例都会追加到这里，用于断言「拿到的是第几个适配器」
 */
const createDatabase = (factory: () => IRxDBAdapter): RxDB => {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-disconnect-race-${databaseSequence}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', factory);
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
    const { adapter, release } = createStalledAdapter();
    const database = createDatabase(() => adapter);

    const connecting = database.connect('local');
    await vi.waitFor(() => expect(adapter.connect).toHaveBeenCalled());

    const disconnected = database.disconnect('local');
    release();
    await disconnected;

    await expect(connecting).rejects.toThrow(/aborted/);
    expect(await firstValueFrom(database.connected$)).toBe(false);
  });

  it('引导期 disconnectAll 后，connect 不得把适配器标回已连接', async () => {
    const { adapter, release } = createStalledAdapter();
    const database = createDatabase(() => adapter);

    const connecting = database.connect('local');
    await vi.waitFor(() => expect(adapter.connect).toHaveBeenCalled());

    const disconnected = database.disconnectAll();
    release();
    await disconnected;

    await expect(connecting).rejects.toThrow(/aborted/);
    expect(await firstValueFrom(database.connected$)).toBe(false);
  });

  it('disconnect 不等在飞的 connect 落地：适配器卡住也能停机', async () => {
    const { adapter } = createStalledAdapter();
    const database = createDatabase(() => adapter);

    void database.connect('local').catch(() => undefined);
    await vi.waitFor(() => expect(adapter.connect).toHaveBeenCalled());

    // 闸门始终不放：适配器的 connect() 卡死（对端不可达 / 文件锁）时，停机不能跟着一起卡住
    await database.disconnect('local');

    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
    expect(await firstValueFrom(database.connected$)).toBe(false);
  });

  it('中止的引导链不重复关连接：adapter.disconnect() 只来自 disconnect 一处', async () => {
    const { adapter, release } = createStalledAdapter();
    const database = createDatabase(() => adapter);

    const connecting = database.connect('local');
    await vi.waitFor(() => expect(adapter.connect).toHaveBeenCalled());

    await database.disconnect('local');
    release();
    await expect(connecting).rejects.toThrow(/aborted/);

    // 中止的链自己也去关一遍的话，适配器会收到两次 disconnect()——多数实现并不幂等
    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
  });

  it('引导期断开后重连，旧链路不得用已断开的实例覆盖新实例', async () => {
    const first = createStalledAdapter();
    const created: IRxDBAdapter[] = [];
    const database = createDatabase(() => {
      const adapter = created.length === 0 ? first.adapter : createMockAdapter();
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
    const adapter = createMockAdapter();
    const database = createDatabase(() => adapter);

    await expect(database.connect('local')).resolves.toBe(adapter);
    expect(await firstValueFrom(database.connected$)).toBe(true);
  });
});
