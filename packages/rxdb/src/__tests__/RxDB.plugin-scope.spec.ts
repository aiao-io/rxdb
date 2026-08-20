/**
 * 插件作用域契约的运行时行为（US-014 AC#1～#5、#7、#8、#12～#17、#21～#23）。
 *
 * 这里守的是宿主侧的三件事：
 * 1. 连接纪元作用域的寿命 —— `init()` 创建、`#shutdown()` 释放、重连全新一个；
 * 2. 插件激活作用域的释放顺序 —— 逆插入序、**串行**，且不短路；
 * 3. 安装**半途失败**时由宿主回收部分登记 —— 这是新契约独有的失败模式：
 *    旧契约下 `install()` 抛错只是「没装成」，新契约下宿主已经替插件拿着一份部分清单。
 */
import { LifecycleScope, LifecycleScopeDisposedError } from '@aiao/utils';
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
    dbName: `rxdb-plugin-scope-${databaseSequence}`,
    entities: [],
    sync: { local: { adapter: 'sqlite' }, remote: { adapter: 'remote' }, type: SyncType.Full }
  });
  database.adapter('sqlite', () => createMockAdapter());
  database.adapter('remote', () => createMockAdapter());
  databases.add(database);
  return database;
}

/** 让出一个宏任务：作用域释放是串行 `await` 链，同步断言会跑在它前面。 */
const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

/**
 * 在 `scope` 上登记一条异步撤销的条目，把 `start` / `end` 两个时刻写进 `log`。
 *
 * @remarks
 * 两个时刻缺一不可：只记一个时刻时，`Promise.all` 并发与串行循环produce 的顺序可能相同，
 * 断言分辨不出 AC#1 要的「串行」。
 */
