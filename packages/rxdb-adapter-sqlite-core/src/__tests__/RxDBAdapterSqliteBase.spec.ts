import {
  Entity,
  ENTITY_LOCAL_CREATE_EVENT,
  EntityBase,
  EntityLocalCreatedEvent,
  getEntityMetadata,
  getEntityStatus,
  PropertyType,
  RxDB,
  RelationKind,
  RxDBBranch,
  RxDBChange,
  SyncType,
  TRANSACTION_BEGIN,
  TRANSACTION_ROLLBACK,
  transitionMetadata,
  type EntityType,
  type EntityUpdateData,
  type RxDBMutationsMap,
  type SwitchVersionActions
} from '@aiao/rxdb';
import { EncryptedConfigurationError } from '@aiao/rxdb-adapter-encrypted';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBQueryCacheRowContractError } from '../query-cache-row-contract.js';
import { SqliteRepository } from '../repository/SqliteRepository.js';
import { RxDBAdapterSqliteBase, type SqliteBaseOptions, type SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import { SQLiteChangeType } from '../sqlite-backend.interface.js';
import type { SqliteChangeEvent, SqliteSuccessResult } from '../sqlite-core.interface.js';
import { RxDBAdapterSqliteError } from '../sqlite-core.utils.js';
import { Todo } from './fixtures/Todo.js';

@Entity({
  name: 'InvalidEncryptedPrimary',
  properties: [{ name: 'secretId', type: PropertyType.string, primary: true, encrypted: true }]
})
class InvalidEncryptedPrimary extends EntityBase {}

@Entity({
  name: 'SecretNote',
  properties: [{ name: 'secret', type: PropertyType.string, encrypted: true, nullable: true }]
})
class SecretNote extends EntityBase {}

@Entity({
  name: 'QcContractRecipe',
  tableName: 'recipes',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'tag', type: PropertyType.string, nullable: true }
  ]
})
class QcContractRecipe extends EntityBase {}

@Entity({ name: 'MissingRepoEntity', repository: 'MissingRepo', properties: [] })
class MissingRepoEntity extends EntityBase {}

@Entity({ name: 'CustomRepoEntity', repository: 'Custom', properties: [] })
class CustomRepoEntity extends EntityBase {}

class CustomRepository<T extends EntityType> extends SqliteRepository<T> {}

class CacheEntity {
  id = 'cache-entity';
}

class TestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'test-sqlite';
  createClientCalls = 0;

  constructor(
    rxdb: RxDB,
    private readonly clientFactory: () => SqliteClientLike | Promise<SqliteClientLike>
  ) {
    super(rxdb);
  }

  protected async createClient(): Promise<SqliteClientLike> {
    this.createClientCalls += 1;
    return await this.clientFactory();
  }
}

class OptionsTestAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'test-sqlite-options';

  constructor(rxdb: RxDB, options?: SqliteBaseOptions) {
    super(rxdb, options);
  }

  protected async createClient(): Promise<SqliteClientLike> {
    throw new Error('OptionsTestAdapter.createClient must not be called');
  }
}

function createRxdbMock(entities: EntityType[] = []): RxDB {
  return {
    config: { entities, dbName: 'sqlite-core-base-mock' },
    context: {},
    connect: vi.fn().mockResolvedValue(undefined),
    dispatchEvent: vi.fn(),
    // getEntityType：QueryCache 写入口在写完之后要把行同步回 identity cache，
    // 需要从 entityName 反查实体类。替身默认查不到 → 写入口只落 SQL、不做缓存维护，
    // 正是这些用例断言的范围（缓存协同由 sqlite-wasm 的 AC#21 集成用例覆盖）。
    schemaManager: { getEntityTypeByTableName: vi.fn(), getEntityMetadata: vi.fn(), getEntityType: vi.fn() },
    versionManager: {
      getCurrentBranch: vi.fn().mockResolvedValue({ id: 'branch-id' })
    }
  } as unknown as RxDB;
}

/**
 * 事务日志序幕会读一次「当前分支」。
 *
 * @remarks
 * C2 起这次读经 `executor.getRepository(RxDBBranch)` 直发到事务连接（翻转前它靠
 * `#transaction_lock` 快路径直通）。替身 client 若对它返回空结果，`#run_transaction`
 * 会以「currentBranch is undefined」失败 —— 与被测行为无关，纯粹是替身没答话。
 */
// 只匹配序幕那次**读**。写宽了会连 switchBranch 合法的分支表 UPDATE 一起吞掉 ——
// 既让「事务中执行分支切换 SQL」断言不到目标，也让「失败时包装错误」因替身不再抛错而
// 以错误的理由通过。
const BRANCH_TABLE_PATTERN = /^SELECT [^;]*FROM "rxdb\$rxdb_branch"/;
const branchRow = (sql: string) => ({
  sql,
  rowsAffected: 0,
  elapsed: 0,
  results: [
    {
      columns: ['__rowid', 'id', 'activated', 'createdAt', 'updatedAt'],
      rows: [[1, 'main', 1, ISO_CREATED, ISO_UPDATED]]
    }
  ]
});

function createClient(overrides: Partial<SqliteClientLike> = {}): SqliteClientLike {
  const { execute: executeOverride, ...rest } = overrides;
  const fallback = async (sql: string, bindings?: unknown[]) =>
    executeOverride ?
      ((await (executeOverride as (s: string, b?: unknown[]) => unknown)(sql, bindings)) as SqliteSuccessResult)
    : ({ sql: '', results: [], rowsAffected: 0, elapsed: 0 } as SqliteSuccessResult);

  return {
    // 事务序幕的分支读**始终**由这里应答，即使用例覆盖了 execute：
    // 序幕不是这些用例的被测对象，让它落进各自的覆盖实现只会制造与主题无关的失败。
    // 所有调用（含序幕）仍记录在同一个 mock 上，用 transactionSqls() 过滤即可。
    execute: vi
      .fn()
      .mockImplementation(async (sql: string, bindings?: unknown[]) =>
        BRANCH_TABLE_PATTERN.test(String(sql)) ? branchRow(String(sql)) : fallback(String(sql), bindings)
      ),
    disconnect: vi.fn().mockResolvedValue(undefined),
    version: vi.fn().mockResolvedValue('3.0.0'),
    addEventListener: vi.fn(),
    ...rest
  };
}

const okResult = (
  sql: string,
  results: SqliteSuccessResult['results'] = [],
  rowsAffected = 0
): SqliteSuccessResult => ({
  sql,
  rowsAffected,
  elapsed: 0,
  results
});

const executedSqls = (client: SqliteClientLike): string[] =>
  vi.mocked(client.execute).mock.calls.map(([sql]) => String(sql));

/**
 * 去掉事务序幕里那次「读当前分支」的 SQL。
 *
 * @remarks
 * C2 起 `#run_transaction` 在 BEGIN 之前会先读一次当前分支（供 `switch_transaction_id` 用），
 * 于是它排在 `executedSqls()` 的最前面。断言 `sqls[0]` 是 BEGIN 的用例本意是「事务的第一条
 * 语句」，不是「client 收到的第一条语句」—— 用这个过滤器表达该本意，避免把序幕的调度
 * 细节固定在测试里。
 */
const transactionSqls = (client: SqliteClientLike): string[] =>
  executedSqls(client).filter(sql => !BRANCH_TABLE_PATTERN.test(sql));

const emptyMutations = (): RxDBMutationsMap => ({
  create: new Map(),
  update: new Map(),
  remove: new Map()
});

const ISO_CREATED = '2026-01-01T00:00:00.000Z';
const ISO_UPDATED = '2026-01-02T00:00:00.000Z';
const TODO_COLUMNS = ['__rowid', 'id', 'title', 'completed', 'createdAt', 'updatedAt'];

const createRealRxdb = (dbName: string): RxDB => {
  const rxdb = new RxDB({
    dbName,
    entities: [Todo],
    sync: { local: { adapter: 'noop' }, type: SyncType.None }
  });
  rxdb.schemaManager.init();
  rxdb.entityManager.init();
  vi.spyOn(rxdb, 'connect').mockResolvedValue(undefined as never);
  vi.spyOn(rxdb.versionManager, 'getCurrentBranch').mockResolvedValue({ id: 'main' } as unknown as RxDBBranch);
  return rxdb;
};

