import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../entity/metadata-options.interface.js';
import type { RxDBOptions } from '../rxdb.interface.js';
import { RxDB } from '../RxDB.js';
import { RxDBMigration } from '../system/migration.js';
import { createMockAdapter, type MockLocalAdapter } from './fixtures/test-db-setup.js';

const databases = new Set<RxDB>();
let databaseSequence = 0;

/** 先建库、再由库造适配器，和真实 `AdapterFactory` 拿到数据库实例的顺序一致。 */
const createDatabase = (migrations: RxDBOptions['migrations']): { database: RxDB; adapter: MockLocalAdapter } => {
  databaseSequence += 1;
  const database = new RxDB({
    dbName: `rxdb-watermark-${databaseSequence}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None },
    migrations
  });
  const adapter = createMockAdapter(database);
  database.adapter('local', () => adapter);
  databases.add(database);
  return { database, adapter };
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
 * 首装路径的迁移水位线。
 *
 * 首装走 `createTables()`：建出来的表就是**当前**实体定义的形态，配置里的迁移全部无需执行。
 * 但首装分支从不写 `RxDBMigration` 记录，于是下一次启动（表已存在 → 走迁移流程）读到的
 * 已执行集合是空的，每一条迁移都会被当成「从未跑过」重新执行一遍 —— 打在一个已经是最新
 * 形态的库上，轻则报错，重则改坏数据。
 */
describe('迁移水位线', () => {
  it('首装建表后写入水位线，下次启动不再重跑迁移', async () => {
    const up = vi.fn<() => Promise<void>>(async () => undefined);
    const migrations: RxDBOptions['migrations'] = [
      { name: 'init-schema', up, down: vi.fn<() => Promise<void>>(async () => undefined) }
    ];
    const { database: first, adapter } = createDatabase(migrations);

    // 首装：RxDBMigration 表不存在 → 直接建表，迁移不该被执行
    adapter.isTableExisted.mockResolvedValue(false);
    first.init();
    const created: RxDBMigration[] = [];
    adapter.createTables.mockImplementation(async (_entityTypes, entities = []) => {
      created.push(...entities.filter((entity): entity is RxDBMigration => entity instanceof RxDBMigration));
      return true;
    });
    const migrationRepository = {
      find: vi.fn(async () => created.slice()),
      count: vi.fn(async () => created.length),
      create: vi.fn(async (record: RxDBMigration) => {
        created.push(record);
        return record;
      }),
      update: vi.fn(),
      remove: vi.fn()
    };
    adapter.getRepository.mockReturnValue(migrationRepository as never);

    await first.connect('local');

    expect(adapter.createTables).toHaveBeenCalledTimes(1);
    expect(up).not.toHaveBeenCalled();
    expect(created.map(record => record.name)).toEqual(['init-schema']);

    await first.disconnectAll();

    // 下次启动（新页面、同一个库）：新的 RxDB、新的适配器实例，表已存在 → 走迁移流程。
    // 存储是同一份，所以复用 migrationRepository —— 它的 find() 会回放首装写下的水位线。
    const { database: second, adapter: secondAdapter } = createDatabase(migrations);
    secondAdapter.isTableExisted.mockResolvedValue(true);
    secondAdapter.getRepository.mockReturnValue(migrationRepository as never);
    second.init();

    await second.connect('local');

    expect(up).not.toHaveBeenCalled();
  });
});

describe('实体索引收敛时序', () => {
  it('必须等用户迁移和缺表补建完成后再收敛索引', async () => {
    const order: string[] = [];
    const migrations: RxDBOptions['migrations'] = [
      {
        name: 'add-indexed-column',
        up: vi.fn(async () => {
          order.push('migration');
        }),
        down: vi.fn(async () => undefined)
      }
    ];
    const { database, adapter } = createDatabase(migrations);
    adapter.reconcileEntityIndexes = vi.fn(async () => {
      order.push('reconcile');
    });
    adapter.isTableExisted.mockResolvedValue(true);
    const defaultRepository = adapter.getRepository(RxDBMigration as never);
    adapter.getRepository.mockImplementation((EntityType: unknown) =>
      EntityType === RxDBMigration ?
        ({
          find: vi.fn(async () => []),
          count: vi.fn(async () => 0),
          create: vi.fn(async (record: RxDBMigration) => record),
          update: vi.fn(),
          remove: vi.fn()
        } as never)
      : defaultRepository
    );
    database.init();

    await database.connect('local');

    expect(order).toEqual(['migration', 'reconcile']);
    expect(adapter.reconcileEntityIndexes).toHaveBeenCalledOnce();
  });
});

describe('首装原子提交（RXD-051）', () => {
  it('水位线写入失败时整体回滚，不留下「有表无记录」的中间态', async () => {
    const up = vi.fn<() => Promise<void>>(async () => undefined);
    const migrations: RxDBOptions['migrations'] = [
      { name: 'init-schema', up, down: vi.fn<() => Promise<void>>(async () => undefined) }
    ];
    const { database: first, adapter } = createDatabase(migrations);
    adapter.isTableExisted.mockResolvedValue(false);
    first.init();
    const saveFailure = new Error('watermark write failed');
    let tablesPersisted = false;
    adapter.createTables.mockImplementation(async (_entityTypes, entities = []) => {
      if (entities.some(entity => entity instanceof RxDBMigration)) throw saveFailure;
      tablesPersisted = true;
      return true;
    });
    adapter.getRepository.mockReturnValue({
      find: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      create: vi.fn(async () => {
        throw saveFailure;
      }),
      update: vi.fn(),
      remove: vi.fn()
    } as never);

    await expect(first.connect('local')).rejects.toThrow('watermark write failed');

    expect(tablesPersisted).toBe(false);
    expect(adapter.createTables).toHaveBeenCalledTimes(1);
  });

  it('把分支初始数据与 migration 水位线交给同一次建表', async () => {
    const migrations: RxDBOptions['migrations'] = [
      { name: 'init-schema', up: vi.fn(async () => undefined), down: vi.fn(async () => undefined) }
    ];
    const { database: db, adapter } = createDatabase(migrations);
    adapter.isTableExisted.mockResolvedValue(false);
    db.init();

    await db.connect('local');

    const initialEntities = adapter.createTables.mock.calls[0]?.[1] ?? [];
    expect(initialEntities[0]).toEqual(expect.objectContaining({ id: 'main', activated: true }));
    expect(initialEntities.slice(1)).toEqual([
      expect.objectContaining({ name: 'init-schema', executedAt: expect.any(Date) })
    ]);
    expect(adapter.transaction).not.toHaveBeenCalled();
  });
});

/**
 * RXD-036：迁移执行的仲裁者必须是数据库唯一约束，不是一次「查全表再判断」的快照。
 *
 * 旧实现：读出全部已执行名字 → 跑 `up()` → 写记录。两个实例并发启动时都读到同一份
 * 空快照，同一条非幂等迁移会被执行两遍。快照与写之间的窗口是无法靠读消除的，
 * 只能让写本身去竞争。
 *
 * 新实现：先 `create()` 认领执行权再 `up()`。谁的 INSERT 先落谁执行；输的那个撞唯一索引，
 * 整个事务回滚，重读后发现名字已在，直接跳过 —— `up()` 一次都不会跑。
 */
describe('迁移占坑与唯一约束（RXD-036）', () => {
  /** 造一个「表已存在」的启动路径，并给 `RxDBMigration` 仓库打上可编排的桩。 */
  const createExistingDatabase = (
    migrations: NonNullable<RxDBOptions['migrations']>,
    repository: Partial<Record<'find' | 'create', unknown>>
  ) => {
    const { database, adapter } = createDatabase(migrations);
    adapter.isTableExisted.mockResolvedValue(true);
    const migrationRepository = {
      count: vi.fn(async () => 0),
      update: vi.fn(),
      remove: vi.fn(),
      ...repository
    };
    // 只替换 RxDBMigration 的仓库。全量替换会让引导期的其它读（RxDBSync / RxDBBranch）
    // 也消耗 find 的 mockResolvedValueOnce 序列，执行权竞争的重放脚本会错位。
    const defaultRepository = adapter.getRepository(RxDBMigration as never);
    adapter.getRepository.mockImplementation((EntityType: unknown) =>
      EntityType === RxDBMigration ? (migrationRepository as never) : (defaultRepository as never)
    );
    database.init();
    return { database, adapter };
  };

  it('先占坑再执行：记录写在 up() 之前', async () => {
    const order: string[] = [];
    const migrations: RxDBOptions['migrations'] = [
      {
        name: 'add-column',
        up: vi.fn(async () => {
          order.push('up');
        }),
        down: vi.fn(async () => undefined)
      }
    ];

    const { database } = createExistingDatabase(migrations, {
      find: vi.fn(async () => []),
      create: vi.fn(async (record: RxDBMigration) => {
        order.push('claim');
        return record;
      })
    });

    await database.connect('local');

    expect(order).toEqual(['claim', 'up']);
  });

  it('占坑撞唯一约束：整批回滚重试，重试时发现已被别人执行，up() 一次都不跑', async () => {
    const up = vi.fn(async () => undefined);
    const migrations: RxDBOptions['migrations'] = [{ name: 'add-column', up, down: vi.fn(async () => undefined) }];

    // 第一趟读到空快照 → 认领执行权撞唯一索引；第二趟读到对手已提交的记录 → 直接跳过
    const find = vi
      .fn<() => Promise<{ name: string }[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ name: 'add-column' }]);
    const create = vi.fn(async () => {
      throw new Error('UNIQUE constraint failed: rxdb_migration.name');
    });

    const { database } = createExistingDatabase(migrations, { find, create });

    await expect(database.connect('local')).resolves.toBeDefined();

    expect(up).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('占坑始终抢不到：重试用尽后抛错，不静默跳过迁移', async () => {
    const up = vi.fn(async () => undefined);
    const migrations: RxDBOptions['migrations'] = [{ name: 'add-column', up, down: vi.fn(async () => undefined) }];

    const { database } = createExistingDatabase(migrations, {
      // 每次重读都还说「没人跑过」，但每次认领执行权都被抢先 —— 活锁必须报出来
      find: vi.fn(async () => []),
      create: vi.fn(async () => {
        throw new Error('UNIQUE constraint failed: rxdb_migration.name');
      })
    });

    await expect(database.connect('local')).rejects.toThrow(/add-column/);
    expect(up).not.toHaveBeenCalled();
  });

  it('非唯一约束的写失败原样上抛，不当成占坑冲突重试', async () => {
    const create = vi.fn(async () => {
      throw new Error('disk I/O error');
    });
    const migrations: RxDBOptions['migrations'] = [
      { name: 'add-column', up: vi.fn(async () => undefined), down: vi.fn(async () => undefined) }
    ];

    const { database } = createExistingDatabase(migrations, { find: vi.fn(async () => []), create });

    await expect(database.connect('local')).rejects.toThrow('disk I/O error');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('up() 自己抛的唯一约束错误不被误判为占坑冲突', async () => {
    const up = vi.fn(async () => {
      throw new Error('UNIQUE constraint failed: user.email');
    });
    const migrations: RxDBOptions['migrations'] = [{ name: 'add-column', up, down: vi.fn(async () => undefined) }];

    const { database } = createExistingDatabase(migrations, {
      find: vi.fn(async () => []),
      create: vi.fn(async (record: RxDBMigration) => record)
    });

    await expect(database.connect('local')).rejects.toThrow('UNIQUE constraint failed: user.email');
    // 误判成执行权竞争就会重试，非幂等迁移被跑第二遍
    expect(up).toHaveBeenCalledTimes(1);
  });
});