function acquireTraced(scope: LifecycleScope, log: string[], label: string): void {
  scope.acquire(
    () => async () => {
      log.push(`${label}:start`);
      await tick();
      log.push(`${label}:end`);
    },
    label
  );
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

describe('连接纪元作用域与插件激活作用域', () => {
  it('AC#1 三个插件按逆插入序串行释放，插件内条目同样逆序', async () => {
    const database = createDatabase();
    const log: string[] = [];
    for (const name of ['a', 'b', 'c'] as const) {
      database.use((): IRxDBPlugin => ({
        name,
        lifecycle: 'scoped',
        install: scope => {
          acquireTraced(scope, log, `${name}1`);
          acquireTraced(scope, log, `${name}2`);
        }
      }));
    }

    await database.connect('sqlite');
    log.length = 0;
    await database.disconnectAll();

    // 串行：每条的 end 紧跟自己的 start；并发的话三个 start 会连在一起
    expect(log).toEqual(
      ['c', 'b', 'a'].flatMap(name => ['2', '1'].flatMap(entry => [`${name}${entry}:start`, `${name}${entry}:end`]))
    );
  });

  it('AC#2 / AC#16 重连拿到全新作用域，上一轮条目不会被二次释放', async () => {
    const database = createDatabase();
    const scopes: LifecycleScope[] = [];
    const releases: number[] = [];
    database.use((): IRxDBPlugin => ({
      name: 'epochPlugin',
      lifecycle: 'scoped',
      install: scope => {
        const epoch = scopes.push(scope);
        scope.acquire(() => () => void releases.push(epoch), 'entry');
      }
    }));

    await database.connect('sqlite');
    await database.disconnectAll();
    // 已 disposed 的连接纪元作用域上再 child() 会抛 LifecycleScopeDisposedError
    await database.connect('sqlite');

    expect(scopes).toHaveLength(2);
    expect(scopes[1]).not.toBe(scopes[0]);
    expect(scopes[0].state).toBe('disposed');
    expect(scopes[1].state).toBe('active');
    expect(releases).toEqual([1]);

    await database.disconnectAll();

    expect(releases).toEqual([1, 2]);
  });

  it('AC#3 init() 之后 use() 的插件立即拿到独立作用域并参与逆序释放', async () => {
    const database = createDatabase();
    const log: string[] = [];
    database.use((): IRxDBPlugin => ({
      name: 'early',
      lifecycle: 'scoped',
      install: scope => void scope.acquire(() => () => void log.push('early'), 'entry')
    }));
    await database.connect('sqlite');

    let lateScope: LifecycleScope | undefined;
    database.use((): IRxDBPlugin => ({
      name: 'late',
      lifecycle: 'scoped',
      install: scope => {
        lateScope = scope;
        scope.acquire(() => () => void log.push('late'), 'entry');
      }
    }));

    // 只断言被测的这一个立即安装：US-015 落地后「所有插件都立即安装」不再成立
    expect(lateScope?.state).toBe('active');

    await database.disconnectAll();

    expect(log).toEqual(['late', 'early']);
    expect(lateScope?.state).toBe('disposed');
  });

  it('AC#4 声明 lifecycle:scoped 的插件不再被调用 destroy()', async () => {
    const database = createDatabase();
    const destroy = vi.fn();
    const log: string[] = [];
    database.use((): IRxDBPlugin => ({
      name: 'dualVersion',
      lifecycle: 'scoped',
      install: scope => void scope.acquire(() => () => void log.push('release'), 'entry'),
      destroy
    }));

    await database.connect('sqlite');
    await database.disconnectAll();

    expect(log).toEqual(['release']);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('AC#5 / AC#6 未声明 lifecycle 的旧插件：先释放作用域再调用 destroy()', async () => {
    const database = createDatabase();
    const log: string[] = [];
    // 无参 install()：实现方少写形参不破坏契约
    const install = vi.fn(() => void log.push('install'));
    database.use((): IRxDBPlugin => ({
      name: 'legacy',
      install,
      destroy: () => void log.push('destroy')
    }));

    await database.connect('sqlite');
    await database.disconnectAll();

    expect(install).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['install', 'destroy']);
  });

  it('AC#21 只声明 lifecycle、不实现 destroy 的插件不会在拆卸路径抛 TypeError', async () => {
    const database = createDatabase();
    database.use((): IRxDBPlugin => ({ name: 'pureScoped', lifecycle: 'scoped', install: () => undefined }));

    await database.connect('sqlite');

    await expect(database.disconnectAll()).resolves.toBeUndefined();
  });
});

describe('repository() 的作用域撤销', () => {
  it('AC#7 传了 scope 的注册在拆卸后消失', async () => {
    const database = createDatabase();
    const base = database.getRepositoryConfig('Repository');
    if (!base) throw new Error('Repository config missing');
    database.use((): IRxDBPlugin => ({
      name: 'graphLike',
      lifecycle: 'scoped',
      install: scope => void database.repository('ScopedRepository', { ...base }, scope)
    }));

    await database.connect('sqlite');

    expect(database.getRepositoryConfig('ScopedRepository')).toBeDefined();

    await database.disconnectAll();

    expect(database.getRepositoryConfig('ScopedRepository')).toBeUndefined();
  });

  it('AC#8 撤销按配置对象身份守卫，不删后来者的注册', async () => {
    const database = createDatabase();
    const base = database.getRepositoryConfig('Repository');
    if (!base) throw new Error('Repository config missing');
    const first = { ...base };
    const second = { ...base };
    const firstScope = new LifecycleScope('first');
    const secondScope = new LifecycleScope('second');

    database.repository('SharedRepository', first, firstScope);
    database.repository('SharedRepository', second, secondScope);

    expect(database.getRepositoryConfig('SharedRepository')).toBe(second);

    await firstScope.dispose();

    expect(database.getRepositoryConfig('SharedRepository')).toBe(second);

    await secondScope.dispose();

    expect(database.getRepositoryConfig('SharedRepository')).toBeUndefined();
  });

  it('传已释放的 scope 时同步抛错且不落下注册（US-013 AC#5 沿宿主 API 传导）', async () => {
    const database = createDatabase();
    const base = database.getRepositoryConfig('Repository');
    if (!base) throw new Error('Repository config missing');
    const scope = new LifecycleScope('stale');
    await scope.dispose();

    // 静默登记会更糟：注册进了配置表，而撤销它的那一半永远不会跑
    expect(() => database.repository('StaleRepository', { ...base }, scope)).toThrow(LifecycleScopeDisposedError);
    expect(database.getRepositoryConfig('StaleRepository')).toBeUndefined();
  });

  it('不传 scope 时行为与改造前一致：注册跨纪元存活', async () => {
    const database = createDatabase();
    const base = database.getRepositoryConfig('Repository');
    if (!base) throw new Error('Repository config missing');

    expect(database.repository('StaticRepository', { ...base })).toBe(database);

    await database.connect('sqlite');
    await database.disconnectAll();

    expect(database.getRepositoryConfig('StaticRepository')).toBeDefined();
  });
});

describe('安装半途失败时的资源回收', () => {
  it('AC#12 同步 throw：已登记条目逆序释放，安装错误原样传播', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();
    const log: string[] = [];
    database.use((): IRxDBPlugin => ({
      name: 'syncFailing',
      lifecycle: 'scoped',
      install: scope => {
        scope.acquire(() => () => void log.push('a'), 'a');
        scope.acquire(() => () => void log.push('b'), 'b');
        throw new Error('install boom');
      }
    }));

    await expect(database.connect('sqlite')).rejects.toThrow('install boom');

    expect(log).toEqual(['b', 'a']);
  });

  it('AC#13 / AC#15 async reject：条目回收，失败作用域已 disposed 且下一纪元换新的', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();
    const log: string[] = [];
    const scopes: LifecycleScope[] = [];
    database.use((): IRxDBPlugin => ({
      name: 'asyncFailing',
      lifecycle: 'scoped',
      install: async scope => {
        scopes.push(scope);
        scope.acquire(() => () => void log.push('a'), 'a');
        await tick();
        scope.acquire(() => () => void log.push('b'), 'b');
        throw new Error('install boom');
      }
    }));

    await expect(database.connect('sqlite')).rejects.toThrow('install boom');

    expect(log).toEqual(['b', 'a']);
    expect(scopes[0].state).toBe('disposed');

    // #shutdown 是失败插件唯一的解锁点；重试用的是全新作用域，不复用失败的那个
    await database.disconnectAll();
    await expect(database.connect('sqlite')).rejects.toThrow('install boom');

    expect(scopes).toHaveLength(2);
    expect(scopes[1]).not.toBe(scopes[0]);
    expect(log).toEqual(['b', 'a', 'b', 'a']);
  });

  it('AC#14 回收期间的清理错误不覆盖安装错误', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();
    const cleanupError = new Error('cleanup boom');
    const log: string[] = [];
    database.use((): IRxDBPlugin => ({
      name: 'messyFailing',
      lifecycle: 'scoped',
      install: scope => {
        scope.acquire(() => () => void log.push('a'), 'a');
        scope.acquire(
          () => () => {
            throw cleanupError;
          },
          'b'
        );
        throw new Error('install boom');
      }
    }));

    // connect() 收到的是安装错误（原因），不是清理错误
    await expect(database.connect('sqlite')).rejects.toThrow('install boom');
    // 清理不短路：抛错的 b 之后 a 照常释放
    expect(log).toEqual(['a']);
    // 清理错误按 D5 在 RxDB 边界 console.error，两个错误都被保留
    expect(consoleError.mock.calls.flat()).toContain(cleanupError);
  });
});

