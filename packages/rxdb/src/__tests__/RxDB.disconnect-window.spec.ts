/**
 * 拆卸窗口内的 `connect()` 与迟到的 `disconnect()` 收尾（RV-01a1ba3ae17c7e2eb56b5e4fd2c4e08f、
 * RV-01a1baad6d8f7bbe8c232e43a51d7fe1）。
 *
 * 1. `disconnect()` / `disconnectAll()` 已经摘掉连接状态、还在等底层 `adapter.disconnect()` 时，
 *    同名 `connect()` 命中的是上一次已经 resolve 的连接 Promise，交出去的是一个正在关闭的实例。
 *    契约改为：等这次拆卸结束，再重新引导一条新连接。
 * 2. 单点 `disconnect()` 卡在插件释放上、被 `disconnectAll()` 接管之后，它的收尾不能再按名字
 *    清缓存、撤名字、复位表集——那时新连接可能已经建起来了；它也不该把已经关掉的实例再关一次。
 *
 * 引导期（`connect()` 尚未落地）的断连仲裁在 `RxDB.disconnect-race.spec.ts`。
 */
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import type { IRxDBPlugin } from '../rxdb-plugin.js';
import { RxDB } from '../RxDB.js';
import { createMockAdapter, type MockLocalAdapter } from './fixtures/test-db-setup.js';

const databases = new Set<RxDB>();
/** 用例里钉住的闸门：断言失败时也要在清理前放行，否则 afterEach 的 disconnectAll 跟着挂住 */
const gates: Gate[] = [];
let databaseSequence = 0;

afterEach(async () => {
  for (const pendingGate of gates.splice(0)) pendingGate.open();
  const pending = Array.from(databases);
  databases.clear();
  await Promise.all(pending.map(database => database.disconnectAll()));
});

/** 让出一个宏任务。 */
const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

interface Gate {
  readonly promise: Promise<void>;
  open(): void;
}

const gate = (): Gate => {
  let open!: () => void;
  const promise = new Promise<void>(resolve => {
    open = resolve;
  });
  const created = { promise, open };
  gates.push(created);
  return created;
};

