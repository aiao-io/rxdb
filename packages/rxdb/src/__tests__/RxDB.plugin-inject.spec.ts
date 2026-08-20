/**
 * `inject` 依赖声明在宿主侧的运行时行为（US-015 AC#1～#5、#7、#9～#11）。
 *
 * 这里守的是「装载时机」这一半，与 [RxDB.plugin-scope.spec.ts](./RxDB.plugin-scope.spec.ts)
 * 守的「拆卸」互补：
 * 1. 依赖未满足的插件**不装、不产生作用域、也不被 `connect()` 等待**——INV-4，
 *    在它之前搜索插件只能靠「`adapterConnected$` 必须早于插件安装置位」这条时序约定绕开死锁；
 * 2. 依赖失效时释放**只**波及靠它活着的那个插件，且释放早于 `adapter.disconnect()`（INV-7）；
 * 3. 纪元按**实例引用**判定：同名适配器换了新实例照样重装，而同一纪元内失败不自动重试（INV-3 / INV-6）。
 *
 * 纯内存的纪元代数（同名新实例、单趟扫描）在
 * [dependency-scheduler.spec.ts](../plugin/__tests__/dependency-scheduler.spec.ts) 里用假宿主测，
 * 那些没有公开 API 能驱动。
 */
import type { LifecycleScope } from '@aiao/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import type { IRxDBAdapter, RxDBAdapterLocalBase } from '../rxdb-adapter.js';
import type { IRxDBPlugin } from '../rxdb-plugin.js';
import { RxDB } from '../RxDB.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

/** `createTables` 声明在本地适配器基类上，`IRxDBAdapter` 不含它；假适配器两边都实现了。 */
type LocalAdapterMock = IRxDBAdapter & Pick<RxDBAdapterLocalBase, 'createTables'>;

const databases = new Set<RxDB>();
let databaseSequence = 0;