describe('拆卸错误的隔离', () => {
  it('AC#17 一个 disposer 抛错不影响同插件其余条目与其他插件', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();
    const disposeError = new Error('dispose boom');
    const log: string[] = [];
    database.use((): IRxDBPlugin => ({
      name: 'healthy',
      lifecycle: 'scoped',
      install: scope => void scope.acquire(() => () => void log.push('healthy'), 'entry')
    }));
    database.use((): IRxDBPlugin => ({
      name: 'brokenTeardown',
      lifecycle: 'scoped',
      install: scope => {
        scope.acquire(() => () => void log.push('broken:first'), 'first');
        scope.acquire(
          () => () => {
            throw disposeError;
          },
          'second'
        );
        scope.acquire(() => () => void log.push('broken:third'), 'third');
      }
    }));

    await database.connect('sqlite');

    // 与本故事前一致：拆卸错误仍在 RxDB 边界被吞掉，disconnectAll() 一定 resolve（D5）
    await expect(database.disconnectAll()).resolves.toBeUndefined();
    expect(log).toEqual(['broken:third', 'broken:first', 'healthy']);
    expect(consoleError.mock.calls.flat()).toContain(disposeError);
  });
});

describe('init() 失败路径与作用域寿命对齐', () => {
  it('AC#22 / AC#23 init() 抛错时释放并置空纪元作用域，重新 init() 装进全新的', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();
    const log: string[] = [];
    const scopes: LifecycleScope[] = [];
    database.use((): IRxDBPlugin => ({
      name: 'rollbackPlugin',
      lifecycle: 'scoped',
      install: scope => {
        scopes.push(scope);
        scope.acquire(() => () => void log.push('release'), 'entry');
      }
    }));
    const schemaInit = vi.spyOn(database.schemaManager, 'init').mockImplementationOnce(() => {
      throw new Error('schema boom');
    });

    // #install_plugin() 在 try 之外，插件已经装了半套
    expect(() => database.init()).toThrow('schema boom');
    await tick();

    expect(scopes).toHaveLength(1);
    expect(scopes[0].state).toBe('disposed');
    expect(log).toEqual(['release']);

    schemaInit.mockRestore();
    database.init();

    // 不是叠在上一轮的半成品上，也不产生双份注册
    expect(scopes).toHaveLength(2);
    expect(scopes[1]).not.toBe(scopes[0]);
    expect(scopes[1].state).toBe('active');

    await database.disconnectAll();

    expect(log).toEqual(['release', 'release']);
  });

  it('init() 抛错后**同步**重试：新纪元照常安装，不被上一纪元尚未跑完的撤销挡住', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();
    const scopes: LifecycleScope[] = [];
    // 与 workspace / storage 的「本纪元已装」守卫同形：以某个实例字段是否有值来判断。
    // 上一纪元的撤销把这个字段清空，新纪元的 install() 才能重新登记。
    let handle: object | undefined;
    database.use((): IRxDBPlugin => ({
      name: 'guardedPlugin',
      lifecycle: 'scoped',
      install: scope => {
        if (handle !== undefined) return;
        scopes.push(scope);
        scope.acquire(() => {
          handle = {};
          return () => void (handle = undefined);
        }, 'guarded:handle');
        // 守卫字段之后还有别的条目——与 workspace 同形（`workspace:store` 之后还有
        // channel / 监听器 / 事件泵）。逆序释放下清空守卫字段的那一条**不是第一个**跑的，
        // 于是它落在 `await` 之后：同步段结束时字段仍是上一纪元的残值。
        scope.acquire(() => () => undefined, 'guarded:later');
      }
    }));
    const schemaInit = vi.spyOn(database.schemaManager, 'init').mockImplementationOnce(() => {
      throw new Error('schema boom');
    });

    expect(() => database.init()).toThrow('schema boom');
    // 关键：**不** await —— init() 是同步 API，修好配置后紧接着重试是被明确支持的路径，
    // 而此刻上一纪元的 disposer 一条都还没跑（作用域释放整条链都在微任务里）。
    schemaInit.mockRestore();
    database.init();
    await tick();

    expect(scopes).toHaveLength(2);
    expect(scopes[1]).not.toBe(scopes[0]);
    expect(scopes[0].state).toBe('disposed');
    expect(scopes[1].state).toBe('active');
    // 新纪元真的登记了东西：守卫读到的是上一纪元清空后的值，不是残值
    expect(scopes[1].getEntries()).toEqual([
      { label: 'guarded:handle', children: [] },
      { label: 'guarded:later', children: [] }
    ]);
    expect(handle).toBeDefined();

    await database.disconnectAll();

    expect(handle).toBeUndefined();
  });
});

