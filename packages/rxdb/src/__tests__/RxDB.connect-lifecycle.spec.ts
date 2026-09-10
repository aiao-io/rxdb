import { firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import { RxDBTabsGateway } from '../gateway/RxDBTabsGateway.js';
import { ENTITY_LOCAL_CREATE_EVENT, EntityLocalCreatedEvent, type RxDBEvent } from '../rxdb-events.js';
import type { Plugin } from '../rxdb-plugin.js';
import type { RxDBOptions } from '../rxdb.interface.js';
import { RxDB } from '../RxDB.js';
import { SyncStateHub } from '../sync-state.js';
import { RxDBMigration } from '../system/migration.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

type DatabaseOverrides = {
  context?: RxDBOptions['context'];
  migrations?: RxDBOptions['migrations'];
  sync?: RxDBOptions['sync'];
};

const databases = new Set<RxDB>();
let databaseSequence = 0;

const createDatabase = (overrides: DatabaseOverrides = {}): RxDB => {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-connect-lifecycle-${databaseSequence}`,
    entities: [],
    sync: overrides.sync ?? {
      local: { adapter: 'local' },
      type: SyncType.None
    },
    context: overrides.context,
    migrations: overrides.migrations
  });
  database.adapter('local', db => createMockAdapter(db));
  databases.add(database);
  return database;
};

const disposeDatabase = async (database: RxDB): Promise<void> => {
  databases.delete(database);
  await database.disconnectAll();
};

afterEach(async () => {
  const pending = Array.from(databases);
  databases.clear();
  try {
    await Promise.all(pending.map(database => database.disconnectAll()));
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

describe('RxDB 连接、迁移与插件生命周期', () => {
  it('registers and retrieves repository configuration', () => {
    const database = createDatabase();
    const repositoryConfig = database.getRepositoryConfig('Repository');

    expect(repositoryConfig).toBeDefined();
    if (!repositoryConfig) throw new Error('Repository config missing');

    expect(database.repository('CoverageRepository', repositoryConfig)).toBe(database);
    expect(database.getRepositoryConfig('CoverageRepository')).toBe(repositoryConfig);
    expect(database.getRepositoryConfig('UnknownRepository')).toBeUndefined();
  });

  it('initializes a remote-only adapter stream without replacing a supplied client id', async () => {
    const database = createDatabase({
      context: { clientId: 'lifecycle-client' },
      sync: {
        remote: { adapter: 'remote' },
        type: SyncType.None
      }
    });
    const remoteAdapter = createMockAdapter(database);
    database.adapter('remote', () => remoteAdapter);

    database.init();

    await expect(firstValueFrom(database.remoteAdapter$)).resolves.toBe(remoteAdapter);
    expect(database.context.clientId).toBe('lifecycle-client');
  });

  it('routes gateway callbacks through the event API and exposes firstConnectedAt', async () => {
    let gatewayCallbacks: Parameters<RxDBTabsGateway['init']> | undefined;
    const connectedAt = new Date('2026-01-02T03:04:05.000Z');
    vi.spyOn(RxDBTabsGateway.prototype, 'init').mockImplementation((...callbacks) => {
      gatewayCallbacks = callbacks;
    });
    vi.spyOn(RxDBTabsGateway.prototype, 'firstConnectedAt', 'get').mockReturnValue(connectedAt);

    const database = createDatabase({ context: { clientId: 'gateway-client' } });
    expect(database.firstConnectedAt).toBeUndefined();

    database.init();

    expect(database.firstConnectedAt).toBe(connectedAt);
    if (!gatewayCallbacks) throw new Error('Gateway callbacks missing');

    const [dispatch, add, remove] = gatewayCallbacks;
    const listener = vi.fn<(event: RxDBEvent) => void>();
    const event = new EntityLocalCreatedEvent([]);
    add(ENTITY_LOCAL_CREATE_EVENT, listener);
    dispatch(event);

    expect(listener).toHaveBeenCalledWith(event);
    if (!remove) throw new Error('Gateway remove callback missing');
    remove(ENTITY_LOCAL_CREATE_EVENT, listener);
    dispatch(event);
    expect(listener).toHaveBeenCalledTimes(1);

    await disposeDatabase(database);
  });

  it('single-instance mode does not require BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const database = new RxDB({
      dbName: 'rxdb-single-instance',
      entities: [],
      multiInstance: false,
      sync: { local: { adapter: 'local' }, type: SyncType.None }
    });
    database.adapter('local', db => createMockAdapter(db));
    databases.add(database);

    expect(() => database.init()).not.toThrow();
    expect(database.firstConnectedAt).toBeUndefined();
  });

  it('shares an in-flight connection failure and retries migrations with the cached adapter', async () => {
    const migrationFailure = new Error('migration failed once');
    const alreadyApplied = vi.fn<() => Promise<void>>(async () => undefined);
    const retryMigration = vi.fn<() => Promise<void>>(async () => undefined);
    retryMigration.mockRejectedValueOnce(migrationFailure);
    const database = createDatabase({
      migrations: [
        { name: 'z-retry', up: retryMigration, down: vi.fn<() => Promise<void>>(async () => undefined) },
        { name: 'a-applied', up: alreadyApplied, down: vi.fn<() => Promise<void>>(async () => undefined) }
      ]
    });
    const adapter = createMockAdapter(database);
    const adapterFactory = vi.fn(() => adapter);
    vi.mocked(adapter.isTableExisted).mockResolvedValue(true);
    database.adapter('local', adapterFactory);
    database.init();

    const appliedRecord = new RxDBMigration();
    appliedRecord.name = 'a-applied';
    // C2 起迁移记录的读写都经 executor.getRepository(RxDBMigration)（一次性 find，
    // 不再是 entityManager 的活查询 findAll），因此桩要打在适配器仓库上
    const created: RxDBMigration[] = [];
    const repository = {
      find: vi.fn(async () => [appliedRecord]),
      count: vi.fn(async () => 1),
      create: vi.fn(async (record: RxDBMigration) => {
        created.push(record);
        return record;
      }),
      update: vi.fn(),
      remove: vi.fn()
    };
    // 只替换 RxDBMigration 的仓库：getRepository 是通用入口，全量替换会让无关实体
    // （RxDBSync / RxDBBranch 等）也命中这个桩，find 的调用次数断言随之失真
    const defaultGetRepository = adapter.getRepository.getMockImplementation();
    adapter.getRepository.mockImplementation(EntityType =>
      EntityType === RxDBMigration ? (repository as never) : (defaultGetRepository?.(EntityType) as never)
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const firstConnection = database.connect('local');
    const concurrentConnection = database.connect('local');
    await Promise.all([
      expect(firstConnection).rejects.toBe(migrationFailure),
      expect(concurrentConnection).rejects.toBe(migrationFailure)
    ]);
    await Promise.resolve();

    await expect(database.connect('local')).resolves.toBe(adapter);

    expect(adapterFactory).toHaveBeenCalledTimes(1);
    expect(vi.mocked(adapter.connect)).toHaveBeenCalledTimes(2);
    expect(repository.find).toHaveBeenCalledTimes(2);
    expect(alreadyApplied).not.toHaveBeenCalled();
    expect(retryMigration).toHaveBeenCalledTimes(2);
    // 每次尝试都先认领执行权再执行（RXD-036），失败的那次连同认领执行权一起回滚 —— 但这里的
    // `created` 是内存数组，回滚不到它，所以两次尝试各留下一条。真库上只会剩最后一条。
    // 关键契约是：只有 z-retry 认领了执行权，已执行的 a-applied 一次都没碰。
    expect(created.map(record => record.name)).toEqual(['z-retry', 'z-retry']);
    expect(vi.mocked(adapter.createTables)).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('Migration failed: z-retry', migrationFailure);
  });

  it('runs the adapter system migration before application migrations and retries without leaking forward', async () => {
    const callOrder: string[] = [];
    const systemFailure = new Error('system migration failed once');
    const migrateSystemSchema = vi.fn(async () => {
      callOrder.push('system');
    });
    migrateSystemSchema.mockRejectedValueOnce(systemFailure);
    const applicationMigration = vi.fn(async () => {
      callOrder.push('application');
    });
    const database = createDatabase({
      migrations: [
        {
          name: 'application-migration',
          up: applicationMigration,
          down: vi.fn<() => Promise<void>>(async () => undefined)
        }
      ]
    });
    const adapter = Object.assign(createMockAdapter(database), { migrateSystemSchema });
    vi.mocked(adapter.isTableExisted).mockResolvedValue(true);
    database.adapter('local', () => adapter);
    database.init();
    vi.spyOn(database.entityManager, 'getRepository').mockReturnValue({ findAll: vi.fn(() => of([])) } as never);
    vi.spyOn(RxDBMigration.prototype, 'save').mockResolvedValue(new RxDBMigration());

    await expect(database.connect('local')).rejects.toBe(systemFailure);
    expect(applicationMigration).not.toHaveBeenCalled();

    await expect(database.connect('local')).resolves.toBe(adapter);
    expect(migrateSystemSchema).toHaveBeenCalledTimes(2);
    expect(callOrder).toEqual(['system', 'application']);
  });

  it('rejects an existing database when the migration repository is unavailable', async () => {
    const database = createDatabase({
      migrations: [
        {
          name: 'missing-repository',
          up: vi.fn<() => Promise<void>>(async () => undefined),
          down: vi.fn<() => Promise<void>>(async () => undefined)
        }
      ]
    });
    const adapter = createMockAdapter(database);
    vi.mocked(adapter.isTableExisted).mockResolvedValue(true);
    database.adapter('local', () => adapter);
    database.init();
    // C2 起迁移仓库由 executor.getRepository() 提供；取不到仓库时的错误由适配器抛出，
    // 契约是**不得被吞掉**——connect() 必须带着原因失败，而不是静默跳过迁移
    const repositoryFailure = new Error('Repository for RxDBMigration is not registered');
    const defaultGetRepository = adapter.getRepository.getMockImplementation();
    // 只对 RxDBMigration 抛：getRepository 是通用入口，全局抛会让无关代码路径产生
    // 未捕获拒绝并污染同文件的其他用例
    adapter.getRepository.mockImplementation(EntityType => {
      if (EntityType === RxDBMigration) throw repositoryFailure;
      return defaultGetRepository?.(EntityType) as never;
    });

    await expect(database.connect('local')).rejects.toBe(repositoryFailure);
  });

  it('keeps global resources alive until the final adapter disconnects', async () => {
    const database = createDatabase();
    const localAdapter = createMockAdapter(database);
    const auxiliaryAdapter = createMockAdapter(database);
    const plugin = {
      name: 'lifecycle' as const,
      install: vi.fn(),
      destroy: vi.fn()
    };
    const pluginFactory: Plugin = () => plugin;
    const connectionStates: boolean[] = [];
    const connectionSubscription = database.connected$.subscribe(state => connectionStates.push(state));

    database
      .adapter('local', () => localAdapter)
      .adapter('auxiliary', () => auxiliaryAdapter)
      .use(pluginFactory);
    await database.connect('local');
    await database.connect('auxiliary');

    await database.disconnect('auxiliary');
    expect(plugin.destroy).not.toHaveBeenCalled();
    expect(connectionStates[connectionStates.length - 1]).toBe(true);

    await database.disconnect('local');
    expect(plugin.destroy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(auxiliaryAdapter.disconnect)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(localAdapter.disconnect)).toHaveBeenCalledTimes(1);
    expect(connectionStates[connectionStates.length - 1]).toBe(false);

    connectionSubscription.unsubscribe();
    databases.delete(database);
  });

  it('ignores disconnect for an adapter that was never created', async () => {
    const database = createDatabase();

    await expect(database.disconnect('missing')).resolves.toBeUndefined();
  });

  // `reachability` 在字段初始化里 new，直接挂一对 online / offline 到 globalThis 上。
  // 它跟随**实例**而不是连接纪元（见 RxDB.ts 该字段的 @remarks），所以 disconnectAll()
  // 故意不摘；那就必须另有一个终态出口来摘，否则每个 new RxDB() 都往全局上净增一对监听，
  // 多实例 / HMR / 测试按实例数线性累积。
  describe('终态 destroy()', () => {
    /** 只看 online / offline 这两类，globalThis 上还有别人的监听 */
    const networkListenerCalls = (calls: readonly unknown[][]) =>
      calls.filter(([type]) => type === 'online' || type === 'offline');

    it('摘掉挂在全局上的 online/offline 监听，而 disconnectAll() 不摘', async () => {
      const addSpy = vi.spyOn(globalThis, 'addEventListener');
      const removeSpy = vi.spyOn(globalThis, 'removeEventListener');

      const database = createDatabase();
      await database.connect('local');
      // 注册确实发生了——不然下面的「已摘干净」会因为压根没挂而假绿
      expect(networkListenerCalls(addSpy.mock.calls)).toHaveLength(2);

      // 断连不摘：面板要在断连期间继续显示「离线、待推 N 条」，那正是它最该出声的时候
      await database.disconnectAll();
      expect(networkListenerCalls(removeSpy.mock.calls)).toHaveLength(0);

      databases.delete(database);
      await database.destroy();

      // 逐对配平：`removeEventListener` 只有拿到与注册时同一个函数引用才真的摘得掉，
      // 所以断言 (type, listener) 二元组集合相等，而不是只数个数
      expect(networkListenerCalls(removeSpy.mock.calls)).toEqual(networkListenerCalls(addSpy.mock.calls));
    });

    it('不依赖先 disconnectAll()，自己把适配器断干净', async () => {
      const addSpy = vi.spyOn(globalThis, 'addEventListener');
      const removeSpy = vi.spyOn(globalThis, 'removeEventListener');

      const database = createDatabase();
      const localAdapter = createMockAdapter(database);
      database.adapter('local', () => localAdapter);
      await database.connect('local');
      databases.delete(database);

      await database.destroy();

      expect(vi.mocked(localAdapter.disconnect)).toHaveBeenCalledTimes(1);
      expect(networkListenerCalls(removeSpy.mock.calls)).toEqual(networkListenerCalls(addSpy.mock.calls));
    });

    it('重复调用只拆一轮', async () => {
      const database = createDatabase();
      const localAdapter = createMockAdapter(database);
      const plugin = { name: 'destroy-idempotent' as const, install: vi.fn(), destroy: vi.fn() };
      database.adapter('local', () => localAdapter).use(() => plugin);
      await database.connect('local');
      databases.delete(database);

      // 并发的两次：终态标志必须在第一个 await 之前置位，否则第二次会跟第一次
      // 并排跑一遍 #shutdown()，把插件销毁、versionManager 拆卸各重入一次
      await Promise.all([database.destroy(), database.destroy()]);
      await database.destroy();

      expect(plugin.destroy).toHaveBeenCalledTimes(1);
      expect(vi.mocked(localAdapter.disconnect)).toHaveBeenCalledTimes(1);
    });

    it('销毁后 connect() / init() 拒绝，而不是交出一个空壳实例', async () => {
      const database = createDatabase();
      databases.delete(database);
      await database.destroy();

      // 复用一个 reachability 已销毁、syncState 上游已断的实例，症状是「面板永远停在
      // 销毁那一刻」——静默且极难排查，所以在入口处就拒绝
      expect(() => database.init()).toThrow(/destroyed/);
      await expect(database.connect('local')).rejects.toThrow(/destroyed/);
    });

    it('拆卸进行中进来的 connect() 也被拒，不会把实例复活', async () => {
      const database = createDatabase();
      await database.connect('local');
      databases.delete(database);

      // 不 await：`destroy()` 里 disconnectAll() 的每个 await 都是一次让路，
      // 终态标志若排在它后面，这条 connect() 会在拆完之后醒来把已连接集合重新填上
      const destroying = database.destroy();
      await expect(database.connect('local')).rejects.toThrow(/destroyed/);
      await destroying;

      expect(await firstValueFrom(database.connected$)).toBe(false);
    });

    it('断开 syncState 的上游订阅', async () => {
      // 「断开之后上游再发值也不再更新」由 sync-state.spec.ts 在单元层面盯着；
      // 这里只钉组合点——RxDB 得真的调它。放在 RxDB 侧观察不了：syncState 的两路上游
      // 一路是 reachability.online$（销毁时一并 complete，看不出是谁停的），
      // 一路是 connected$ 派生的 pushableCount$（销毁后没有公开入口再推它）
      const destroySpy = vi.spyOn(SyncStateHub.prototype, 'destroy');

      const database = createDatabase();
      await database.connect('local');
      databases.delete(database);
      await database.destroy();

      expect(destroySpy).toHaveBeenCalledTimes(1);
    });
  });

  // RXD-003 残留：最后一个适配器的判定必须按「已连接」而非「已实例化」。
  // localAdapter$ / remoteAdapter$ 的订阅会经 getAdapter() 把从未 connect 的适配器
  // 塞进 #adapter_map，若按 map.size 判断，唯一连接的适配器断开时会跳过全局拆卸，
  // 插件 / gateway / versionManager 永远留在活着的状态。
  it('tears down global resources when the last connected adapter disconnects, ignoring merely instantiated ones', async () => {
    const database = createDatabase();
    const localAdapter = createMockAdapter(database);
    const auxiliaryAdapter = createMockAdapter(database);
    const plugin = {
      name: 'lifecycle-connected' as const,
      install: vi.fn(),
      destroy: vi.fn()
    };
    const pluginFactory: Plugin = () => plugin;

    database
      .adapter('local', () => localAdapter)
      .adapter('auxiliary', () => auxiliaryAdapter)
      .use(pluginFactory);

    await database.connect('local');
    // 只实例化不连接——等价于 remoteAdapter$ 订阅触发的 getAdapter()
    await database.getAdapter('auxiliary');

    await database.disconnect('local');

    expect(plugin.destroy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(auxiliaryAdapter.disconnect)).not.toHaveBeenCalled();

    databases.delete(database);
    await database.disconnectAll();
  });

  it('deduplicates plugins and contains install and destroy failures', async () => {
    const installFailure = new Error('async install failed');
    const destroyFailure = new Error('async destroy failed');
    const asyncPlugin = {
      name: 'asyncCoverage' as const,
      install: vi.fn<() => Promise<void>>(() => Promise.reject(installFailure)),
      destroy: vi.fn<() => Promise<void>>(() => Promise.reject(destroyFailure))
    };
    const synchronousInstallFailure = new Error('sync install failed');
    const synchronousPlugin = {
      name: 'syncCoverage' as const,
      install: vi.fn(() => {
        throw synchronousInstallFailure;
      }),
      destroy: vi.fn()
    };
    const asyncFactory: Plugin = vi.fn(() => asyncPlugin);
    const synchronousFactory: Plugin = vi.fn(() => synchronousPlugin);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();

    expect(database.use(asyncFactory).use(asyncFactory).use(synchronousFactory)).toBe(database);
    database.init();

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith("[RxDB] Plugin 'asyncCoverage' install failed:", installFailure);
    });
    expect(consoleWarn).toHaveBeenCalledWith('plugin already installed');
    expect(vi.mocked(asyncFactory)).toHaveBeenCalledTimes(1);
    expect(asyncPlugin.install).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "[RxDB] Plugin 'syncCoverage' install failed:",
      synchronousInstallFailure
    );

    await expect(database.connect('local')).rejects.toBe(installFailure);

    await disposeDatabase(database);

    expect(consoleError).toHaveBeenCalledWith("[RxDB] Plugin 'asyncCoverage' destroy failed:", destroyFailure);
  });

  it('init 之后 use() 立即安装插件，install/destroy 保持对称', async () => {
    const plugin = {
      name: 'lateCoverage' as const,
      install: vi.fn(),
      destroy: vi.fn()
    };
    const factory: Plugin = vi.fn(() => plugin);
    const database = createDatabase();

    database.init();
    expect(database.use(factory)).toBe(database);

    expect(plugin.install).toHaveBeenCalledTimes(1);

    await disposeDatabase(database);

    expect(plugin.destroy).toHaveBeenCalledTimes(1);
  });

  it('init 之后 use() 的插件 install 失败不阻断调用方', async () => {
    const installFailure = new Error('late install failed');
    const plugin = {
      name: 'lateFailure' as const,
      install: vi.fn(() => {
        throw installFailure;
      }),
      destroy: vi.fn()
    };
    const factory: Plugin = vi.fn(() => plugin);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();

    database.init();

    expect(() => database.use(factory)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith("[RxDB] Plugin 'lateFailure' install failed:", installFailure);
    await expect(database.connect('local')).rejects.toBe(installFailure);

    await disposeDatabase(database);
  });

  /**
   * 插件安装失败后的重试路径：**必须先断开**。
   *
   * 裸 `connect()` 重试拿到的是同一个 rejected promise，不会重跑 `install()` ——
   * `install()` 没有幂等契约（搜索插件可能已经建了一半 FTS 表），在半成品上再跑一遍
   * 只会让第二次的报错盖掉第一次的真实原因。`disconnectAll()` 先 `destroy()` 掉插件
   * 再清空安装记录，重装才有干净的起点。
   */
  it('connect() 在插件安装失败后经断开重试', async () => {
    let shouldFail = true;
    const transient = new Error('transient install failed');
    const plugin = {
      name: 'retryCoverage' as const,
      install: vi.fn(async () => {
        if (shouldFail) throw transient;
      }),
      destroy: vi.fn()
    };
    const factory: Plugin = vi.fn(() => plugin);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = createDatabase();
    database.use(factory);

    await expect(database.connect('local')).rejects.toBe(transient);
    expect(plugin.install).toHaveBeenCalledTimes(1);

    shouldFail = false;
    // 没断开就重连：错误原样重放，install() 不再被调用
    await expect(database.connect('local')).rejects.toBe(transient);
    expect(plugin.install).toHaveBeenCalledTimes(1);

    await database.disconnectAll();
    await expect(database.connect('local')).resolves.toBeDefined();
    expect(plugin.install).toHaveBeenCalledTimes(2);

    await disposeDatabase(database);
  });
});