describe('RxDBAdapterSqliteBase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('在创建 SQLite client 前拒绝非法加密 schema', async () => {
    const adapter = new TestAdapter(createRxdbMock([InvalidEncryptedPrimary]), () => createClient());

    await expect(adapter.connect()).rejects.toMatchObject({ code: 'encrypted_pk_forbidden' });
    expect(adapter.createClientCalls).toBe(0);
  });

  it('connect 时应该只注册一次变更监听器', async () => {
    const client = createClient();
    const adapter = new TestAdapter(createRxdbMock(), () => client);

    await adapter.connect();
    await adapter.connect();

    expect(adapter.createClientCalls).toBe(1);
    expect(client.addEventListener).toHaveBeenCalledTimes(3);
    expect(client.addEventListener).toHaveBeenNthCalledWith(1, SQLiteChangeType.SQLITE_INSERT, expect.any(Function));
    expect(client.addEventListener).toHaveBeenNthCalledWith(2, SQLiteChangeType.SQLITE_UPDATE, expect.any(Function));
    expect(client.addEventListener).toHaveBeenNthCalledWith(3, SQLiteChangeType.SQLITE_DELETE, expect.any(Function));
  });

  it('监听器注册失败时应该抛错并清理失败 client', async () => {
    const disconnectSpy = vi.fn().mockResolvedValue(undefined);
    const adapter = new TestAdapter(createRxdbMock(), () =>
      createClient({
        addEventListener: vi.fn(() => {
          throw new Error('boom');
        }),
        disconnect: disconnectSpy
      })
    );

    await expect(adapter.connect()).rejects.toThrow(RxDBAdapterSqliteError);
    await expect(adapter.connect()).rejects.toThrow('Failed to register SQLite change listeners');

    expect(adapter.createClientCalls).toBe(2);
    expect(disconnectSpy).toHaveBeenCalledTimes(2);
  });

  it('事务在 BEGIN 前失败时应该释放锁并派发回滚事件', async () => {
    const rxdb = createRxdbMock();
    // C2：序幕的分支读经 executor 直发 SQL（不再是 versionManager.getCurrentBranch），
    // 因此「读不到分支」要由替身 client 返回空结果来制造
    // 这里必须手工构造 client：createClient() 会**始终**应答分支查询（见其注释），
    // 而本用例的被测点正是「读不到分支时序幕失败」
    let branchRows = false;
    const client: SqliteClientLike = {
      execute: vi
        .fn()
        .mockImplementation(async (sql: string) =>
          BRANCH_TABLE_PATTERN.test(String(sql)) && branchRows ?
            branchRow(String(sql))
          : { sql: '', results: [], rowsAffected: 0, elapsed: 0 }
        ),
      disconnect: vi.fn().mockResolvedValue(undefined),
      version: vi.fn().mockResolvedValue('3.0.0'),
      addEventListener: vi.fn()
    };
    const adapter = new TestAdapter(rxdb, () => client);

    await expect(adapter.transaction(async () => undefined)).rejects.toThrow('currentBranch is undefined');

    expect(rxdb.dispatchEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'TRANSACTION_BEGIN' }));
    expect(rxdb.dispatchEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'TRANSACTION_ROLLBACK' }));

    branchRows = true;

    await expect(adapter.transaction(async () => 'ok')).resolves.toBe('ok');
  });

  describe('连接与生命周期', () => {
    it('createClient 自身抛错时保留原始错误并允许重试', async () => {
      let attempt = 0;
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => {
        attempt += 1;
        if (attempt === 1) throw new Error('client boom');
        return client;
      });

      await expect(adapter.connect()).rejects.toThrow('client boom');
      await expect(adapter.connect()).resolves.toBe(adapter);
      expect(adapter.createClientCalls).toBe(2);
    });

    it('version 委托底层 client.version', async () => {
      const client = createClient({ version: vi.fn().mockResolvedValue('3.45.0') });
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await expect(adapter.version()).resolves.toBe('3.45.0');
      expect(client.version).toHaveBeenCalledTimes(1);
    });

    it('disconnect 断开缓存 client 并拒绝后续 query/rawQuery/transaction', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await adapter.connect();
      await adapter.disconnect();

      expect(client.disconnect).toHaveBeenCalledTimes(1);
      await expect(adapter.query('SELECT 1')).rejects.toThrow('Adapter is disconnected');
      await expect(adapter.rawQuery('SELECT 1')).rejects.toThrow('Adapter is disconnected');
      await expect(adapter.transaction(async () => 0)).rejects.toThrow('Adapter is disconnected');
    });

    it('disconnect 等待尚未进入 client 队列的变更查询完成', async () => {
      let releaseConnect!: () => void;
      const connect = new Promise<void>(resolve => {
        releaseConnect = resolve;
      });
      const rxdb = createRealRxdb('sqlite-core-base-change-disconnect-race');
      vi.mocked(rxdb.connect).mockReturnValue(connect as never);

      let changeListener: ((event: SqliteChangeEvent) => void) | undefined;
      const client = createClient({
        addEventListener: vi.fn((_type: SQLiteChangeType, listener: (event: SqliteChangeEvent) => void) => {
          changeListener = listener;
        })
      });
      const adapter = new TestAdapter(rxdb, () => client);
      await adapter.connect();

      changeListener?.({
        type: SQLiteChangeType.SQLITE_INSERT,
        dbName: 'test-db',
        tableName: 'public$todos',
        rowIds: [1n],
        recordAt: new Date()
      });

      const disconnect = adapter.disconnect();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(client.disconnect).not.toHaveBeenCalled();

      releaseConnect();
      await disconnect;
      expect(client.disconnect).toHaveBeenCalledTimes(1);
    });

    // SQLC-020：client.disconnect() 抛错时，其后的 #cached_client/#client_promise 复位
    // 全部被跳过 —— 重连会复用那个已经（可能部分）拆掉的死实例。
    it('client.disconnect() 抛错也必须清掉缓存，重连要建新实例', async () => {
      const boom = createClient();
      boom.disconnect = vi.fn().mockRejectedValue(new Error('client disconnect failed'));
      const fresh = createClient();
      let attempt = 0;
      const adapter = new TestAdapter(createRxdbMock(), () => {
        attempt += 1;
        return attempt === 1 ? boom : fresh;
      });

      await adapter.connect();
      await expect(adapter.disconnect()).rejects.toThrow('client disconnect failed');

      // 重连必须走工厂重建，而不是复用那个已失败的实例
      await adapter.internalQuery('SELECT 1');
      expect(adapter.createClientCalls).toBe(2);
      expect(fresh.execute).toHaveBeenCalled();
    });

    it('未创建过 client 时 disconnect 为空操作', async () => {
      const adapter = new TestAdapter(createRxdbMock(), () => createClient());

      await expect(adapter.disconnect()).resolves.toBeUndefined();
      expect(adapter.createClientCalls).toBe(0);
    });

    it('断开后 internalQuery 重建 client 但不再注册监听器', async () => {
      const first = createClient();
      const second = createClient();
      let attempt = 0;
      const adapter = new TestAdapter(createRxdbMock(), () => {
        attempt += 1;
        return attempt === 1 ? first : second;
      });

      await adapter.connect();
      await adapter.disconnect();
      await adapter.internalQuery('SELECT 1');

      expect(adapter.createClientCalls).toBe(2);
      expect(second.execute).toHaveBeenCalledWith('SELECT 1', undefined);
      // 断开状态下创建的 client 不注册变更监听器
      expect(second.addEventListener).not.toHaveBeenCalled();
    });
  });

  // RxDB.connect() 的顺序是：adapter.connect() → 建表/系统迁移/水位线。就绪门若只看
  // 「适配器自己连上了没」，那么这两步之间到达的**外部**写会立刻入队执行，打在还没建出来的表上
  // （实测症状：`no such table: public$xxx`，e2e 里表现为偶发的写失败弹窗）。
  describe('就绪门：RxDB 引导窗口', () => {
    it('适配器已连上但 RxDB 建表未完成时，外部写必须等引导结束再入队', async () => {
      let finishBootstrap!: () => void;
      const bootstrap = new Promise<void>(resolve => {
        finishBootstrap = resolve;
      });
      const rxdb = createRxdbMock();
      vi.mocked(rxdb.connect).mockReturnValue(bootstrap as never);
      const client = createClient();
      const adapter = new TestAdapter(rxdb, () => client);

      // 这一步等价于 RxDB.connect() 里的 `await adapter.connect()` 刚返回的瞬间
      await adapter.connect();
      vi.mocked(client.execute).mockClear();

      const write = adapter.transaction(async tx => tx.execute('INSERT INTO "public$todo" ("id") VALUES (1)'), false);
      // 给足微任务轮次：真出问题时这里已经把 BEGIN/INSERT 发给 client 了
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(executedSqls(client)).toEqual([]);

      finishBootstrap();
      await write;

      expect(executedSqls(client).some(sql => sql.includes('INSERT INTO "public$todo"'))).toBe(true);
    });

    it('引导期事务跳过就绪门，不等 RxDB.connect() 自己', async () => {
      const rxdb = createRxdbMock();
      // RxDB.connect() 尚未 settle —— 引导期调用若也去等它，就是等自己
      vi.mocked(rxdb.connect).mockReturnValue(new Promise<never>(() => undefined) as never);
      const client = createClient();
      const adapter = new TestAdapter(rxdb, () => client);

      await adapter.connect();

      await expect(adapter.bootstrapTransaction(async tx => tx.execute('SELECT 1'), false)).resolves.toBeDefined();
    });

    it('connect 未完成时 rawQuery 不得再等 RxDB.connect()（插件 install 窗口）', async () => {
      const rxdb = createRxdbMock();
      vi.mocked(rxdb.connect).mockReturnValue(new Promise<never>(() => undefined) as never);
      const client = createClient();
      const adapter = new TestAdapter(rxdb, () => client);

      await adapter.connect();

      await expect(adapter.rawQuery('SELECT 1')).resolves.toEqual({
        rowsAffected: 0,
        rows: [],
        columns: []
      });
    });
  });

  describe('仓库注册与获取', () => {
    it('getRepository 未知 repository 时抛错', () => {
      const adapter = new TestAdapter(createRxdbMock(), () => createClient());

      expect(() => adapter.getRepository(MissingRepoEntity)).toThrow(RxDBAdapterSqliteError);
      expect(() => adapter.getRepository(MissingRepoEntity)).toThrow(`Repository 'MissingRepo' not found`);
    });

    it('getRepository 缓存并复用同一实例', () => {
      const adapter = new TestAdapter(createRxdbMock(), () => createClient());

      const first = adapter.getRepository(RxDBBranch);
      const second = adapter.getRepository(RxDBBranch);

      expect(first).toBeInstanceOf(SqliteRepository);
      expect(second).toBe(first);
    });

    it('构造函数可注册自定义 repositories', () => {
      const repositories = { Custom: CustomRepository } as unknown as NonNullable<SqliteBaseOptions['repositories']>;
      const adapter = new OptionsTestAdapter(createRxdbMock(), { repositories });

      expect(adapter.getRepository(CustomRepoEntity)).toBeInstanceOf(CustomRepository);
    });

    it('localRxDBBranch 与 localRxDBChange 返回系统实体仓库', () => {
      const adapter = new TestAdapter(createRxdbMock(), () => createClient());

      expect(adapter.localRxDBBranch()).toBeInstanceOf(SqliteRepository);
      expect(adapter.localRxDBBranch().EntityType).toBe(RxDBBranch);
      expect(adapter.localRxDBChange()).toBeInstanceOf(SqliteRepository);
      expect(adapter.localRxDBChange().EntityType).toBe(RxDBChange);
    });
  });

  describe('表与序列', () => {
    it('isTableExisted 依据查询行数判断表是否存在', async () => {
      const client = createClient({
        execute: vi
          .fn()
          .mockResolvedValueOnce(okResult('SELECT', [{ columns: ['name'], rows: [['public$todos']] }]))
          .mockResolvedValueOnce(okResult('SELECT', []))
      });
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await expect(adapter.isTableExisted(Todo)).resolves.toBe(true);
      await expect(adapter.isTableExisted(Todo)).resolves.toBe(false);
      expect(client.execute).toHaveBeenCalledWith(expect.stringContaining('sqlite_master'), ['public$todos']);
    });

    it('createTables 在单一事务中执行建表与 trigger SQL', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await expect(adapter.createTables([Todo])).resolves.toBe(true);

      const sqls = transactionSqls(client);
      expect(sqls[0]).toContain('BEGIN');
      expect(sqls[1]).toContain('CREATE TABLE');
      expect(sqls[1]).toContain('"public$todos"');
      expect(sqls[1]).toContain('CREATE TRIGGER');
      expect(sqls.at(-1)).toContain('COMMIT');
    });

    it('getRxDBChangeSequence 读取序列值，空结果回退为 0', async () => {
      const client = createClient({
        execute: vi
          .fn()
          .mockResolvedValueOnce(okResult('SELECT', [{ columns: ['seq'], rows: [[42]] }]))
          .mockResolvedValueOnce(okResult('SELECT', []))
      });
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await expect(adapter.getRxDBChangeSequence()).resolves.toBe(42);
      await expect(adapter.getRxDBChangeSequence()).resolves.toBe(0);
      expect(client.execute).toHaveBeenCalledWith(expect.stringContaining('sqlite_sequence'), ['rxdb$rxdb_change']);
    });

    it('setRxDBChangeSequence 依序执行 DELETE 与 INSERT', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await adapter.setRxDBChangeSequence(42);

      expect(client.execute).toHaveBeenNthCalledWith(1, 'BEGIN;\nPRAGMA defer_foreign_keys = ON;');
      expect(client.execute).toHaveBeenNthCalledWith(2, 'DELETE FROM sqlite_sequence WHERE name = ?', [
        'rxdb$rxdb_change'
      ]);
      expect(client.execute).toHaveBeenNthCalledWith(3, 'INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?)', [
        'rxdb$rxdb_change',
        42
      ]);
      expect(client.execute).toHaveBeenNthCalledWith(4, '\nCOMMIT;');
    });
  });

  describe('rowid 实体缓存', () => {
    it('缓存的增删查与全量清理', () => {
      const adapter = new TestAdapter(createRxdbMock(), () => createClient());
      const cacheEntityType = CacheEntity as unknown as EntityType;
      const entity = new CacheEntity() as unknown as InstanceType<EntityType>;
      const uncached = new CacheEntity() as unknown as InstanceType<EntityType>;

      adapter.cacheRowIdEntity(1n, entity);
      expect(adapter.getEntityByRowId(1n, cacheEntityType)).toBe(entity);
      expect(adapter.getRowIdByEntity(entity)).toBe(1n);
      expect(adapter.getEntityByRowId(2n, cacheEntityType)).toBeUndefined();

      // 未缓存实体删除为空操作
      adapter.removeCacheEntity(uncached);
      expect(adapter.getEntityByRowId(1n, cacheEntityType)).toBe(entity);

      adapter.removeCacheEntity(entity);
      expect(adapter.getEntityByRowId(1n, cacheEntityType)).toBeUndefined();
      expect(adapter.getRowIdByEntity(entity)).toBeUndefined();

      adapter.cacheRowIdEntity(3n, entity);
      adapter.cleanAllCache();
      expect(adapter.getEntityByRowId(3n, cacheEntityType)).toBeUndefined();
      expect(adapter.getRowIdByEntity(entity)).toBeUndefined();
    });
  });

  describe('query 与 rawQuery', () => {
    it('query 经队列执行并透传 bindings', async () => {
      const client = createClient({
        execute: vi.fn().mockResolvedValue(okResult('SELECT ?', [{ columns: ['a'], rows: [[1]] }]))
      });
      const rxdb = createRxdbMock();
      const adapter = new TestAdapter(rxdb, () => client);

      const result = await adapter.query('SELECT ?', [1]);

      expect(client.execute).toHaveBeenCalledWith('SELECT ?', [1]);
      expect(rxdb.connect).toHaveBeenCalledWith('test-sqlite');
      expect(result.results[0].rows).toEqual([[1]]);
    });

    it('rawQuery 提取 rows/columns，空结果回退为空数组', async () => {
      const client = createClient({
        execute: vi.fn(async (sql: string) => {
          if (sql === 'SELECT 1') {
            return okResult(sql, [{ columns: ['a'], rows: [[1]] }], 3);
          }
          if (sql === 'SELECT 2') {
            return okResult(sql, []);
          }
          return okResult(sql);
        })
      });
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await expect(adapter.rawQuery('SELECT 1')).resolves.toEqual({
        rowsAffected: 3,
        rows: [[1]],
        columns: ['a']
      });
      await expect(adapter.rawQuery('SELECT 2')).resolves.toEqual({ rowsAffected: 0, rows: [], columns: [] });
    });

    it('internalQuery 直接执行 SQL 不触发 rxdb.connect', async () => {
      const client = createClient();
      const rxdb = createRxdbMock();
      const adapter = new TestAdapter(rxdb, () => client);

      await adapter.internalQuery('PRAGMA user_version', [1]);

      expect(client.execute).toHaveBeenCalledWith('PRAGMA user_version', [1]);
      expect(rxdb.connect).not.toHaveBeenCalled();
    });
  });

  describe('transaction', () => {
    it('成功提交时按序执行 BEGIN/COMMIT 并派发事件', async () => {
      const client = createClient();
      const rxdb = createRxdbMock();
      const adapter = new TestAdapter(rxdb, () => client);

      const result = await adapter.transaction(async tx => {
        // 回调收到的是本次事务的 executor，不再是裸 client（C2：持有 executor 才算在本事务内）。
        // 断言它的**事务身份**与透传能力，而不是对象同一性。
        expect(tx.state).toBe('active');
        expect(typeof tx.id).toBe('string');
        await tx.execute('SELECT executor-passthrough');
        expect(client.execute).toHaveBeenCalledWith('SELECT executor-passthrough', undefined);
        return 42;
      });

      expect(result).toBe(42);
      const sqls = transactionSqls(client);
      expect(sqls[0]).toContain('BEGIN;');
      expect(sqls[0]).toContain('PRAGMA defer_foreign_keys = ON;');
      expect(sqls.at(-1)).toContain('COMMIT;');
      expect(rxdb.dispatchEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'TRANSACTION_BEGIN' }));
      expect(rxdb.dispatchEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'TRANSACTION_COMMIT' }));
    });

    /**
     * RXD-062：事务事件必须带本次事务的身份。
     *
     * 此前派发的是三个模块级单例事件（`new TransactionBeginEvent()` 等），RxDB 侧只能靠
     * 一个全实例的深度计数认亲——两个适配器并发 BEGIN 会被当成 savepoint 嵌套，其中一个
     * ROLLBACK 就清空了另一个的挂起事件队列。身份是把这条链接上的那一环。
     */
    it('事务事件带唯一身份，且同一事务的 BEGIN/COMMIT 用同一个', async () => {
      const rxdb = createRxdbMock();
      const adapter = new TestAdapter(rxdb, () => createClient());

      await adapter.transaction(async () => 'first');
      await adapter.transaction(async () => 'second');

      const ids = vi
        .mocked(rxdb.dispatchEvent)
        .mock.calls.map(([event]) => event as { type: string; transactionId?: string });

      const [begin1, commit1, begin2, commit2] = ids;
      expect([begin1.type, commit1.type, begin2.type, commit2.type]).toEqual([
        'TRANSACTION_BEGIN',
        'TRANSACTION_COMMIT',
        'TRANSACTION_BEGIN',
        'TRANSACTION_COMMIT'
      ]);
      expect(begin1.transactionId).toEqual(expect.any(String));
      // 同一次事务的开始与提交必须同身份，否则 RxDB 侧找不到要排空的那个队列
      expect(commit1.transactionId).toBe(begin1.transactionId);
      expect(commit2.transactionId).toBe(begin2.transactionId);
      // 不同事务必须是不同身份，否则并发时又会被并成一个上下文
      expect(begin2.transactionId).not.toBe(begin1.transactionId);
    });

    it('回滚事件沿用本次事务的身份', async () => {
      const rxdb = createRxdbMock();
      const adapter = new TestAdapter(rxdb, () => createClient());

      await expect(
        adapter.transaction(async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');

      const events = vi
        .mocked(rxdb.dispatchEvent)
        .mock.calls.map(([event]) => event as { type: string; transactionId?: string });
      const begin = events.find(event => event.type === 'TRANSACTION_BEGIN');
      const rollback = events.find(event => event.type === 'TRANSACTION_ROLLBACK');

      expect(begin?.transactionId).toEqual(expect.any(String));
      expect(rollback?.transactionId).toBe(begin?.transactionId);
    });

    it('transactionLog=false 时跳过事务日志切换', async () => {
      const client = createClient();
      const rxdb = createRxdbMock();
      const adapter = new TestAdapter(rxdb, () => client);

      await expect(adapter.transaction(async () => 'no-log', false)).resolves.toBe('no-log');
      expect(rxdb.versionManager.getCurrentBranch).not.toHaveBeenCalled();
      const sqls = transactionSqls(client);
      expect(sqls).toHaveLength(2);
      expect(sqls[0]).toContain('BEGIN;');
      expect(sqls[0]).toContain('PRAGMA defer_foreign_keys = ON;');
      expect(sqls[1]).toContain('COMMIT;');
    });

    it('BEGIN 成功后事务配置失败时应该执行物理回滚', async () => {
      const setupFailure = new Error('defer foreign keys boom');
      let transactionActive = false;
      const client = createClient({
        execute: vi.fn(async (sql: string) => {
          if (sql.includes('BEGIN;') && sql.includes('PRAGMA defer_foreign_keys = ON;')) {
            transactionActive = true;
            throw setupFailure;
          }
          if (sql === 'ROLLBACK') transactionActive = false;
          return okResult(sql);
        })
      });
      const callback = vi.fn(async () => 'unreachable');
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      const error = await adapter.transaction(callback, false).catch((cause: unknown) => cause);

      expect(error).toMatchObject({ message: setupFailure.message, cause: setupFailure });
      expect(callback).not.toHaveBeenCalled();
      expect(transactionActive).toBe(false);
      expect(transactionSqls(client)).toHaveLength(2);
      expect(transactionSqls(client)[1]).toBe('ROLLBACK');
    });

    it('BEGIN 监听器抛错后应该释放锁并允许后续独立写入', async () => {
      const client = createClient();
      const rxdb = createRxdbMock();
      const beginFailure = new Error('begin listener boom');
      let shouldFailBegin = true;
      vi.mocked(rxdb.dispatchEvent).mockImplementation((event: unknown) => {
        if ((event as { type?: string }).type === 'TRANSACTION_BEGIN' && shouldFailBegin) {
          shouldFailBegin = false;
          throw beginFailure;
        }
      });
      const adapter = new TestAdapter(rxdb, () => client);

      const error = await adapter.transaction(async () => 'unreachable', false).catch((cause: unknown) => cause);

      await expect(
        adapter.runInTransaction(async transactionClient => {
          await transactionClient.execute('UPDATE after_begin_listener_failure');
          return 'written';
        }, false)
      ).resolves.toBe('written');
      await expect(adapter.transaction(async () => 'next', false)).resolves.toBe('next');

      const sqls = transactionSqls(client);
      expect.soft(error).toBeInstanceOf(RxDBAdapterSqliteError);
      expect.soft(error).toMatchObject({ message: beginFailure.message, cause: beginFailure });
      expect.soft(rxdb.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'TRANSACTION_ROLLBACK' }));
      expect.soft(sqls[0]).toContain('BEGIN');
      expect.soft(sqls).toContain('UPDATE after_begin_listener_failure');
      expect.soft(sqls.filter(sql => sql.includes('BEGIN'))).toHaveLength(2);
      expect.soft(sqls.filter(sql => sql.includes('COMMIT'))).toHaveLength(2);
    });

    it('BEGIN 监听器抛错后应该解除真实 RxDB 的事件缓冲', async () => {
      const rxdb = new RxDB({
        dbName: 'sqlite-core-begin-listener-failure',
        entities: [Todo],
        sync: { local: { adapter: 'noop' }, type: SyncType.None }
      });
      const rollbackFailure = new Error('real rollback listener boom');
      const rollbackListener = () => {
        throw rollbackFailure;
      };
      const client = createClient();
      const adapter = new TestAdapter(rxdb, () => client);
      rxdb.adapter('noop', () => adapter);
      rxdb.addEventListener(TRANSACTION_ROLLBACK, rollbackListener);
      rxdb.init();
      vi.spyOn(rxdb, 'connect').mockResolvedValue(undefined as never);
      vi.spyOn(rxdb.versionManager, 'getCurrentBranch').mockResolvedValue({ id: 'main' } as RxDBBranch);
      const entityListener = vi.fn();
      const beginFailure = new Error('real begin listener boom');
      const beginListener = () => {
        throw beginFailure;
      };
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, entityListener);
      rxdb.addEventListener(TRANSACTION_BEGIN, beginListener);

      try {
        const error = await adapter.transaction(async () => 'unreachable', false).catch((cause: unknown) => cause);
        const event = new EntityLocalCreatedEvent([]);
        rxdb.dispatchEvent(event);

        expect(error).toMatchObject({ message: beginFailure.message, cause: beginFailure });
        expect(entityListener).toHaveBeenCalledWith(event);
        // 只断言**事务 SQL**：BEGIN listener 抛在派发 BEGIN 那一步，事务的任何语句都不该落库。
        // 不能断言 `executedSqls(client)` 整体为空 —— 版本管理的活分支查询
        // （`SELECT ... FROM "rxdb$rxdb_branch" WHERE "activated" = 1`）与本事务无关，
        // 它落进观察窗口的时刻取决于就绪门的微任务时序（C1 之后早一个 tick），断言它等于
        // 把无关查询的调度时序锁死在测试里。
        expect(executedSqls(client).filter(sql => /BEGIN|COMMIT|ROLLBACK|PRAGMA/.test(sql))).toEqual([]);
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining('TRANSACTION_ROLLBACK listener threw'),
          rollbackFailure
        );
      } finally {
        errorSpy.mockRestore();
        rxdb.removeEventListener(TRANSACTION_BEGIN, beginListener);
        rxdb.removeEventListener(TRANSACTION_ROLLBACK, rollbackListener);
        rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, entityListener);
        await adapter.disconnect();
        await rxdb.disconnectAll();
      }
    });

    it('事务内经 executor 的查询直发到事务连接，不再入队', async () => {
      // C2 语义反转：旧实现里事务体内的**裸** `adapter.query()` 会走直通快路径落进当前事务；
      // 那正是 `SQLC-001` —— 外部并发写因此被卷进他人事务并跟着回滚消失。
      // 现在事务内的读写必须经 executor；裸 `adapter.query()` 是外部调用，一律重新排队
      //（在事务体内那样写会挂起，属预期语义，不在此用例范围内）。
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      const result = await adapter.transaction(async executor => {
        await executor.execute('SELECT inner');
        return 'done';
      });

      expect(result).toBe('done');
      const sqls = transactionSqls(client);
      expect(sqls.indexOf('SELECT inner')).toBeGreaterThan(0);
      expect(sqls.at(-1)).toContain('COMMIT');
    });

    it('事务内经 executor 的 mutations 复用当前事务，不新开', async () => {
      // 旧实现靠 `#transaction_lock` 判断「已在事务中就直接执行」；C2 改为按 executor 身份，
      // 因此内层写必须走 `executor.mutations()`。裸 `adapter.mutations()` 现在是外部调用。
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      const result = await adapter.transaction(async executor => executor.mutations(emptyMutations()));

      expect(result).toEqual([]);
      const beginCount = executedSqls(client).filter(sql => sql.includes('BEGIN')).length;
      expect(beginCount).toBe(1);
    });

    it('事务外 mutations 自动包裹在事务中', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await expect(adapter.mutations(emptyMutations())).resolves.toEqual([]);

      const sqls = transactionSqls(client);
      expect(sqls[0]).toContain('BEGIN');
      expect(sqls.at(-1)).toContain('COMMIT');
    });

    it('事务函数抛错时执行 ROLLBACK 并包装为适配器错误', async () => {
      const client = createClient();
      const rxdb = createRxdbMock();
      const adapter = new TestAdapter(rxdb, () => client);
      const failure = new Error('inner boom');

      const error = await adapter
        .transaction(async () => {
          throw failure;
        })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(RxDBAdapterSqliteError);
      expect(error).toMatchObject({ message: 'inner boom', cause: failure });
      expect(executedSqls(client)).toContain('ROLLBACK');
      expect(rxdb.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'TRANSACTION_ROLLBACK' }));
    });

    // COMMIT 成功后才派发 TRANSACTION_COMMIT_EVENT，但 catch 只判断 transactionStarted，
    // 于是监听器一抛错就照发 ROLLBACK，还把监听器的错误包装成事务错误往外抛 ——
    // 调用方以为事务失败了，而数据其实已经提交。这是对结果撒谎。
    // 与本仓既有策略一致（见 sqlite-wasm 的 #dispatch_group）：监听器抛错属于监听器自身缺陷，就地记录并继续。
    it('COMMIT 成功后监听器抛错不得回滚，也不得把事务报成失败', async () => {
      const client = createClient();
      const rxdb = createRxdbMock();
      const listenerFailure = new Error('listener boom');
      vi.mocked(rxdb.dispatchEvent).mockImplementation((event: unknown) => {
        if ((event as { type?: string }).type === 'TRANSACTION_COMMIT') throw listenerFailure;
      });
      const adapter = new TestAdapter(rxdb, () => client);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(adapter.transaction(async () => 'committed-value')).resolves.toBe('committed-value');

      const sqls = transactionSqls(client);
      expect(sqls.some(sql => sql.includes('COMMIT'))).toBe(true);
      expect(sqls).not.toContain('ROLLBACK');
      expect(rxdb.dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'TRANSACTION_ROLLBACK' }));
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('COMMIT 自身失败时仍然回滚并派发回滚事件', async () => {
      const client = createClient({
        execute: vi.fn(async (sql: string) => {
          if (sql.includes('COMMIT')) throw new Error('commit boom');
          return okResult(sql);
        })
      });
      const rxdb = createRxdbMock();
      const adapter = new TestAdapter(rxdb, () => client);

      await expect(adapter.transaction(async () => 'x')).rejects.toThrow('commit boom');

      expect(executedSqls(client)).toContain('ROLLBACK');
      expect(rxdb.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'TRANSACTION_ROLLBACK' }));
    });

    it('ROLLBACK 失败时应该保留原始错误并关闭异常连接', async () => {
      const transactionFailure = new Error('inner boom');
      const client = createClient({
        execute: vi.fn(async (sql: string) => {
          if (sql === 'ROLLBACK') throw new Error('rollback boom');
          return okResult(sql);
        })
      });
      const adapter = new TestAdapter(createRxdbMock(), () => client);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const error = await adapter
        .transaction(async () => {
          throw transactionFailure;
        })
        .catch((err: unknown) => err);

      expect(error).toMatchObject({ message: transactionFailure.message, cause: transactionFailure });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ROLLBACK failed'), expect.any(Error));
      expect(client.disconnect).toHaveBeenCalledTimes(1);
      await expect(adapter.query('SELECT after rollback failure')).rejects.toThrow('Adapter is disconnected');
      errorSpy.mockRestore();
    });

    it('ROLLBACK 失败后应该拒绝失败前已经排队的事务', async () => {
      let releaseTransaction!: () => void;
      let transactionEntered!: () => void;
      const releasePromise = new Promise<void>(resolve => {
        releaseTransaction = resolve;
      });
      const enteredPromise = new Promise<void>(resolve => {
        transactionEntered = resolve;
      });
      const client = createClient({
        execute: vi.fn(async (sql: string) => {
          if (sql === 'ROLLBACK') throw new Error('rollback boom');
          return okResult(sql);
        })
      });
      const adapter = new TestAdapter(createRxdbMock(), () => client);
      const queuedCallback = vi.fn(async () => 'must not run');
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const failedTransaction = adapter.transaction(async () => {
        transactionEntered();
        await releasePromise;
        throw new Error('first transaction boom');
      }, false);
      const queuedQuery = adapter.query('SELECT queued after rollback failure');
      await enteredPromise;
      const queuedTransaction = adapter.transaction(queuedCallback, false);
      releaseTransaction();

      await expect(failedTransaction).rejects.toThrow('first transaction boom');
      await expect(queuedQuery).rejects.toThrow('Adapter is disconnected');
      await expect(queuedTransaction).rejects.toThrow('Adapter is disconnected');
      expect(queuedCallback).not.toHaveBeenCalled();
      expect(adapter.createClientCalls).toBe(1);
      expect(executedSqls(client)).not.toContain('SELECT queued after rollback failure');
      errorSpy.mockRestore();
    });

    it('非 Error 拒绝时使用默认事务错误消息', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      const error = await adapter.transaction(() => Promise.reject('plain failure')).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(RxDBAdapterSqliteError);
      expect(error).toMatchObject({ message: 'Transaction Error' });
    });

    it('client 提供 beginTransactionSql 时用其替换默认 BEGIN', async () => {
      const client = createClient({ beginTransactionSql: vi.fn(() => 'PRAGMA write_hint;\nBEGIN IMMEDIATE;') });
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await adapter.transaction(async () => 'ok');

      const sqls = transactionSqls(client);
      expect(sqls[0]).toContain('PRAGMA write_hint;\nBEGIN IMMEDIATE;');
      expect(sqls[0]).toContain('PRAGMA defer_foreign_keys = ON;');
    });

    it('client 未提供 beginTransactionSql 时沿用默认 BEGIN', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await adapter.transaction(async () => 'ok');

      const sqls = transactionSqls(client);
      expect(sqls[0]).toContain('BEGIN;');
      expect(sqls[0]).toContain('PRAGMA defer_foreign_keys = ON;');
    });

    it('beginTransactionSql 返回 Promise（Comlink 远端代理）时会被等待', async () => {
      const client = createClient({
        beginTransactionSql: vi.fn(() => Promise.resolve('PRAGMA write_hint;\nBEGIN IMMEDIATE;'))
      });
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await adapter.transaction(async () => 'ok');

      const sqls = transactionSqls(client);
      expect(sqls[0]).toContain('PRAGMA write_hint;');
      expect(sqls[0]).toContain('BEGIN IMMEDIATE;');
      expect(sqls[0]).not.toContain('[object Promise]');
    });
  });

  describe('saveMany / removeMany', () => {
    it('saveMany 在事务中创建实体并回查同步状态', async () => {
      const rxdb = createRealRxdb('sqlite-core-base-save-many');
      const client = createClient({
        execute: vi.fn(async (sql: string) => {
          if (sql.trimStart().startsWith('SELECT')) {
            return okResult(sql, [
              { columns: TODO_COLUMNS, rows: [[1, 'todo-save', 'saved-in-db', 0, ISO_CREATED, ISO_UPDATED]] }
            ]);
          }
          return okResult(sql, [], 1);
        })
      });
      const adapter = new TestAdapter(rxdb, () => client);
      const entity = rxdb.entityManager.createEntityRef(Todo, {
        id: 'todo-save',
        title: 'local-title',
        completed: false,
        createdAt: new Date(ISO_CREATED),
        updatedAt: new Date(ISO_CREATED)
      } as EntityUpdateData<typeof Todo>);

      const saved = await adapter.saveMany([entity]);

      expect(saved).toHaveLength(1);
      expect(saved[0]).toBe(entity);
      expect(entity.title).toBe('saved-in-db');
      expect(getEntityStatus(entity)).toMatchObject({ local: true, modified: false });
      expect(adapter.getEntityByRowId(1n, Todo)).toBe(entity);
      const sqls = transactionSqls(client);
      expect(sqls[0]).toContain('BEGIN');
      expect(sqls.some(sql => sql.startsWith('INSERT INTO "public$todos"'))).toBe(true);
      expect(sqls.at(-1)).toContain('COMMIT');
    });

    it('removeMany 在事务中删除本地实体并同步状态', async () => {
      const rxdb = createRealRxdb('sqlite-core-base-remove-many');
      const client = createClient();
      const adapter = new TestAdapter(rxdb, () => client);
      const entity = rxdb.entityManager.createEntityRef(
        Todo,
        {
          id: 'todo-gone',
          title: 'to-remove',
          completed: false,
          createdAt: new Date(ISO_CREATED),
          updatedAt: new Date(ISO_CREATED)
        } as EntityUpdateData<typeof Todo>,
        { local: true, modified: false }
      );

      const removed = await adapter.removeMany([entity]);

      expect(removed).toHaveLength(1);
      expect(removed[0]).toBe(entity);
      expect(getEntityStatus(entity)).toMatchObject({ removed: true, local: false, modified: false });
      const deleteSql = executedSqls(client).find(sql => sql.startsWith('DELETE FROM "public$todos"'));
      expect(deleteSql).toContain(`'todo-gone'`);
    });
  });

  // 本包所有物理表名都由 get_table_name(name, namespace) => `${namespace}$${name}` 生成，
  // 而 QueryCacheRepository 传进来的是**逻辑实体名**（如 'Todo'）。此前三个方法把它直接当表名，
  // 真机执行必然 `no such table: Todo`；updatedAt 也被硬编码为列名，自定义 columnName 的实体会再次失败。
  // 对照 PGlite 适配器同名方法，它走的是 schemaManager.getEntityMetadata → metadata.tableName。
  // QueryCache 的 upsertMany / deleteByIds 是**真实数据写路径**（QueryCacheRepository 的
  // create/update/delete/pull 全经此写本地缓存），由 RxJS Observable 驱动、落地时机不可控。
  // 它们原先走 internalQuery → 不入队、不看 #transaction_lock，而 #client() 是同一个连接，
  // 于是只要有 transaction() 在跑，这些写入就会被该事务的 ROLLBACK 一并回滚 ——
  // 远端同步下来的数据静默丢失，调用方却拿到 void 成功信号。
  describe('QueryCache 写入必须串行化', () => {
    const createOrderedClient = () => {
      const order: string[] = [];
      const client = createClient({
        execute: vi.fn(async (sql: string) => {
          order.push(sql);
          return okResult(sql);
        })
      });
      return { client, order };
    };

    it('upsertMany 不得插进正在执行的事务窗口', async () => {
      const { client, order } = createOrderedClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);
      let releaseTx!: () => void;
      const gate = new Promise<void>(resolve => {
        releaseTx = resolve;
      });

      const tx = adapter.transaction(async () => {
        await gate;
        return 'tx-done';
      });
      // 事务已进入执行窗口后才发起 QueryCache 写入
      await Promise.resolve();
      const write = firstValueFrom(adapter.upsertMany('todos', [{ id: 'a', updatedAt: 'x' }]));
      releaseTx();
      await Promise.all([tx, write]);

      const commitIndex = order.findIndex(sql => sql.includes('COMMIT'));
      const upsertIndex = order.findIndex(sql => sql.startsWith('INSERT INTO'));
      expect(commitIndex).toBeGreaterThanOrEqual(0);
      expect(upsertIndex).toBeGreaterThan(commitIndex);
    });

    it('deleteByIds 不得插进正在执行的事务窗口', async () => {
      const { client, order } = createOrderedClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);
      let releaseTx!: () => void;
      const gate = new Promise<void>(resolve => {
        releaseTx = resolve;
      });

      const tx = adapter.transaction(async () => {
        await gate;
        return 'tx-done';
      });
      await Promise.resolve();
      const del = firstValueFrom(adapter.deleteByIds('todos', ['id-1']));
      releaseTx();
      await Promise.all([tx, del]);

      const commitIndex = order.findIndex(sql => sql.includes('COMMIT'));
      const deleteIndex = order.findIndex(sql => sql.startsWith('DELETE FROM'));
      expect(commitIndex).toBeGreaterThanOrEqual(0);
      expect(deleteIndex).toBeGreaterThan(commitIndex);
    });

    it('事务窗口内发起的 QueryCache 写入排到事务之后，不被卷进事务', async () => {
      // C2 语义反转。旧契约是「事务内部调用 QueryCache 写入仍走快路径」——那意味着
      // QueryCache 的写会落进当时正开着的事务并跟着它回滚，正是 `SQLC-001`。
      // 新契约：QueryCache 是外部写入方，一律重新排队，因此它**必然**排在 COMMIT 之后。
      // 注意不能在事务体内 `await` 它：队列的唯一槽位正被本事务占用，那样写会挂起
      //（这是 C2 明确接受的故障形态——把静默数据损坏换成明确挂起）。
      const { client, order } = createOrderedClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      let releaseTx!: () => void;
      const gate = new Promise<void>(resolve => {
        releaseTx = resolve;
      });

      const tx = adapter.transaction(async () => {
        await gate;
        return 'ok';
      });
      await Promise.resolve();
      const upsert = firstValueFrom(adapter.upsertMany('todos', [{ id: 'a', updatedAt: 'x' }]));
      releaseTx();

      await expect(tx).resolves.toBe('ok');
      await upsert;

      const commitIndex = order.findIndex(sql => sql.includes('COMMIT'));
      const upsertIndex = order.findIndex(sql => sql.startsWith('INSERT INTO'));
      expect(commitIndex).toBeGreaterThanOrEqual(0);
      expect(upsertIndex).toBeGreaterThan(commitIndex);
    });
  });

  describe('QueryCache 表名与列名解析', () => {
    const createMetadataRxdb = () => {
      const rxdb = createRxdbMock();
      vi.mocked(rxdb.schemaManager.getEntityMetadata).mockReturnValue({
        name: 'Todo',
        namespace: 'public',
        tableName: 'todos',
        propertyMap: new Map([['updatedAt', { name: 'updatedAt', columnName: 'updated_at' }]])
      } as never);
      return rxdb;
    };

    it('getMetadataByIds 用 namespace$tableName 与映射后的列名', async () => {
      const client = createClient({
        execute: vi.fn().mockResolvedValue(okResult('SELECT', [{ columns: ['id', 'updated_at'], rows: [] }]))
      });
      const adapter = new TestAdapter(createMetadataRxdb(), () => client);

      await firstValueFrom(adapter.getMetadataByIds('Todo', ['id-1']));

      expect(vi.mocked(client.execute).mock.calls[0][0]).toContain(
        'SELECT id, "updated_at" FROM "public$todos" WHERE id IN'
      );
    });

    it('upsertMany 用 namespace$tableName', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createMetadataRxdb(), () => client);

      await firstValueFrom(adapter.upsertMany('Todo', [{ id: 'a', updatedAt: 'x' }]));

      const upsertCalls = vi.mocked(client.execute).mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO'));
      expect(upsertCalls).toHaveLength(1);
      expect(upsertCalls[0][0]).toContain('INSERT INTO "public$todos"');
      expect(upsertCalls[0][0]).toContain('ON CONFLICT ("id") DO UPDATE SET');
    });

    it('upsertMany 使用自定义物理主键列作为冲突目标', async () => {
      const client = createClient();
      const rxdb = createRxdbMock();
      vi.mocked(rxdb.schemaManager.getEntityMetadata).mockReturnValue({
        name: 'Todo',
        namespace: 'public',
        tableName: 'todos',
        propertyMap: new Map([
          ['id', { name: 'id', columnName: 'todo_id' }],
          ['updatedAt', { name: 'updatedAt', columnName: 'updated_at' }]
        ])
      } as never);
      const adapter = new TestAdapter(rxdb, () => client);

      await firstValueFrom(adapter.upsertMany('Todo', [{ id: 'a', updatedAt: 'x' }]));

      const upsertSql = vi
        .mocked(client.execute)
        .mock.calls.map(([sql]) => String(sql))
        .find(sql => sql.startsWith('INSERT INTO'));
      expect(upsertSql).toContain('("todo_id", "updated_at")');
      expect(upsertSql).toContain('ON CONFLICT ("todo_id") DO UPDATE SET "updated_at" = excluded."updated_at"');
    });

    it('deleteByIds 用 namespace$tableName', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createMetadataRxdb(), () => client);

      await firstValueFrom(adapter.deleteByIds('Todo', ['id-1']));

      const deleteCalls = vi.mocked(client.execute).mock.calls.filter(([sql]) => String(sql).startsWith('DELETE FROM'));
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][0]).toContain('DELETE FROM "public$todos" WHERE id IN');
    });

    it('metadata 缺失时回退到原名，不静默拼出错误的 namespace 前缀', async () => {
      const client = createClient();
      const rxdb = createRxdbMock();
      vi.mocked(rxdb.schemaManager.getEntityMetadata).mockReturnValue(undefined);
      const adapter = new TestAdapter(rxdb, () => client);

      await firstValueFrom(adapter.deleteByIds('unknown_table', ['id-1']));

      const deleteCalls = vi.mocked(client.execute).mock.calls.filter(([sql]) => String(sql).startsWith('DELETE FROM'));
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][0]).toContain('DELETE FROM "unknown_table" WHERE id IN');
    });
  });

  // 远端行的列集在落地前就要判：`upsertMany` 的 INSERT 列清单取自 `data[0]` 的键，
  // 实体元数据在这条路径上一次都没被读过，于是 `EntityBase.createdAt` 的
  // `default: () => new Date()`（仓储层的东西）根本不参与，而本地表把该列建成了 NOT NULL。
  // 远端不带这一列时，今天冒出来的是一条 `NOT NULL constraint failed: public$recipes.createdAt`：
  // 本地表名 + 远端没有的列名 + 适配器内部的调用栈，三重误导（US-022）。
  describe('QueryCache 远端行的列契约', () => {
    const createContractRxdb = () => {
      const rxdb = createRxdbMock();
      vi.mocked(rxdb.schemaManager.getEntityMetadata).mockReturnValue(getEntityMetadata(QcContractRecipe) as never);
      return rxdb;
    };
    const completeRow = (id: string) => ({
      id,
      title: `t-${id}`,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z'
    });

    it('远端行缺非空列时抛列契约错误，且一条 SQL 都不发（AC#1 / AC#2）', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createContractRxdb(), () => client);

      await expect(
        firstValueFrom(adapter.upsertMany('QcContractRecipe', [{ id: 'a', title: 'Pasta', updatedAt: 'x' }]))
      ).rejects.toBeInstanceOf(RxDBQueryCacheRowContractError);

      // 判在事务之前：既没有 INSERT，也没有 BEGIN —— 半批脏数据无从产生
      expect(executedSqls(client).filter(sql => sql.startsWith('INSERT INTO'))).toHaveLength(0);
      expect(executedSqls(client).filter(sql => sql.includes('BEGIN'))).toHaveLength(0);
    });

    it('异构行集被拦下，不按首行列集把后续行绑成 undefined（AC#4）', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createContractRxdb(), () => client);

      await expect(
        firstValueFrom(adapter.upsertMany('QcContractRecipe', [{ ...completeRow('a'), tag: 'x' }, completeRow('b')]))
      ).rejects.toBeInstanceOf(RxDBQueryCacheRowContractError);
      expect(executedSqls(client).filter(sql => sql.startsWith('INSERT INTO'))).toHaveLength(0);
    });

    it('列集完整时照常落地（AC#5）', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createContractRxdb(), () => client);

      await firstValueFrom(adapter.upsertMany('QcContractRecipe', [completeRow('a'), completeRow('b')]));

      const upsertCalls = vi.mocked(client.execute).mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO'));
      expect(upsertCalls).toHaveLength(1);
      expect(upsertCalls[0][0]).toContain('INSERT INTO "public$recipes"');
    });
  });

  // 契约显式放行「远端多带本地没有的列」（AC#3），可 INSERT 的列清单却取自 `data[0]` 的**全部**键，
  // 于是那些多出来的列会原样进 SQL，换来一条 `no such column: remoteOnly` —— 正是契约文件要消灭的
  // 那类误导性报错。落地的列必须由实体元数据说了算，而不是由远端载荷说了算。
  describe('QueryCache 写入只落实体认识的列', () => {
    const createContractRxdb = () => {
      const rxdb = createRxdbMock();
      vi.mocked(rxdb.schemaManager.getEntityMetadata).mockReturnValue(getEntityMetadata(QcContractRecipe) as never);
      return rxdb;
    };
    const completeRow = (id: string) => ({
      id,
      title: `t-${id}`,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z'
    });
    const upsertCall = (client: SqliteClientLike) =>
      vi.mocked(client.execute).mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO'));

    it('远端多带的未知列既不进列清单也不进绑定值（AC#3）', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createContractRxdb(), () => client);

      await firstValueFrom(
        adapter.upsertMany('QcContractRecipe', [
          { ...completeRow('a'), remoteOnly: 'x' },
          { ...completeRow('b'), remoteOnly: 'y' }
        ])
      );

      const call = upsertCall(client);
      expect(call?.[0]).not.toContain('remoteOnly');
      // 列少一个、绑定值也要少一个：只删列名会让整批的占位符与值错位
      expect(call?.[1]).not.toContain('x');
      expect(call?.[1]).toHaveLength(8);
    });

    it('关系外键列不被当成未知列滤掉', async () => {
      // 表列 = propertyMap ∪ 有物理列的关系（见 create_table_sql）。只按 propertyMap 过滤，
      // 会把合法的外键值静默丢掉 —— 比多写一列更难查
      const client = createClient();
      const rxdb = createRxdbMock();
      vi.mocked(rxdb.schemaManager.getEntityMetadata).mockReturnValue(
        transitionMetadata({
          name: 'QcRelChild',
          namespace: 'public',
          tableName: 'rel_children',
          properties: [
            { name: 'id', type: PropertyType.uuid, primary: true },
            { name: 'updatedAt', type: PropertyType.date }
          ],
          relations: [
            { name: 'owner', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'QcOwner', mappedProperty: 'children' }
          ]
        }) as never
      );
      const adapter = new TestAdapter(rxdb, () => client);

      await firstValueFrom(
        adapter.upsertMany('QcRelChild', [{ id: 'a', updatedAt: '2026-08-02T00:00:00.000Z', owner: 'owner-1' }])
      );

      expect(upsertCall(client)?.[0]).toContain('"ownerId"');
      expect(upsertCall(client)?.[1]).toContain('owner-1');
    });

    it('metadata 查不到时一列都不滤，照旧按远端键集落地', async () => {
      // 这条路径上调用方传的是物理表名、列名也已是物理列名，没有可对照的元数据，
      // 「过滤」就只剩猜 —— 与表名回退同一口径：不擅自加工
      const client = createClient();
      const rxdb = createRxdbMock();
      vi.mocked(rxdb.schemaManager.getEntityMetadata).mockReturnValue(undefined);
      const adapter = new TestAdapter(rxdb, () => client);

      await firstValueFrom(adapter.upsertMany('raw_rows', [{ id: 'a', updatedAt: 'x', whatever: 1 }]));

      expect(upsertCall(client)?.[0]).toContain('"whatever"');
    });
  });

  describe('QueryCache 方法', () => {
    it('getMetadataByIds 空数组直接返回空 Map', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      const map = await firstValueFrom(adapter.getMetadataByIds('todos', []));

      expect(map.size).toBe(0);
      expect(client.execute).not.toHaveBeenCalled();
    });

    it('getMetadataByIds 分片查询并合并各结果集', async () => {
      const client = createClient({
        execute: vi
          .fn()
          .mockResolvedValueOnce(
            okResult('SELECT', [
              {
                columns: ['id', 'updatedAt'],
                rows: [
                  ['id-1', '2026-01-01T00:00:00.000Z'],
                  ['id-2', '2026-01-02T00:00:00.000Z']
                ]
              }
            ])
          )
          .mockResolvedValueOnce(okResult('SELECT', []))
      });
      const adapter = new TestAdapter(createRxdbMock(), () => client);
      const ids = Array.from({ length: 1000 }, (_, index) => `id-${index + 1}`);

      const map = await firstValueFrom(adapter.getMetadataByIds('todos', ids));

      expect(client.execute).toHaveBeenCalledTimes(2);
      // 该用例的 mock 不返回 metadata，按契约回退到原名
      expect(vi.mocked(client.execute).mock.calls[0][0]).toContain('SELECT id, "updatedAt" FROM "todos" WHERE id IN');
      expect(vi.mocked(client.execute).mock.calls[0][1]).toHaveLength(999);
      expect(vi.mocked(client.execute).mock.calls[1][1]).toHaveLength(1);
      expect(map.size).toBe(2);
      expect(map.get('id-1')).toBe('2026-01-01T00:00:00.000Z');
    });

    it('upsertMany 空数组直接完成', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await firstValueFrom(adapter.upsertMany('todos', []));

      expect(client.execute).not.toHaveBeenCalled();
    });

    it('upsertMany 按列数分片批量写入', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);
      const data = Array.from({ length: 500 }, (_, index) => ({
        id: `id-${index}`,
        updatedAt: `2026-01-01T00:00:00.${String(index % 1000).padStart(3, '0')}Z`
      }));

      await firstValueFrom(adapter.upsertMany('todos', data));

      const upsertCalls = vi.mocked(client.execute).mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO'));
      expect(upsertCalls).toHaveLength(2);
      const [firstSql, firstParams] = upsertCalls[0];
      expect(String(firstSql)).toContain('INSERT INTO "todos" ("id", "updatedAt") VALUES');
      expect(String(firstSql)).toContain('ON CONFLICT ("id") DO UPDATE SET "updatedAt" = excluded."updatedAt"');
      expect(firstParams).toHaveLength(998);
      expect(upsertCalls[1][1]).toHaveLength(2);
    });

    it('deleteByIds 空数组直接完成', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await firstValueFrom(adapter.deleteByIds('todos', []));

      expect(client.execute).not.toHaveBeenCalled();
    });

    it('deleteByIds 分片删除', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);
      const ids = Array.from({ length: 1000 }, (_, index) => `id-${index}`);

      await firstValueFrom(adapter.deleteByIds('todos', ids));

      const deleteCalls = vi.mocked(client.execute).mock.calls.filter(([sql]) => String(sql).startsWith('DELETE FROM'));
      expect(deleteCalls).toHaveLength(2);
      expect(deleteCalls[0][0]).toContain('DELETE FROM "todos" WHERE id IN');
      expect(deleteCalls[0][1]).toHaveLength(999);
      expect(deleteCalls[1][1]).toHaveLength(1);
    });
  });

  describe('encryption facade', () => {
    it('无加密列时所有方法抛 no_encrypted_columns 且 facade 单例缓存', async () => {
      const adapter = new TestAdapter(createRxdbMock(), () => createClient());
      await adapter.connect();

      const facade = adapter.encryption;
      expect(adapter.encryption).toBe(facade);

      await expect(facade.unlock({ keyBytes: new Uint8Array(32) })).rejects.toMatchObject({
        code: 'no_encrypted_columns'
      });
      expect(() => facade.lock()).toThrow(EncryptedConfigurationError);
      expect(() => facade.isInitialized()).toThrow(EncryptedConfigurationError);
      expect(() => facade.isLocked).toThrow(EncryptedConfigurationError);
      expect(() => facade.lockChange$).toThrow(EncryptedConfigurationError);
      expect(adapter.encryptionContext.keyring).toBeNull();
    });

    it('有加密列时委托 Keyring 完成解锁/加锁与状态查询', async () => {
      const client = createClient({ execute: vi.fn(async (sql: string) => okResult(sql)) });
      const rxdb = createRxdbMock([SecretNote]);
      const adapter = new TestAdapter(rxdb, () => client);
      await adapter.connect();

      expect(adapter.encryptionContext.keyring).not.toBeNull();
      expect(adapter.encryptionContext.namespace).toBe('sqlite-core-base-mock');
      expect(adapter.encryption.isLocked).toBe(true);
      await expect(adapter.encryption.isInitialized()).resolves.toBe(false);

      await adapter.encryption.unlock({ keyBytes: new Uint8Array(32).fill(7) });

      expect(adapter.encryption.isLocked).toBe(false);
      await expect(firstValueFrom(adapter.encryption.lockChange$)).resolves.toBe(false);
      const insertSql = executedSqls(client).find(sql => sql.startsWith('INSERT OR FAIL INTO rxdb_db_keyring'));
      expect(insertSql).toBeDefined();

      adapter.encryption.lock();
      expect(adapter.encryption.isLocked).toBe(true);
    });
  });

  describe('SQLite 变更事件监听', () => {
    it('连接后变更事件进入 handle_rxdb_change，断开后被忽略', async () => {
      const client = createClient();
      const rxdb = createRxdbMock();
      const adapter = new TestAdapter(rxdb, () => client);
      await adapter.connect();

      const handler = vi.mocked(client.addEventListener).mock.calls[0][1];
      const event: SqliteChangeEvent = {
        type: SQLiteChangeType.SQLITE_INSERT,
        dbName: 'test-db',
        tableName: 'nope$missing_table',
        rowIds: [1n],
        recordAt: new Date()
      };

      handler(event);
      expect(rxdb.schemaManager.getEntityTypeByTableName).toHaveBeenCalledWith('missing_table', 'nope');

      await adapter.disconnect();
      handler(event);
      expect(rxdb.schemaManager.getEntityTypeByTableName).toHaveBeenCalledTimes(1);
    });
  });

  describe('switchBranch / mergeChanges 委托', () => {
    it('switchBranch 在事务中执行分支切换 SQL', async () => {
      const client = createClient();
      const rxdb = createRealRxdb('sqlite-core-base-switch-branch');
      const adapter = new TestAdapter(rxdb, () => client);

      await adapter.switchBranch({ branchId: 'feature' });

      const sqls = transactionSqls(client);
      expect(sqls[0]).toContain('BEGIN');
      expect(sqls.some(sql => sql.includes('"rxdb$rxdb_branch"') && sql.includes(`'feature'`))).toBe(true);
      expect(sqls.at(-1)).toContain('COMMIT');
    });

    it('switchBranch 失败时包装错误信息', async () => {
      const client = createClient({
        execute: vi.fn(async (sql: string) => {
          if (sql.includes('rxdb$rxdb_branch')) throw new Error('branch update boom');
          return okResult(sql);
        })
      });
      const adapter = new TestAdapter(createRxdbMock(), () => client);

      await expect(adapter.switchBranch({ branchId: 'feature' })).rejects.toThrow('switch branch feature failed');
    });

    it('mergeChanges 空 actions 也走完整事务提交', async () => {
      const client = createClient();
      const adapter = new TestAdapter(createRxdbMock(), () => client);
      const actions: SwitchVersionActions = { deletes: new Map(), inserts: new Map(), updates: new Map() };

      await expect(adapter.mergeChanges(actions)).resolves.toBeUndefined();

      const sqls = transactionSqls(client);
      expect(sqls[0]).toContain('BEGIN');
      expect(sqls.at(-1)).toContain('COMMIT');
    });
  });
});
