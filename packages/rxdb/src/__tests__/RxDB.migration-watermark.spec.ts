/**
 * @fileoverview 首装水位线与迁移执行权竞争（宿主侧）。
 *
 * @remarks
 * 本文件测的是**接缝**，不是任何一个贡献方的载荷：分支行、贡献方初始行、系统与接入方两条
 * 迁移水位线必须搭在**同一次** `createTables()` 上。载荷（epic-006 那四行长什么样）归
 * `@aiao/rxdb-plugin-working-tree` 自己的 spec 管——那些类在包外，核心连名字都不该认识。
 *
 * 因此这里用一个**假贡献方**（见 {@link probeContribution}）。它不是为了省事：核心今天
 * **自带零条系统迁移**（`system/migrations/index.ts` 自陈，`0004-working-tree-commits` 随插件
 * 走了），而 `runMigrations()` 开头就是 `if (!migrations || migrations.length === 0) return;`
 * ——空链一次读都不发。不挂一个贡献方，这里每一条关于「系统链与接入方链是两条独立的链」
 * 的断言都会退化成只测接入方那一条，而且**不会有任何东西变红**。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../entity/entity-base.js';
import { Entity } from '../entity/entity.decorator.js';
import { PropertyType, SyncType } from '../entity/metadata-options.interface.js';
import type { RxDBSystemContribution } from '../rxdb-plugin-system.js';
import type { Plugin } from '../rxdb-plugin.js';
import type { RxDBOptions } from '../rxdb.interface.js';
import { RxDB } from '../RxDB.js';
import { ACTIVE_BRANCH_KEY } from '../system/active-branch-guard.js';
import { RxDBBranch } from '../system/branch.js';
import { capabilityWatermarkName } from '../system/capability-watermark.js';
import { RxDBMigration } from '../system/migration.js';
import { createMockAdapter, type MockLocalAdapter, stubAdapterRepository } from './fixtures/test-db-setup.js';

/** 假贡献方的唯一一张系统表；存在的意义只是「建表那一批里有一行不是核心写的」。 */
@Entity({
  namespace: 'rxdb',
  name: 'WatermarkProbeState',
  tableName: 'rxdb_watermark_probe_state',
  log: false,
  properties: [{ name: 'branchId', type: PropertyType.string }]
})
class WatermarkProbeState extends EntityBase {
  branchId!: string;
}

const PROBE_PACKAGE = '@example/rxdb-plugin-watermark-probe';
const PROBE_MIGRATION_NAME = '0001-watermark-probe';

/**
 * 一个「一张表、一行初始数据、一条迁移」的最小系统贡献方。
 *
 * @remarks
 * 三样各对应建表那一批里的一段，缺一段就测不出它有没有被漏掉：表进 `config.entities`、
 * 初始行进 `createTables()` 的第二个参数、迁移名进 `createMigrationWatermarks()`。
 */
const probeContribution: RxDBSystemContribution = {
  capability: 'watermarkProbe',
  version: 1,
  packageSpecifier: PROBE_PACKAGE,
  entities: [WatermarkProbeState],
  createInitialRows: (entityManager, context) => {
    const row = entityManager.instantiate(WatermarkProbeState);
    row.branchId = context.branchIds[0];
    return [row];
  },
  createMigrations: () => [{ name: PROBE_MIGRATION_NAME, up: async () => undefined, down: async () => undefined }],
  // 六个成员都是必填。本文件用不上后三个，但宿主在 `connect()` 收尾、`create_branch` 结尾与
  // `remove_branch` 结尾都是**无条件**遍历贡献去调的，省掉一个不是「没有这项贡献」，是当场 TypeError。
  bootstrapExisting: async () => undefined,
  writeBranchRows: async () => undefined,
  removeBranchRows: async () => undefined,
  prepareBranchSwitch: async () => undefined
};

const probePlugin: Plugin = () => ({
  name: 'watermarkProbe',
  system: probeContribution,
  install: () => undefined
});

/**
 * 贡献方的能力认领行。
 *
 * @remarks
 * 它由宿主自动追加在贡献方自己的迁移**之后**（`createSystemMigrations()` 对每个贡献方展开成
 * `[...createMigrations(), 认领行]`），而 `createMigrationWatermarks()` 是**按序 map、不排序**的
 * ——于是首装写下的水位线顺序就是这个展开顺序，与既有库上 `runMigrations()` 那次
 * `localeCompare` 排序后的执行顺序并不相同。
 */
