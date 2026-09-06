/**
 * `connect()` 与插件安装之间的信号契约。
 *
 * 这里守三件事：
 * 1. {@link RxDB.adapterConnected$} 认适配器，不会被另一个先连上的适配器提前放行；
 * 2. 该信号在插件 `install()` 之前置位，插件可以 await 它而不死锁；
 * 3. 安装失败的插件不会在下一次 `connect()` 里被重跑。
 */
import { filter, firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import type { IRxDBPlugin } from '../rxdb-plugin.js';
import { RxDB } from '../RxDB.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

const databases = new Set<RxDB>();
let databaseSequence = 0;

/** 建一个 local(`sqlite`) + remote(`remote`) 双适配器实例，两端都是内存假适配器。 */
function createDatabase(): RxDB {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-plugin-install-${databaseSequence}`,
    entities: [],
    sync: { local: { adapter: 'sqlite' }, remote: { adapter: 'remote' }, type: SyncType.Full }
  });
  database.adapter('sqlite', () => createMockAdapter());
  database.adapter('remote', () => createMockAdapter());
  databases.add(database);
  return database;
}

/** 订阅并记录一路连接状态流的全部发射。 */
function track(database: RxDB, adapterName: string): { readonly emissions: boolean[]; latest(): boolean } {
  const emissions: boolean[] = [];
  database.adapterConnected$(adapterName).subscribe(connected => emissions.push(connected));
  return {
    emissions,
    latest: () => emissions[emissions.length - 1] ?? false
  };
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

describe('RxDB 适配器连接信号与插件安装', () => {
  it('remote 连上不会把 local 的 adapterConnected$ 拉起来', async () => {
    const database = createDatabase();
    const local = track(database, 'sqlite');
    const aggregated: boolean[] = [];
    database.connected$.subscribe(connected => aggregated.push(connected));

    await database.connect('remote');

    // 聚合信号「有任意一个连上」就为真——插件若等它，就会在主表还没建出来时被放行
    expect(aggregated.at(-1)).toBe(true);
    expect(local.latest()).toBe(false);
    // 去重生效：全程只发过初始的 false，没有多余的抖动
    expect(local.emissions).toEqual([false]);

    await database.connect('sqlite');

    expect(local.latest()).toBe(true);
  });

  it('插件可以在 install() 里等自己的适配器就绪而不死锁', async () => {
    const database = createDatabase();
    const order: string[] = [];
    database.use((rxdb): IRxDBPlugin => ({
      name: 'gatedPlugin',
      install: async () => {
        // 信号在 #await_plugin_installs 之前置位，所以这一等必然能等到；
        // 若改回「connect() 完成后才置位」，这里就是一个互等的死锁。
        await firstValueFrom(rxdb.adapterConnected$('sqlite').pipe(filter(Boolean)));
        order.push('install');
      },
      destroy: async () => undefined
    }));

    await database.connect('sqlite');
    order.push('connected');

    expect(order).toEqual(['install', 'connected']);
  });

  it('断开一个适配器不会把仍然连着的另一个报成断开', async () => {
    const database = createDatabase();
    await database.connect('sqlite');
    await database.connect('remote');
    const aggregated: boolean[] = [];
    database.connected$.subscribe(connected => aggregated.push(connected));

    await database.disconnect('remote');

    expect(await firstValueFrom(database.adapterConnected$('remote'))).toBe(false);
    expect(await firstValueFrom(database.adapterConnected$('sqlite'))).toBe(true);
    expect(aggregated).toEqual([true]);
  });

  // `use()` 是同步的、返回 `this`，它自己没有报错的出口；文档因此把出口指给了「后续
  // `connect()`」。但已连接的适配器再 `connect()` 只会命中 `#connect_promise_map` 里那条
  // **早就 resolve 掉的**旧 Promise —— 插件安装那一段根本不会重跑，失败于是只剩一行
  // console.error。用户看到的是「connect() 成功了」，而插件其实没装上。
  it('连上之后 use() 的插件安装失败，由后续 connect() 传播', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();
    await database.connect('sqlite');

    const install = vi.fn(async () => {
      throw new Error('late install boom');
    });
    database.use((): IRxDBPlugin => ({ name: 'lateFailing', install, destroy: async () => undefined }));

    await expect(database.connect('sqlite')).rejects.toThrow('late install boom');
    expect(install).toHaveBeenCalledTimes(1);
    // 同一个错误反复报，而不是重跑一遍安装：`install()` 没有幂等契约
    await expect(database.connect('sqlite')).rejects.toThrow('late install boom');
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('安装失败的插件不会被重跑，且该适配器回滚为未连接', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();
    const install = vi.fn(async () => {
      throw new Error('install boom');
    });
    database.use((): IRxDBPlugin => ({ name: 'failingPlugin', install, destroy: async () => undefined }));
    const local = track(database, 'sqlite');

    await expect(database.connect('sqlite')).rejects.toThrow('install boom');
    // 引导期短暂置位过 true，失败后必须落回 false，否则插件会以为表已就绪
    expect(local.emissions).toEqual([false, true, false]);

    await expect(database.connect('sqlite')).rejects.toThrow('install boom');
    // install() 没有幂等契约：重跑会在半成品上再来一遍，第二次的报错还会盖掉真实原因
    expect(install).toHaveBeenCalledTimes(1);

    // disconnectAll() 经 #shutdown 清空安装记录，这是失败插件唯一的解锁点
    await database.disconnectAll();
    await expect(database.connect('sqlite')).rejects.toThrow('install boom');

    expect(install).toHaveBeenCalledTimes(2);
  });
});
