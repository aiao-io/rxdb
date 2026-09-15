/**
 * @fileoverview 插件贡献系统能力的宿主契约（US-015 抽包前置）。
 *
 * @remarks
 * 贡献必须是**声明式**的：宿主在建表之前直接从插件对象上读 `system`，不经 `install()`。
 * 理由是时序互斥——声明了 `inject: ['adapter:local']` 的插件必然跑在 `createTables()` 之后
 * （`RxDB.ts` 里适配器就绪置位排在 `#await_plugin_installs` 之前），而系统表要跟着那次
 * `createTables()` 一起建出来。走 `install()` 的贡献永远赶不上自己的表。
 *
 * 三个注册点各自防一种不会编译报错的事故：
 * 1. **实体** 漏接 → 表建不出来，首次用到时抛 `need init rxdb`，一条读不出主语的错；
 * 2. **初始行** 没进同一次 `createTables()` → 新库第一次启动就缺行，而缺行的表看起来是正常的空表；
 * 3. **迁移** 只接了既有库那一半 → 新库下次启动重跑 `up()` 撞主键（`migrations/index.ts` 自陈）。
 *
 * 末两节测「未认领能力守卫」：它接替 `RXDB_SYSTEM_SCHEMA_VERSION` 今天干的活——
 * 挡住「没装插件的客户端打开已启用该能力的库」，否则写原语一层拦截都没有。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import type { Plugin } from '../../rxdb-plugin.js';
import type { RxDBSystemContribution } from '../../rxdb-plugin-system.js';
import type { MigrationType } from '../../rxdb.interface.js';
import { RxDB } from '../../RxDB.js';
import { capabilityWatermarkName, UnclaimedRxDBCapabilityError } from '../../system/capability-watermark.js';
import { RxDBMigration } from '../../system/migration.js';
import { getSystemEntityNames, isSystemEntity, SYSTEM_ENTITIES } from '../../system/system-entities.js';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import { createCapabilityStateRow } from '../fixtures/test-db-setup.js';

@Entity({
  namespace: 'rxdb',
  name: 'ProbeCapabilityState',
  tableName: 'rxdb_probe_capability_state',
  log: false,
  properties: [{ name: 'branchId', type: PropertyType.string }]
})
class ProbeCapabilityState extends EntityBase {
  branchId!: string;
}

const PROBE_MIGRATION_NAME = '0001-probe-capability';
const PROBE_PACKAGE = '@aiao/rxdb-plugin-probe';

const probeMigration: MigrationType = {
  name: PROBE_MIGRATION_NAME,
  up: async () => undefined,
  down: async () => undefined
};

const probeContribution: RxDBSystemContribution = {
  capability: 'probe',
  version: 1,
  packageSpecifier: PROBE_PACKAGE,
  entities: [ProbeCapabilityState],
  createInitialRows: (entityManager, context) => {
    const row = entityManager.instantiate(ProbeCapabilityState);
    row.branchId = context.branchIds[0];
    return [row];
  },
  createMigrations: () => [probeMigration]
};

const probePlugin: Plugin = () => ({ name: 'probe', system: probeContribution, install: () => undefined });

const PROBE_CLAIM_ROW = capabilityWatermarkName({
  capability: 'probe',
  version: 1,
  packageSpecifier: PROBE_PACKAGE
});

const GHOST_CLAIM_ROW = capabilityWatermarkName({
  capability: 'ghost',
  version: 2,
  packageSpecifier: '@example/rxdb-plugin-ghost'
});

const createRepository = <T extends EntityType>(rows: InstanceType<T>[] = []): IRepository<T> => ({
  find: async () => rows,
  count: async () => rows.length,
  create: async entity => entity,
  update: async entity => entity,
  remove: async entity => entity
});

interface CreateTablesCall {
  entityTypes: EntityType[];
  entities: InstanceType<EntityType>[];
}

/** 只有能力行与迁移表是有内容的；`connect()` 的 active 分支握手要读前者，守卫要读后者。 */
class TestLocalAdapter implements IRxDBAdapter {
  readonly name = 'plugin-system-contribution';
  readonly createTablesCalls: CreateTablesCall[] = [];
  readonly claimedMigrationNames: string[] = [];