const PROBE_CLAIM_ROW = capabilityWatermarkName(probeContribution);

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
  // 必须在 `init()` 之前——贡献了系统能力的插件晚于 `init()` 才 `use()` 会被宿主当场拒绝。
  // 全文件统一挂，是因为「系统链非空」是本文件每一条用例的前置，不是某几条的布景。
  database.use(probePlugin);
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
    stubAdapterRepository(adapter, migrationRepository);

    await first.connect('local');

    expect(adapter.createTables).toHaveBeenCalledTimes(1);
    expect(up).not.toHaveBeenCalled();
    // 首装同时写下系统迁移与接入方迁移的水位线。少写系统那两条，下次启动会在一张
    // **已经初始化过**的库上重跑贡献方的 up()，撞主键。
    expect(created.map(record => record.name)).toEqual([PROBE_MIGRATION_NAME, PROBE_CLAIM_ROW, 'init-schema']);

    await first.disconnectAll();

    // 下次启动（新页面、同一个库）：新的 RxDB、新的适配器实例，表已存在 → 走迁移流程。
    // 存储是同一份，所以复用 migrationRepository —— 它的 find() 会回放首装写下的水位线。
    const { database: second, adapter: secondAdapter } = createDatabase(migrations);
    secondAdapter.isTableExisted.mockResolvedValue(true);
    stubAdapterRepository(secondAdapter, migrationRepository);
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
    // 取**实现**而不是取一次调用结果：默认桩按实体分流（能力行有自己那份），
    // 拿单次结果当兜底会把 `CommitCapabilityState` 也换成通用桩，握手就读不到那一行了。
    const defaultGetRepository = adapter.getRepository.getMockImplementation();
    adapter.getRepository.mockImplementation((EntityType: unknown) =>
      EntityType === RxDBMigration ?
        ({
          find: vi.fn(async () => []),
          count: vi.fn(async () => 0),
          create: vi.fn(async (record: RxDBMigration) => record),
          update: vi.fn(),
          remove: vi.fn()
        } as never)
      : (defaultGetRepository?.(EntityType as never) as never)
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
    stubAdapterRepository(adapter, {
      find: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      create: vi.fn(async () => {
        throw saveFailure;
      }),
      update: vi.fn(),
      remove: vi.fn()
    });

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
    // 「同一次建表」是这条用例的全部内容：主分支、**贡献方**的初始行、三条水位线
    // （贡献方迁移 + 它的能力认领行 + 接入方迁移）必须搭在**同一次** createTables 上。
    // 拆成第二次写入，中间崩一下库就停在「有表无记录」——下次启动重跑全部迁移，
    // 打在已是最新形态的库上。
    // 按 label 而不是 `EntityClass.name` 比对：`@Entity()` 装饰器返回的是匿名子类，
    // `.name` 一律是空串，全部相等的断言只会永远为真。
    const initialEntityClasses: readonly [label: string, EntityClass: new () => object][] = [
      ['RxDBBranch', RxDBBranch],
      ['WatermarkProbeState', WatermarkProbeState],
      ['RxDBMigration', RxDBMigration]
    ];
    const classNameOf = (entity: object): string | undefined =>
      initialEntityClasses.find(([, EntityClass]) => entity instanceof EntityClass)?.[0];
    expect(initialEntities.map(classNameOf)).toEqual([
      'RxDBBranch',
      'WatermarkProbeState',
      'RxDBMigration',
      'RxDBMigration',
      'RxDBMigration'
    ]);
    // `activeKey` 与 `activated` 必须同写：可空唯一列只管得住非 NULL 的行，漏写这一处
    // 就等于让新库的 main 从第一天起不受「至多一个 active」约束，且不报任何错。
    expect(initialEntities[0]).toEqual(
      expect.objectContaining({ id: 'main', activated: true, activeKey: ACTIVE_BRANCH_KEY })
    );
    // 贡献方拿到的是**建表那一刻确实存在**的分支集合，不是一个空上下文：新库上恰好是 main。
    expect(initialEntities[1]).toEqual(expect.objectContaining({ branchId: 'main' }));
    expect(initialEntities.slice(-3)).toEqual([
      expect.objectContaining({ name: PROBE_MIGRATION_NAME, executedAt: expect.any(Date) }),
      expect.objectContaining({ name: PROBE_CLAIM_ROW, executedAt: expect.any(Date) }),
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
    // 系统迁移（这里是假贡献方那两条）跑在接入方迁移**之前**，且共用同一个 `RxDBMigration`
    // 仓库。不把它挡开，本组用例编排的 find/create 序列会被系统那一趟先消费掉，断言到的
    // 就不再是接入方迁移的执行权竞争 —— 表现为「第一次 create 抛的唯一约束冲突落在贡献方
    // 的迁移上」，和用例要证的东西无关。
    //
    // 挡法是报「系统迁移已执行」：`runMigrationsOnce` 读到名字在已执行集合里就 continue，
    // 既不认领也不跑 up()。认领行也必须一并报出来 —— 它与迁移同链，漏报会让它被重新认领，
    // 照样吃掉一次 create。而且未认领能力守卫读的是同一张表：认领行在，守卫才放行。
    // 切换点取 `completeBootstrap()` —— 它正好是系统迁移收尾与接入方迁移开跑之间的那道
    // 边界（见 RxDB.#connect 的引导链）。
    const systemMigrationRepository = {
      find: vi.fn(async () => [{ name: PROBE_MIGRATION_NAME }, { name: PROBE_CLAIM_ROW }]),
      count: vi.fn(async () => 2),
      create: vi.fn(async (record: RxDBMigration) => record),
      update: vi.fn(),
      remove: vi.fn()
    };
    let applicationPhase = false;
    const completeBootstrap = adapter.completeBootstrap.bind(adapter);
    vi.spyOn(adapter, 'completeBootstrap').mockImplementation(() => {
      applicationPhase = true;
      completeBootstrap();
    });
    // 只替换 RxDBMigration 的仓库。全量替换会让引导期的其它读（RxDBSync / RxDBBranch）
    // 也消耗 find 的 mockResolvedValueOnce 序列，执行权竞争的重放脚本会错位。
    const defaultGetRepository = adapter.getRepository.getMockImplementation();
    adapter.getRepository.mockImplementation((EntityType: unknown) => {
      if (EntityType !== RxDBMigration) return defaultGetRepository?.(EntityType as never) as never;
      return (applicationPhase ? migrationRepository : systemMigrationRepository) as never;
    });
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
