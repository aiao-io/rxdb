import { firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import { RxDBTabsGateway } from '../gateway/RxDBTabsGateway.js';
import type { IRxDBAdapter, RxDBAdapterLocalBase } from '../rxdb-adapter.js';
import { ENTITY_LOCAL_CREATE_EVENT, EntityLocalCreatedEvent, type RxDBEvent } from '../rxdb-events.js';
import type { Plugin } from '../rxdb-plugin.js';
import type { RxDBOptions } from '../rxdb.interface.js';
import { RxDB } from '../RxDB.js';
import { RxDBMigration } from '../system/migration.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';

type LocalAdapterMock = IRxDBAdapter & Pick<RxDBAdapterLocalBase, 'createTables' | 'transaction'>;

type DatabaseOverrides = {
  context?: RxDBOptions['context'];
  migrations?: RxDBOptions['migrations'];
  sync?: RxDBOptions['sync'];
};

const databases = new Set<RxDB>();
let databaseSequence = 0;

const createLocalAdapter = (): LocalAdapterMock => createMockAdapter() as LocalAdapterMock;

const createDatabase = (overrides: DatabaseOverrides = {}): RxDB => {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-coverage-${databaseSequence}`,
    entities: [],
    sync: overrides.sync ?? {
      local: { adapter: 'local' },
      type: SyncType.None
    },
    context: overrides.context,
    migrations: overrides.migrations
  });
  database.adapter('local', () => createLocalAdapter());
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

describe('RxDB coverage', () => {
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
      context: { clientId: 'coverage-client' },
      sync: {
        remote: { adapter: 'remote' },
        type: SyncType.None
      }
    });
    const remoteAdapter = createLocalAdapter();
    database.adapter('remote', () => remoteAdapter);

    database.init();

    await expect(firstValueFrom(database.remoteAdapter$)).resolves.toBe(remoteAdapter);
    expect(database.context.clientId).toBe('coverage-client');
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
    database.adapter('local', () => createLocalAdapter());
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
    const adapter = createLocalAdapter();
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
    const defaultGetRepository = vi.mocked(adapter.getRepository).getMockImplementation();
    vi.mocked(adapter.getRepository).mockImplementation((EntityType: unknown) =>
      EntityType === RxDBMigration ? (repository as never) : (defaultGetRepository?.(EntityType as never) as never)
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
    // 每次尝试都先占坑再执行（RXD-036），失败的那次连同占坑一起回滚 —— 但这里的
    // `created` 是内存数组，回滚不到它，所以两次尝试各留下一条。真库上只会剩最后一条。
    // 关键契约是：只有 z-retry 被占坑，已执行的 a-applied 一次都没碰。
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
    const adapter = Object.assign(createLocalAdapter(), { migrateSystemSchema });
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
    const adapter = createLocalAdapter();
    vi.mocked(adapter.isTableExisted).mockResolvedValue(true);
    database.adapter('local', () => adapter);
    database.init();
    // C2 起迁移仓库由 executor.getRepository() 提供；取不到仓库时的错误由适配器抛出，
    // 契约是**不得被吞掉**——connect() 必须带着原因失败，而不是静默跳过迁移
    const repositoryFailure = new Error('Repository for RxDBMigration is not registered');
    const defaultGetRepository = vi.mocked(adapter.getRepository).getMockImplementation();
    // 只对 RxDBMigration 抛：getRepository 是通用入口，全局抛会让无关代码路径产生
    // 未捕获拒绝并污染同文件的其他用例
    vi.mocked(adapter.getRepository).mockImplementation((EntityType: unknown) => {
      if (EntityType === RxDBMigration) throw repositoryFailure;
      return defaultGetRepository?.(EntityType as never) as never;
    });

    await expect(database.connect('local')).rejects.toBe(repositoryFailure);
  });

  it('keeps global resources alive until the final adapter disconnects', async () => {
    const database = createDatabase();
    const localAdapter = createLocalAdapter();
    const auxiliaryAdapter = createLocalAdapter();
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

  // RXD-003 残留：最后一个适配器的判定必须按「已连接」而非「已实例化」。
  // localAdapter$ / remoteAdapter$ 的订阅会经 getAdapter() 把从未 connect 的适配器
  // 塞进 #adapter_map，若按 map.size 判断，唯一连接的适配器断开时会跳过全局拆卸，
  // 插件 / gateway / versionManager 永远留在活着的状态。
  it('tears down global resources when the last connected adapter disconnects, ignoring merely instantiated ones', async () => {
    const database = createDatabase();
    const localAdapter = createLocalAdapter();
    const auxiliaryAdapter = createLocalAdapter();
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

    await disposeDatabase(database);
  });
});
