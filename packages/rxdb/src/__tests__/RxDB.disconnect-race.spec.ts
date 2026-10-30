import type { LifecycleScope } from '@aiao/utils';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import type { IRxDBAdapter } from '../rxdb-adapter.js';
import type { IRxDBPlugin } from '../rxdb-plugin.js';
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

/** 健康适配器 A 已连上、适配器 B 的工厂还没结算时开始拆卸的现场。 */
interface PendingFactoryScene {
  database: RxDB;
  healthy: MockLocalAdapter;
  /** 作用域型插件拿到的连接纪元作用域，按安装次序 */
  scopes: LifecycleScope[];
  /** 插件登记在作用域上的撤销条目 */
  released: Mock<() => void>;
  /** 让 B 的工厂以给定错误拒绝 */
  failFactory: (error: Error) => void;
  /** 让 B 的工厂建成给定实例 */
  resolveFactory: (adapter: IRxDBAdapter) => void;
  /** `getAdapter('pending')` 自己的结算结果（拒绝原因），免得成为未处理的拒绝 */
  creating: Promise<unknown>;
}

const createPendingFactoryScene = async (): Promise<PendingFactoryScene> => {
  const database = createDatabase();
  const healthy = createMockAdapter(database);
  const factory = Promise.withResolvers<IRxDBAdapter>();
  database.adapter('local', () => healthy).adapter('pending', () => factory.promise);
  const scopes: LifecycleScope[] = [];
  const released = vi.fn<() => void>();
  database.use((): IRxDBPlugin => ({
    name: 'scoped-probe',
    lifecycle: 'scoped',
    install: scope => {
      scopes.push(scope);
      scope.acquire(() => released, 'probe');
    }
  }));
  await database.connect('local');
  const creating = database.getAdapter('pending').then(
    () => undefined,
    (error: unknown) => error
  );
  return {
    database,
    healthy,
    scopes,
    released,
    failFactory: error => factory.reject(error),
    resolveFactory: adapter => factory.resolve(adapter),
    creating
  };
};

/**
 * 拆卸要等在飞的工厂结算（否则它建出的实例没人关），但不能被它的失败拖垮：工厂拒绝只说明
 * 那一个实例没建出来，已经连着的适配器、插件作用域照样要拆，错误留到拆完再交给调用方。
 */
describe('在飞适配器工厂失败时的全局拆卸', () => {
  it('disconnectAll：仍断开健康适配器并释放插件作用域，工厂错误原样抛出，实例可重连', async () => {
    const { database, healthy, scopes, released, failFactory, creating } = await createPendingFactoryScene();
    const failure = new Error('factory failed');

    const disconnecting = database.disconnectAll();
    failFactory(failure);

    await expect(disconnecting).rejects.toBe(failure);
    expect(await creating).toBe(failure);
    expect(healthy.disconnect).toHaveBeenCalledTimes(1);
    expect(released).toHaveBeenCalledTimes(1);
    expect(scopes.map(scope => scope.state)).toEqual(['disposed']);
    expect(await firstValueFrom(database.connected$)).toBe(false);

    // 停机走完才会复位成「可重新 init()」：重连装进的是全新纪元的作用域
    await database.connect('local');
    expect(scopes.map(scope => scope.state)).toEqual(['disposed', 'active']);
  });

  it('destroy：同样拆干净并抛出工厂错误，之后进入终态、重复销毁不再断开', async () => {
    const { database, healthy, scopes, released, failFactory, creating } = await createPendingFactoryScene();
    const failure = new Error('factory failed');

    const destroying = database.destroy();
    failFactory(failure);

    await expect(destroying).rejects.toBe(failure);
    expect(await creating).toBe(failure);
    expect(healthy.disconnect).toHaveBeenCalledTimes(1);
    expect(released).toHaveBeenCalledTimes(1);
    expect(scopes.map(scope => scope.state)).toEqual(['disposed']);
    expect(await firstValueFrom(database.connected$)).toBe(false);

    // 终态不可逆：漏关的资源没有机会靠重试 destroy() 回收，所以第一次就必须拆干净
    await expect(database.destroy()).resolves.toBeUndefined();
    expect(healthy.disconnect).toHaveBeenCalledTimes(1);
    await expect(database.connect('local')).rejects.toThrow(/destroyed/);
  });

  it('工厂在拆卸途中建成：建出的实例与健康适配器一并断开', async () => {
    const { database, healthy, resolveFactory, creating } = await createPendingFactoryScene();
    const late = createMockAdapter(database);

    const disconnecting = database.disconnectAll();
    resolveFactory(late);

    await expect(disconnecting).resolves.toBeUndefined();
    expect(await creating).toBeUndefined();
    expect(late.disconnect).toHaveBeenCalledTimes(1);
    expect(healthy.disconnect).toHaveBeenCalledTimes(1);
  });

  it('工厂失败与适配器断开失败并存时，抛出先结算的工厂错误', async () => {
    const { database, healthy, failFactory, creating } = await createPendingFactoryScene();
    const failure = new Error('factory failed');
    healthy.disconnect.mockRejectedValueOnce(new Error('close failed'));

    const disconnecting = database.disconnectAll();
    failFactory(failure);

    await expect(disconnecting).rejects.toBe(failure);
    expect(await creating).toBe(failure);
    expect(healthy.disconnect).toHaveBeenCalledTimes(1);
  });
});