/** 每次工厂调用都建**新实例**：断连重连时 `#adapter_map` 已清空，于是拿到的是另一个引用（AC#6）。 */
function createDatabase(): { database: RxDB; localAdapters: LocalAdapterMock[]; remoteAdapters: IRxDBAdapter[] } {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-plugin-inject-${databaseSequence}`,
    entities: [],
    sync: { local: { adapter: 'sqlite' }, remote: { adapter: 'remote' }, type: SyncType.Full }
  });
  const localAdapters: LocalAdapterMock[] = [];
  const remoteAdapters: IRxDBAdapter[] = [];
  database.adapter('sqlite', () => {
    const adapter = createMockAdapter() as LocalAdapterMock;
    localAdapters.push(adapter);
    return adapter;
  });
  database.adapter('remote', () => {
    const adapter = createMockAdapter();
    remoteAdapters.push(adapter);
    return adapter;
  });
  databases.add(database);
  return { database, localAdapters, remoteAdapters };
}

/** 让出一个宏任务：作用域释放是串行 `await` 链，同步断言会跑在它前面。 */
const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

/** 记录安装次数与每次拿到的作用域的探针插件。 */
interface ProbePlugin extends IRxDBPlugin {
  readonly scopes: LifecycleScope[];
  readonly released: string[];
}

/**
 * 建一个声明了 `inject` 的探针插件。
 *
 * @param name - 插件名
 * @param inject - 依赖声明
 * @param body - 安装体，返回值会被宿主 `await`（用于制造挂起 / 失败的安装）
 */
function probe(
  name: Uncapitalize<string>,
  inject: IRxDBPlugin['inject'],
  body?: (scope: LifecycleScope) => void | Promise<void>
): ProbePlugin {
  const scopes: LifecycleScope[] = [];
  const released: string[] = [];
  return {
    name,
    inject,
    lifecycle: 'scoped',
    released,
    scopes,
    install: scope => {
      scopes.push(scope);
      scope.acquire(() => () => void released.push(name), `${name}:entry`);
      return body?.(scope);
    }
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

describe('AC#1 / AC#2 声明依赖后由宿主决定装载时机', () => {
  it('AC#1 连接之前不安装、不产生作用域、也不报错；不声明 inject 的照常立即安装', () => {
    const { database } = createDatabase();
    const injecting = probe('injecting', ['adapter:local']);
    const plain = probe('plain', undefined);
    database.use(() => injecting);
    database.use(() => plain);

    // init() 是全部插件的安装点；声明了依赖的那个此刻依赖还没就绪
    expect(() => database.init()).not.toThrow();

    expect(injecting.scopes).toHaveLength(0);
    expect(plain.scopes).toHaveLength(1);
  });

  it('AC#2 connect() 之后安装，且**在 connect() resolve 之前**装完', async () => {
    const { database, localAdapters } = createDatabase();
    let adapterAtInstall: IRxDBAdapter | undefined;
    let tablesCreatedAtInstall = 0;
    const injecting = probe('injecting', ['adapter:local'], () => {
      // 依赖就绪 = 引导链跑完，不只是「适配器对象存在」
      adapterAtInstall = database.localAdapterSync;
      tablesCreatedAtInstall = vi.mocked(localAdapters[0].createTables).mock.calls.length;
    });
    database.use(() => injecting);

    await database.connect('sqlite');

    expect(injecting.scopes).toHaveLength(1);
    expect(injecting.scopes[0].state).toBe('active');
    // 拿到的是宿主为本纪元记账的那一个实例，不是按名字重新解析出来的另一个
    expect(adapterAtInstall).toBe(localAdapters[0]);
    expect(tablesCreatedAtInstall).toBe(1);
  });

  it('AC#2 安装作用域挂在连接纪元作用域下，断连随之释放', async () => {
    const { database } = createDatabase();
    const injecting = probe('injecting', ['adapter:local']);
    database.use(() => injecting);

    await database.connect('sqlite');
    await database.disconnectAll();

    expect(injecting.released).toEqual(['injecting']);
    expect(injecting.scopes[0].state).toBe('disposed');
  });
});

describe('AC#3 / AC#11 依赖不满足不挂起 connect()', () => {
  it('AC#3 只连了 local，声明 remote 的插件不装，connect() 照常 resolve', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { database } = createDatabase();
    const blocked = probe('blocked', ['adapter:remote']);
    const free = probe('free', ['adapter:local']);
    database.use(() => blocked);
    database.use(() => free);

    // 不设超时也不该挂起：未满足的插件从不进入安装等待集合（INV-4）
    await database.connect('sqlite');

    expect(blocked.scopes).toHaveLength(0);
    expect(free.scopes).toHaveLength(1);
  });

  it('AC#11 依赖永远不满足时只 warn 一次，并列出缺失项', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { database } = createDatabase();
    database.use(() => probe('lonely', ['adapter:remote', 'plugin:nobody']));

    await database.connect('sqlite');
    // 再来几轮扫描：`use()` 与重连都会触发 reconcile，警告不该跟着次数增长
    database.use(() => probe('other', undefined));
    await database.connect('sqlite');

    const warnings = warn.mock.calls.filter(([message]) => String(message).includes("Plugin 'lonely'"));
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0][0])).toContain('adapter:remote');
    // 阶段 A 不解析 plugin:*，声明它的插件停在等待态并一起列进缺失项，而不是静默消失
    expect(String(warnings[0][0])).toContain('plugin:nobody');
  });
});

describe('AC#4 / AC#5 依赖失效与回归', () => {
  it('AC#4 disconnect(remote) 只释放靠它活着的那个插件，且释放早于 adapter.disconnect()', async () => {
    const { database, remoteAdapters } = createDatabase();
    const log: string[] = [];
    const onRemote: IRxDBPlugin = {
      name: 'onRemote',
      inject: ['adapter:remote'],
      lifecycle: 'scoped',
      install: scope => void scope.acquire(() => () => void log.push('release:onRemote'), 'onRemote:entry')
    };
    const onLocal: IRxDBPlugin = {
      name: 'onLocal',
      inject: ['adapter:local'],
      lifecycle: 'scoped',
      install: scope => void scope.acquire(() => () => void log.push('release:onLocal'), 'onLocal:entry')
    };
    database.use(() => onRemote);
    database.use(() => onLocal);

    await database.connect('sqlite');
    await database.connect('remote');
    vi.mocked(remoteAdapters[0].disconnect).mockImplementation(async () => void log.push('adapter:disconnect'));

    await database.disconnect('remote');

    // INV-7：插件的撤销条目多半还要用这条连接，适配器先断开会让它们跑在已关闭的连接上
    expect(log).toEqual(['release:onRemote', 'adapter:disconnect']);
    // 局部断连不波及别的插件
    expect(log).not.toContain('release:onLocal');
  });

  it('AC#5 重连 remote 用**全新作用域**重装，不产生双份注册', async () => {
    const { database } = createDatabase();
    const scopes: LifecycleScope[] = [];
    let installs = 0;
    database.use((): IRxDBPlugin => ({
      name: 'onRemote',
      inject: ['adapter:remote'],
      lifecycle: 'scoped',
      install: scope => {
        installs += 1;
        scopes.push(scope);
        scope.acquire(() => () => undefined, 'onRemote:entry');
      }
    }));

    await database.connect('sqlite');
    await database.connect('remote');
    expect(installs).toBe(1);

    await database.disconnect('remote');
    await tick();
    expect(scopes[0].state).toBe('disposed');

    // 插件实例仍留在 #plugin_map 里，无需重新 use()
    await database.connect('remote');

    expect(installs).toBe(2);
    expect(scopes).toHaveLength(2);
    expect(scopes[1]).not.toBe(scopes[0]);
    expect(scopes[1].state).toBe('active');
  });

  it('AC#10 反复 disconnect / connect 不叠加注册，条目数恒定', async () => {
    const { database } = createDatabase();
    const releases: string[] = [];
    const scopes: LifecycleScope[] = [];
    database.use((): IRxDBPlugin => ({
      name: 'cycling',
      inject: ['adapter:remote'],
      lifecycle: 'scoped',
      install: scope => {
        scopes.push(scope);
        scope.acquire(() => () => void releases.push('a'), 'cycling:a');
        scope.acquire(() => () => void releases.push('b'), 'cycling:b');
      }
    }));

    await database.connect('sqlite');
    for (let round = 0; round < 3; round += 1) {
      await database.connect('remote');
      await database.disconnect('remote');
      await tick();
    }

    expect(scopes).toHaveLength(3);
    expect(new Set(scopes).size).toBe(3);
    // 逆序释放，每一轮各一次——幂等且不累积
    expect(releases).toEqual(['b', 'a', 'b', 'a', 'b', 'a']);
  });
});

describe('AC#7 安装在飞期间依赖失效', () => {
  it('成功的结果照样丢弃：插件不进入 active，作用域恰好释放一次', async () => {
    const { database } = createDatabase();
    let finishInstall: (() => void) | undefined;
    const scopes: LifecycleScope[] = [];
    const releases: string[] = [];
    database.use((): IRxDBPlugin => ({
      name: 'slow',
      inject: ['adapter:remote'],
      lifecycle: 'scoped',
      install: scope => {
        scopes.push(scope);
        scope.acquire(() => () => void releases.push('slow'), 'slow:entry');
        return new Promise<void>(resolve => {
          finishInstall = resolve;
        });
      }
    }));

    await database.connect('sqlite');
    const connecting = database.connect('remote');
    await vi.waitFor(() => expect(finishInstall).toBeTypeOf('function'));

    // 依赖在安装挂起期间断开
    const disconnecting = database.disconnect('remote');
    await tick();
    // 现在才成功：这份成果绑在一条已经作废的连接上
    finishInstall?.();
    await connecting;
    await disconnecting;
    await tick();

    expect(scopes).toHaveLength(1);
    expect(scopes[0].state).toBe('disposed');
    // 「恰好一次」：调度器统一回滚，宿主的 #track_plugin_install 不再自己释放一遍
    expect(releases).toEqual(['slow']);
  });
});

describe('AC#9 安装失败与纪元绑定', () => {
  it('同一纪元内不自动重试，纪元变了恰好重试一次', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { database, localAdapters } = createDatabase();
    const scopes: LifecycleScope[] = [];
    const releases: string[] = [];
    let installs = 0;
    const failing = (): IRxDBPlugin => ({
      name: 'failing',
      inject: ['adapter:local'],
      lifecycle: 'scoped',
      install: async scope => {
        installs += 1;
        scopes.push(scope);
        scope.acquire(() => () => void releases.push('failing'), 'failing:entry');
        await tick();
        throw new Error(`install boom #${installs}`);
      }
    });

    // remote 先连上，这样后面 disconnect('sqlite') 不会触发全局停机
    await database.connect('remote');
    // 装在 connect 之后：`use()` 自己发起安装，失败不经由任何 connect() 传播
    await database.connect('sqlite');
    database.use(failing);
    await vi.waitFor(() => expect(installs).toBe(1));
    await tick();

    // 失败已落地：作用域被回滚，且恰好释放一次
    expect(scopes[0].state).toBe('disposed');
    expect(releases).toEqual(['failing']);

    // 同一纪元内再扫多少趟都不重试——install() 没有幂等契约，重跑是在半成品上再来一遍
    database.use(() => probe('bystander', undefined));
    await tick();
    expect(installs).toBe(1);

    // 换纪元：同名 sqlite 换了新实例（工厂重新调用），这才是一次合法的重装。
    // 重装仍在 connect() 的等待集合里，所以这次失败照 AC#2 从 connect() 抛出来。
    await database.disconnect('sqlite');
    await expect(database.connect('sqlite')).rejects.toThrow('install boom #2');
    await tick();

    expect(localAdapters).toHaveLength(2);
    expect(localAdapters[1]).not.toBe(localAdapters[0]);
    // **恰好**一次，不是重试风暴
    expect(installs).toBe(2);
    expect(scopes[1]).not.toBe(scopes[0]);
    expect(releases).toEqual(['failing', 'failing']);
  });

  it('安装失败经 connect() 传播，且失败的插件不拖住别的插件', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { database } = createDatabase();
    const healthy = probe('healthy', ['adapter:local']);
    database.use((): IRxDBPlugin => ({
      name: 'broken',
      inject: ['adapter:local'],
      lifecycle: 'scoped',
      install: () => Promise.reject(new Error('install boom'))
    }));
    database.use(() => healthy);

    await expect(database.connect('sqlite')).rejects.toThrow('install boom');

    expect(healthy.scopes).toHaveLength(1);
  });
});

describe('localAdapterSync', () => {
  it('未连接时抛错而不是返回空值', () => {
    const { database } = createDatabase();

    expect(() => database.localAdapterSync).toThrow("local adapter 'sqlite' is not connected");
  });

  it('未配置 sync.local 时抛的是「未配置」', () => {
    const database = new RxDB({
      dbName: 'rxdb-plugin-inject-remote-only',
      entities: [],
      // 只配远程（`SyncType.None` 下 `local` 可省）：`adapter:local` 解析不出任何名字
      sync: { remote: { adapter: 'remote' }, type: SyncType.None }
    });
    databases.add(database);

    expect(() => database.localAdapterSync).toThrow('local adapter is not configured');
  });

  it('断连之后重新抛错：不留着上一纪元的实例', async () => {
    const { database, localAdapters } = createDatabase();

    await database.connect('sqlite');
    expect(database.localAdapterSync).toBe(localAdapters[0]);

    await database.disconnectAll();

    expect(() => database.localAdapterSync).toThrow('is not connected');
  });
});