  constructor(
    private readonly existing: boolean,
    private readonly migrationNames: readonly string[] = []
  ) {}

  migrateSystemSchema(): Promise<void> {
    return Promise.resolve();
  }

  completeBootstrap(): void {
    // no-op：这个替身没有引导窗
  }

  async connect(): Promise<IRxDBAdapter> {
    return this;
  }

  async disconnect(): Promise<void> {
    // no-op
  }

  async version(): Promise<string> {
    return '1.0.0';
  }

  getRepository<T extends EntityType, RT extends IRepository<T> = IRepository<T>>(EntityType: T): RT {
    return this.#repositoryFor<T>(EntityType) as RT;
  }

  async saveMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    return entities;
  }

  async removeMany<T extends EntityType>(entities: InstanceType<T>[]): Promise<InstanceType<T>[]> {
    return entities;
  }

  async mutations<T extends EntityType>(): Promise<InstanceType<T>[]> {
    return [];
  }

  async isTableExisted(): Promise<boolean> {
    return this.existing;
  }

  async createTables(EntityTypes: EntityType[], entities: InstanceType<EntityType>[] = []): Promise<boolean> {
    this.createTablesCalls.push({ entityTypes: [...EntityTypes], entities: [...entities] });
    return true;
  }

  async transaction<T extends () => Promise<unknown>>(fun: T): Promise<Awaited<ReturnType<T>>> {
    return (await fun()) as Awaited<ReturnType<T>>;
  }

  async bootstrapTransaction<T extends (executor: unknown) => Promise<unknown>>(
    fun: T
  ): Promise<Awaited<ReturnType<T>>> {
    const executor = {
      id: 'plugin-system-contribution-bootstrap',
      state: 'active',
      query: async () => ({ rowsAffected: 0, rows: [], columns: [] }),
      mutations: async () => [],
      getRepository: (EntityType: unknown) => this.#repositoryFor(EntityType),
      saveMany: async (entities: InstanceType<EntityType>[]) => entities,
      removeMany: async (entities: InstanceType<EntityType>[]) => entities,
      mergeChanges: async () => undefined,
      run: (inner: (nested: unknown) => Promise<unknown>) => inner(executor)
    };
    return (await fun(executor)) as Awaited<ReturnType<T>>;
  }

  #repositoryFor<T extends EntityType>(EntityType: unknown): IRepository<T> {
    if (EntityType === CommitCapabilityState) {
      return createRepository([createCapabilityStateRow()] as InstanceType<T>[]) as IRepository<T>;
    }
    if (EntityType === RxDBMigration) {
      const rows = this.migrationNames.map(name => ({ name })) as InstanceType<T>[];
      const repository = createRepository<T>(rows);
      return {
        ...repository,
        create: async entity => {
          this.claimedMigrationNames.push((entity as unknown as RxDBMigration).name);
          return entity;
        }
      };
    }
    return createRepository<T>();
  }
}

const databases = new Set<RxDB>();
let databaseIndex = 0;

const createDatabase = (adapter: TestLocalAdapter): RxDB => {
  databaseIndex += 1;
  const database = new RxDB({
    dbName: `plugin-system-contribution-${databaseIndex}`,
    entities: [],
    sync: { local: { adapter: adapter.name }, type: SyncType.None }
  });
  database.adapter(adapter.name, () => adapter);
  databases.add(database);
  return database;
};

afterEach(async () => {
  await Promise.all(Array.from(databases, database => database.disconnectAll()));
  databases.clear();
});