/** 每次工厂调用都建新实例，记下建出的全部实例。 */
const createDatabase = (adapterNames: readonly ('local' | 'remote')[]) => {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-disconnect-window-${databaseSequence}`,
    entities: [],
    sync: {
      local: { adapter: 'local' },
      ...(adapterNames.includes('remote') ? { remote: { adapter: 'remote' } } : {}),
      type: SyncType.None
    }
  });
  databases.add(database);
  const created = { local: [] as MockLocalAdapter[], remote: [] as MockLocalAdapter[] };
  for (const name of adapterNames) {
    database.adapter(name, db => {
      const adapter = createMockAdapter(db);
      created[name].push(adapter);
      return adapter;
    });
  }
  return { database, created };
};

/** 把一个已建出的适配器的 `disconnect()` 钉住，返回放行它的闸门。 */
const holdDisconnect = (adapter: MockLocalAdapter): Gate => {
  const closing = gate();
  adapter.disconnect.mockImplementation(() => closing.promise);
  return closing;
};

/** 在一个 Promise 上挂探针：`settled()` 告诉你它此刻是否已经结算。 */
const watch = <T>(promise: Promise<T>) => {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true)
  );
  return { settled: () => settled };
};

describe('拆卸窗口内的 connect() 不交出正在关闭的旧适配器', () => {
  it('单适配器：adapter.disconnect() 尚未结算时 connect 等拆卸结束，再引导一条新连接', async () => {
    const { database, created } = createDatabase(['local']);
    const first = await database.connect('local');
    const closing = holdDisconnect(created.local[0]);

    const disconnecting = database.disconnect('local');
    await vi.waitFor(() => expect(created.local[0].disconnect).toHaveBeenCalledTimes(1));
    const reconnect = database.connect('local');
    const probe = watch(reconnect);
    await tick();
    await tick();
    expect(probe.settled()).toBe(false);

    closing.open();
    await disconnecting;
    const fresh = await reconnect;

    expect(fresh).not.toBe(first);
    expect(created.local).toHaveLength(2);
    expect(database.initialized).toBe(true);
    expect(await firstValueFrom(database.connected$)).toBe(true);
    expect(database.localAdapterSync).toBe(fresh);
  });

  it('全局拆卸：disconnectAll() 还在关适配器时 connect 等它结束，再引导一条新连接', async () => {
    const { database, created } = createDatabase(['local']);
    const first = await database.connect('local');
    const closing = holdDisconnect(created.local[0]);

    const tearingDown = database.disconnectAll();
    await vi.waitFor(() => expect(created.local[0].disconnect).toHaveBeenCalledTimes(1));
    const reconnect = database.connect('local');
    const probe = watch(reconnect);
    await tick();
    await tick();
    expect(probe.settled()).toBe(false);

    closing.open();
    await tearingDown;
    const fresh = await reconnect;

    expect(fresh).not.toBe(first);
    expect(await firstValueFrom(database.connected$)).toBe(true);
    expect(database.localAdapterSync).toBe(fresh);
  });

  it('两个适配器只断一个：被断的那个等拆卸结束再重连，另一个始终连着', async () => {
    const { database, created } = createDatabase(['local', 'remote']);
    await database.connect('local');
    const firstRemote = await database.connect('remote');
    const closing = holdDisconnect(created.remote[0]);

    const disconnecting = database.disconnect('remote');
    await vi.waitFor(() => expect(created.remote[0].disconnect).toHaveBeenCalledTimes(1));
    const reconnect = database.connect('remote');
    const probe = watch(reconnect);
    await tick();
    await tick();
    expect(probe.settled()).toBe(false);
    expect(await firstValueFrom(database.adapterConnected$('local'))).toBe(true);

    closing.open();
    await disconnecting;
    const freshRemote = await reconnect;

    expect(freshRemote).not.toBe(firstRemote);
    expect(created.remote).toHaveLength(2);
    expect(await firstValueFrom(database.adapterConnected$('remote'))).toBe(true);
    expect(created.local[0].disconnect).not.toHaveBeenCalled();
  });

  it('并发的两次 disconnect 共用一次拆卸：同一个实例只关一次', async () => {
    const { database, created } = createDatabase(['local']);
    await database.connect('local');
    const closing = holdDisconnect(created.local[0]);

    const first = database.disconnect('local');
    const second = database.disconnect('local');
    closing.open();
    await Promise.all([first, second]);

    expect(created.local[0].disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('被 disconnectAll() 接管的旧 disconnect() 不清理新连接', () => {
  it('旧 disconnect 卡在插件释放上，停机重连之后它的收尾不碰新缓存，新实例最终被 destroy 关闭', async () => {
    const { database, created } = createDatabase(['local', 'remote']);
    const installGate = gate();
    let installs = 0;
    const plugin: IRxDBPlugin = {
      name: 'staleDisconnectProbe',
      lifecycle: 'scoped',
      inject: ['adapter:local'],
      install: () => {
        installs += 1;
        return installs === 1 ? installGate.promise : undefined;
      }
    };
    await database.connect('local');
    await database.connect('remote');
    database.use(() => plugin);
    await tick();
    expect(installs).toBe(1);

    // 释放必须早于 adapter.disconnect()（INV-7），旧安装没结算，这次 disconnect 就停在释放等待上
    const staleDisconnect = database.disconnect('local');
    await tick();
    await database.disconnectAll();

    const fresh = await database.connect('local');
    await database.connect('remote');
    installGate.open();
    await staleDisconnect;

    expect(await database.getAdapter('local')).toBe(fresh);
    expect(database.localAdapterSync).toBe(fresh);
    expect(created.local).toHaveLength(2);
    // 旧实例由 disconnectAll() 关过一次，旧 disconnect 的收尾不再关第二次
    expect(created.local[0].disconnect).toHaveBeenCalledTimes(1);

    databases.delete(database);
    await database.destroy();
    expect(created.local[1].disconnect).toHaveBeenCalledTimes(1);
  });
});