describe('停机窗口与跨纪元迟到任务', () => {
  it('停机期间 use() 只登记不安装，插件留到下一次 init() 才装进新纪元', async () => {
    const database = createDatabase();
    const log: string[] = [];
    let openGate: (() => void) | undefined;
    let gated = false;
    database.use((): IRxDBPlugin => ({
      name: 'slowTeardown',
      lifecycle: 'scoped',
      install: scope =>
        void scope.acquire(
          () => () => {
            // 只卡第一次停机：第二次要能自己跑完，否则测尾的 disconnectAll() 无人开闸
            if (gated) return undefined;
            gated = true;
            return new Promise<void>(resolve => {
              openGate = resolve;
            });
          },
          'gate'
        )
    }));
    await database.connect('sqlite');

    // 停机卡在闸门上：此刻 #rxdb_initialized 仍为 true，而纪元正在拆
    const shutdown = database.disconnectAll();
    await vi.waitFor(() => expect(openGate).toBeTypeOf('function'));

    const scopes: LifecycleScope[] = [];
    database.use((): IRxDBPlugin => ({
      name: 'lateUse',
      lifecycle: 'scoped',
      install: scope => {
        scopes.push(scope);
        scope.acquire(() => () => void log.push('lateUse'), 'entry');
      }
    }));

    // 装进正在释放的旧纪元会被立刻拆掉；装进新建的纪元则整条作用域逃出本次停机
    expect(scopes).toHaveLength(0);

    openGate?.();
    await shutdown;

    expect(scopes).toHaveLength(0);
    expect(log).toEqual([]);

    await database.connect('sqlite');

    // 只安装一次：逃出停机的纪元被下一次 init() 复用时，这里会是 2
    expect(scopes).toHaveLength(1);
    expect(scopes[0].state).toBe('active');

    await database.disconnectAll();

    expect(log).toEqual(['lateUse']);
    expect(scopes[0].state).toBe('disposed');
  });

  it('停机后才恢复的在飞 connect() 不把插件重装进一个 init() 从没走过的纪元', async () => {
    const database = createDatabase();
    const scopes: LifecycleScope[] = [];
    let openRemote: (() => void) | undefined;
    // remote 端卡在 adapter.connect() 上：还没走到 #await_plugin_installs 就被停机越过去了
    database.adapter('remote', () => {
      const adapter = createMockAdapter();
      adapter.connect = vi.fn(
        () =>
          new Promise<void>(resolve => {
            openRemote = resolve;
          })
      );
      return adapter;
    });
    database.use((): IRxDBPlugin => ({
      name: 'inFlight',
      lifecycle: 'scoped',
      install: scope => void scopes.push(scope)
    }));

    await database.connect('sqlite');
    expect(scopes).toHaveLength(1);

    const connecting = database.connect('remote');
    await vi.waitFor(() => expect(openRemote).toBeTypeOf('function'));

    await database.disconnectAll();
    expect(scopes[0].state).toBe('disposed');

    // 闸门开在停机**之后**：#shutting_down 已复位、#plugin_install_promises 已清空，
    // 只判 #shutting_down 的话这里会补装一遍——装进 #ensure_connection_scope() 顺手新建、
    // 而 init() 从没走过的纪元，那时 entityManager / 网关都已经拆掉了
    openRemote?.();
    await connecting;
    await tick();

    expect(scopes).toHaveLength(1);

    await database.connect('sqlite');

    // 下一次 init() 才是合法的安装点：这里是 2 而不是 3
    expect(scopes).toHaveLength(2);
    expect(scopes[1].state).toBe('active');
  });

  it('旧纪元安装失败的回收不删新纪元的插件作用域', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();
    const log: string[] = [];
    let failFirstInstall: ((reason: Error) => void) | undefined;
    let installs = 0;
    // 不声明 lifecycle：宿主先释放作用域再调 destroy()，两者的先后正是本用例的判据
    database.use((): IRxDBPlugin => ({
      name: 'straggler',
      install: scope => {
        installs += 1;
        scope.acquire(() => () => void log.push('entry'), 'entry');
        if (installs > 1) return undefined;
        return new Promise<void>((_, reject) => {
          failFirstInstall = reject;
        });
      },
      destroy: () => void log.push('destroy')
    }));

    // 第一纪元的 install 挂着不结算，connect() 会一直等它
    const connecting = database.connect('sqlite');
    void connecting.catch(() => undefined);
    await vi.waitFor(() => expect(failFirstInstall).toBeTypeOf('function'));

    await database.disconnectAll();
    expect(log).toEqual(['entry', 'destroy']);

    // 第二纪元正常装好，#plugin_scopes 里是新作用域
    await database.connect('sqlite');
    expect(installs).toBe(2);

    // 旧纪元的安装现在才失败：它的回收只该碰自己那一个作用域
    failFirstInstall?.(new Error('stale install boom'));
    await expect(connecting).rejects.toThrow('stale install boom');
    await tick();

    await database.disconnectAll();

    // 映射被旧任务抹掉时，#destroy_plugin 找不到 scope，条目改由纪元总闸在 destroy() 之后释放
    expect(log).toEqual(['entry', 'destroy', 'entry', 'destroy']);
  });
});