describe('插件贡献的系统实体', () => {
  it('use() 之后就进了系统表登记簿（isSystemEntity / getSystemEntityNames 当场认得）', () => {
    const database = createDatabase(new TestLocalAdapter(false));
    database.use(probePlugin);

    expect(isSystemEntity(ProbeCapabilityState)).toBe(true);
    expect(getSystemEntityNames().has('ProbeCapabilityState')).toBe(true);
    expect(SYSTEM_ENTITIES).toContain(ProbeCapabilityState);
  });

  it('新库建表时贡献的实体进 config.entities，并出现在同一次 createTables 里', async () => {
    const adapter = new TestLocalAdapter(false);
    const database = createDatabase(adapter);
    database.use(probePlugin);

    await database.connect(adapter.name);

    expect(database.config.entities).toContain(ProbeCapabilityState);
    expect(adapter.createTablesCalls).toHaveLength(1);
    expect(adapter.createTablesCalls[0].entityTypes).toContain(ProbeCapabilityState);
  });

  it('贡献的初始行与能力认领水位随同一次 createTables 写入', async () => {
    const adapter = new TestLocalAdapter(false);
    const database = createDatabase(adapter);
    database.use(probePlugin);

    await database.connect(adapter.name);

    const [{ entities }] = adapter.createTablesCalls;
    expect(entities.filter(entity => entity instanceof ProbeCapabilityState)).toEqual([
      expect.objectContaining({ branchId: 'main' })
    ]);
    const migrationNames = entities
      .filter((entity): entity is RxDBMigration => entity instanceof RxDBMigration)
      .map(record => record.name);
    // 迁移水位与能力认领水位都在这一批里：漏掉前者会让新库下次启动重跑 up()，
    // 漏掉后者会让这个库对「未认领能力守卫」隐身。
    expect(migrationNames).toContain(PROBE_MIGRATION_NAME);
    expect(migrationNames).toContain(PROBE_CLAIM_ROW);
  });

  it('既有库上贡献的迁移与能力认领各被认领一次', async () => {
    const adapter = new TestLocalAdapter(true, []);
    const database = createDatabase(adapter);
    database.use(probePlugin);

    await database.connect(adapter.name);

    expect(adapter.claimedMigrationNames).toContain(PROBE_MIGRATION_NAME);
    expect(adapter.claimedMigrationNames).toContain(PROBE_CLAIM_ROW);
  });

  it('已认领过的既有库不再重复认领', async () => {
    const adapter = new TestLocalAdapter(true, [PROBE_MIGRATION_NAME, PROBE_CLAIM_ROW]);
    const database = createDatabase(adapter);
    database.use(probePlugin);

    await database.connect(adapter.name);

    expect(adapter.claimedMigrationNames).not.toContain(PROBE_MIGRATION_NAME);
    expect(adapter.claimedMigrationNames).not.toContain(PROBE_CLAIM_ROW);
  });

  it('init() 之后再 use() 贡献系统能力的插件必须抛错，不能静默跳过', () => {
    const database = createDatabase(new TestLocalAdapter(false));
    database.init();

    expect(() => database.use(probePlugin)).toThrow(/connect\(\)/);
  });
});

describe('未认领能力守卫', () => {
  it('库里有无人认领的能力行时拒绝连接，并在建表之前就拒绝', async () => {
    const adapter = new TestLocalAdapter(true, [GHOST_CLAIM_ROW]);
    const database = createDatabase(adapter);

    await expect(database.connect(adapter.name)).rejects.toBeInstanceOf(UnclaimedRxDBCapabilityError);
    await expect(database.connect(adapter.name)).rejects.toThrow('@example/rxdb-plugin-ghost');
    expect(adapter.createTablesCalls).toHaveLength(0);
  });

  it('装上对应插件之后同一个库正常连接', async () => {
    const adapter = new TestLocalAdapter(true, [PROBE_CLAIM_ROW]);
    const database = createDatabase(adapter);
    database.use(probePlugin);

    await expect(database.connect(adapter.name)).resolves.toBe(adapter);
  });

  it('没有能力行的普通既有库不受影响', async () => {
    const adapter = new TestLocalAdapter(true, ['0004-working-tree-commits']);
    const database = createDatabase(adapter);

    await expect(database.connect(adapter.name)).resolves.toBe(adapter);
  });
});
