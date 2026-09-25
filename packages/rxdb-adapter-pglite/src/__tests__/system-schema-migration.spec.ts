import {
  ACTIVE_BRANCH_KEY,
  AmbiguousActiveBranchError,
  encodeRxDBChangeEntityId,
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RxDB,
  RXDB_CHANGE_CODEC_WATERMARK,
  RXDB_SYSTEM_SCHEMA_VERSION,
  RXDB_SYSTEM_SCHEMA_WATERMARK,
  RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX,
  RxDBChange,
  RxDBMigration,
  RxDBSystemMigrationLockError,
  SyncType,
  UnsupportedRxDBSystemVersionError
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { PGliteRepository } from '../repository/PGliteRepository.js';

const adapters = new Set<RxDBAdapterPGlite>();
const databases = new Set<RxDB>();
const temporaryDirectories = new Set<string>();
let databaseIndex = 0;

@Entity({
  name: 'PGliteLegacyTodo',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class PGliteLegacyTodo extends EntityBase {
  title!: string;
}

const createLegacyDatabase = async (): Promise<RxDBAdapterPGlite> => {
  databaseIndex += 1;
  const rxdb = {
    config: {
      dbName: `pglite-system-migration-${databaseIndex}`,
      entities: [RxDBChange, RxDBMigration]
    },
    context: {},
    connect: vi.fn(async () => undefined),
    dispatchEvent: vi.fn(),
    schemaManager: {
      getEntityMetadata: vi.fn(),
      getEntityTypeByTableName: vi.fn()
    }
  } as unknown as RxDB;
  const adapter = new RxDBAdapterPGlite(rxdb, { store: 'memory' });
  adapters.add(adapter);
  await adapter.connect();
  await adapter.internalQuery('CREATE SCHEMA IF NOT EXISTS "rxdb"');
  await adapter.internalQuery(`
    CREATE TABLE "rxdb"."rxdb_migration" (
      "id" serial PRIMARY KEY,
      "name" varchar NOT NULL,
      "executedAt" timestamptz NOT NULL DEFAULT now()
    )
  `);
  await adapter.internalQuery(`
    CREATE TABLE "rxdb"."rxdb_change" (
      "id" serial PRIMARY KEY,
      "entityId" uuid NOT NULL
    )
  `);
  await adapter.internalQuery(`INSERT INTO "rxdb"."rxdb_change" ("entityId") VALUES ($1::uuid)`, [
    '550e8400-e29b-41d4-a716-446655440000'
  ]);
  return adapter;
};

const getEntityIdColumnType = async (adapter: RxDBAdapterPGlite): Promise<string | undefined> => {
  const result = await adapter.internalQuery<{ data_type: string }>(`
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'rxdb' AND table_name = 'rxdb_change' AND column_name = 'entityId'
  `);
  return result.rows[0]?.data_type;
};

const getWatermarks = async (adapter: RxDBAdapterPGlite): Promise<Array<{ id: number; name: string }>> => {
  const result = await adapter.internalQuery<{ id: number; name: string }>(`
    SELECT "id", "name" FROM "rxdb"."rxdb_migration"
    WHERE "name" LIKE '\\_\\_rxdb\\_%' ESCAPE '\\'
    ORDER BY "id"
  `);
  return result.rows;
};

/**
 * 造一张 v4 形态的 `rxdb_branch`：有 `activated`，没有 `activeKey`，也没有那条唯一索引。
 *
 * @param adapter - 目标适配器
 * @param branches - 要写进去的分支行
 *
 * @remarks
 * 不复用 `create_table_sql`：那条路径产出的是**当前**形态，用它建表就等于让被测的升级
 * 步骤面对一张已经升级过的表，测什么都是绿的。
 */
const createLegacyBranchTable = async (
  adapter: RxDBAdapterPGlite,
  branches: ReadonlyArray<{ id: string; activated: boolean }>
): Promise<void> => {
  await adapter.internalQuery(`
    CREATE TABLE "rxdb"."rxdb_branch" (
      "id" varchar PRIMARY KEY,
      "activated" boolean NOT NULL DEFAULT false,
      "fromChangeId" integer,
      "local" boolean NOT NULL DEFAULT true,
      "remote" boolean NOT NULL DEFAULT false,
      "createdAt" timestamptz,
      "updatedAt" timestamptz
    )
  `);
  for (const branch of branches) {
    await adapter.internalQuery(`INSERT INTO "rxdb"."rxdb_branch" ("id", "activated") VALUES ($1::text, $2::boolean)`, [
      branch.id,
      branch.activated
    ]);
  }
};

const getBranchColumns = async (adapter: RxDBAdapterPGlite): Promise<string[]> => {
  const result = await adapter.internalQuery<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'rxdb' AND table_name = 'rxdb_branch'
    ORDER BY column_name
  `);
  return result.rows.map(row => row.column_name);
};

const getBranchIndexes = async (adapter: RxDBAdapterPGlite): Promise<string[]> => {
  const result = await adapter.internalQuery<{ indexname: string }>(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'rxdb' AND tablename = 'rxdb_branch'
    ORDER BY indexname
  `);
  return result.rows.map(row => row.indexname);
};

const getBranchRows = async (
  adapter: RxDBAdapterPGlite
): Promise<Array<{ id: string; activated: boolean; activeKey: string | null }>> => {
  const result = await adapter.internalQuery<{ id: string; activated: boolean; activeKey: string | null }>(
    `SELECT "id", "activated", "activeKey" FROM "rxdb"."rxdb_branch" ORDER BY "id"`
  );
  return result.rows;
};

/**
 * 每行的 `xmin`——Postgres 里写它的那个事务号。行被重写过它就变，没被重写它就不变。
 *
 * @param adapter - 目标适配器
 * @returns 按 `id` 排序的 `id` → `xmin` 列表
 */
const getBranchRowVersions = async (adapter: RxDBAdapterPGlite): Promise<Array<{ id: string; xmin: string }>> => {
  const result = await adapter.internalQuery<{ id: string; xmin: string }>(
    `SELECT "id", "xmin"::text AS "xmin" FROM "rxdb"."rxdb_branch" ORDER BY "id"`
  );
  return result.rows;
};

const getBusinessChangeTriggers = async (adapter: RxDBAdapterPGlite): Promise<string[]> => {
  const result = await adapter.internalQuery<{ trigger_name: string }>(`
    SELECT DISTINCT trigger_name FROM information_schema.triggers
    WHERE trigger_schema = 'public' AND trigger_name LIKE '%_change_trigger'
    ORDER BY trigger_name
  `);
  return result.rows.map(row => row.trigger_name);
};

const getChangeTriggerFunctionDefinition = async (
  adapter: RxDBAdapterPGlite,
  EntityType: typeof PGliteLegacyTodo
): Promise<string> => {
  const metadata = getEntityMetadata(EntityType);
  const result = await adapter.internalQuery<{ definition: string }>(
    `SELECT pg_get_functiondef(procedure.oid) AS definition
     FROM pg_proc AS procedure
     JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
     WHERE namespace.nspname = $1::text AND procedure.proname = $2::text`,
    [metadata.namespace, `${metadata.tableName}_change_trigger_fn`]
  );
  return result.rows[0]?.definition ?? '';
};

const createDiskLegacyAdapter = async (dataDir: string, dbName: string): Promise<RxDBAdapterPGlite> => {
  const rxdb = {
    config: {
      dbName,
      entities: [RxDBChange, RxDBMigration, PGliteLegacyTodo]
    },
    context: {},
    connect: vi.fn(async () => undefined),
    dispatchEvent: vi.fn(),
    schemaManager: {
      getEntityMetadata: vi.fn(),
      getEntityTypeByTableName: vi.fn()
    }
  } as unknown as RxDB;
  const adapter = new RxDBAdapterPGlite(rxdb, { dataDir });
  adapters.add(adapter);
  await adapter.connect();
  return adapter;
};

afterEach(async () => {
  const pendingDatabases = Array.from(databases);
  databases.clear();
  await Promise.all(pendingDatabases.map(database => database.disconnectAll()));
  const pending = Array.from(adapters);
  adapters.clear();
  await Promise.all(pending.map(adapter => adapter.disconnect()));
  const directories = Array.from(temporaryDirectories);
  temporaryDirectories.clear();
  await Promise.all(directories.map(directory => rm(directory, { recursive: true, force: true })));
});

describe('PGlite system schema migration', () => {
  it('RxDB.connect 自动升级磁盘旧库，旧 change 可切换分支并撤销', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'aiao-pglite-legacy-'));
    temporaryDirectories.add(dataDir);
    const dbName = `pglite-connect-migration-${++databaseIndex}`;
    const createDatabase = async (): Promise<{ rxdb: RxDB; adapter: RxDBAdapterPGlite }> => {
      const rxdb = new RxDB({
        dbName,
        entities: [PGliteLegacyTodo],
        sync: { local: { adapter: 'pglite' }, type: SyncType.None }
      });
      rxdb.adapter('pglite', database => new RxDBAdapterPGlite(database, { dataDir }));
      rxdb.use(rxDBPluginHistory);
      const adapter = await rxdb.connect('pglite');
      databases.add(rxdb);
      return { rxdb, adapter };
    };

    const initial = await createDatabase();
    const todo = initial.rxdb.entityManager.instantiate(PGliteLegacyTodo);
    todo.title = 'legacy';
    await todo.save();
    const legacyCreatedAt = new Date(Date.now() + 60_000);
    await initial.adapter.internalQuery(`DELETE FROM "rxdb"."rxdb_change"`);
    await initial.adapter.internalQuery(`DELETE FROM "rxdb"."rxdb_migration" WHERE "name" IN ($1, $2)`, [
      RXDB_SYSTEM_SCHEMA_WATERMARK,
      RXDB_CHANGE_CODEC_WATERMARK
    ]);
    await initial.adapter.internalQuery(
      `ALTER TABLE "rxdb"."rxdb_change" ALTER COLUMN "entityId" TYPE uuid USING "entityId"::uuid`
    );
    await initial.adapter.internalQuery(
      `INSERT INTO "rxdb"."rxdb_change"
       ("type", "namespace", "entity", "branchId", "entityId", "inversePatch", "patch", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::uuid, $6, $7, $8, $8)`,
      ['INSERT', 'public', 'PGliteLegacyTodo', 'main', todo.id, null, '{"title":"legacy"}', legacyCreatedAt]
    );
    await initial.rxdb.disconnectAll();
    databases.delete(initial.rxdb);

    const reopened = await createDatabase();
    expect(await getEntityIdColumnType(reopened.adapter)).toBe('text');
    const changes = await reopened.adapter
      .getRepository<typeof RxDBChange, PGliteRepository<typeof RxDBChange>>(RxDBChange)
      .findAll({
        where: { combinator: 'and', rules: [{ field: 'entityId', operator: '=', value: todo.id }] }
      });
    expect(changes).toHaveLength(1);
    expect(changes[0].patch).toEqual({ title: 'legacy' });

    await reopened.rxdb.versionManager.createBranch('legacy-history');
    await reopened.rxdb.versionManager.switchBranch('legacy-history');
    expect(
      await reopened.adapter.getRepository(PGliteLegacyTodo).find({ where: { combinator: 'and', rules: [] } })
    ).toHaveLength(1);
    await reopened.rxdb.versionManager.switchBranch('main');

    await reopened.rxdb.versionManager.history(PGliteLegacyTodo).undo();
    expect(
      await reopened.adapter.getRepository(PGliteLegacyTodo).find({ where: { combinator: 'and', rules: [] } })
    ).toHaveLength(0);
  });

  it('把旧 UUID entityId 升级为 text，保留旧 change，并且重复执行不改写水位', async () => {
    const adapter = await createLegacyDatabase();

    await adapter.migrateSystemSchema();

    expect(await getEntityIdColumnType(adapter)).toBe('text');
    const change = await adapter.internalQuery<{ entityId: string }>(
      `SELECT "entityId" FROM "rxdb"."rxdb_change" WHERE "id" = 1`
    );
    expect(change.rows[0]?.entityId).toBe('550e8400-e29b-41d4-a716-446655440000');
    const firstWatermarks = await getWatermarks(adapter);
    expect(firstWatermarks.map(row => row.name)).toEqual([RXDB_SYSTEM_SCHEMA_WATERMARK, RXDB_CHANGE_CODEC_WATERMARK]);

    await adapter.migrateSystemSchema();

    expect(await getWatermarks(adapter)).toEqual(firstWatermarks);
  });

  it('DDL 与 watermark 任一步失败都回滚，并允许下一次完整重试', async () => {
    const adapter = await createLegacyDatabase();
    await adapter.internalQuery(`
      CREATE FUNCTION "rxdb"."reject_codec_watermark"() RETURNS trigger AS $$
      BEGIN
        IF NEW."name" LIKE '__rxdb_change_codec__:%' THEN
          RAISE EXCEPTION 'injected codec watermark failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await adapter.internalQuery(`
      CREATE TRIGGER "reject_codec_watermark"
      BEFORE INSERT ON "rxdb"."rxdb_migration"
      FOR EACH ROW EXECUTE FUNCTION "rxdb"."reject_codec_watermark"()
    `);

    await expect(adapter.migrateSystemSchema()).rejects.toThrow('injected codec watermark failure');
    expect(await getEntityIdColumnType(adapter)).toBe('uuid');
    expect(await getWatermarks(adapter)).toEqual([]);

    await adapter.internalQuery(`DROP TRIGGER "reject_codec_watermark" ON "rxdb"."rxdb_migration"`);
    await expect(adapter.migrateSystemSchema()).resolves.toBeUndefined();
    expect(await getEntityIdColumnType(adapter)).toBe('text');
    expect((await getWatermarks(adapter)).map(row => row.name)).toEqual([
      RXDB_SYSTEM_SCHEMA_WATERMARK,
      RXDB_CHANGE_CODEC_WATERMARK
    ]);
  });

  it('旧 writer 持锁时中止升级且不启动业务 trigger，释放后可重试', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'aiao-pglite-migration-lock-'));
    temporaryDirectories.add(dataDir);
    const dbName = `pglite-migration-lock-${++databaseIndex}`;
    const initializer = await createDiskLegacyAdapter(dataDir, dbName);
    await initializer.internalQuery('CREATE SCHEMA IF NOT EXISTS "rxdb"');
    await initializer.internalQuery(`
      CREATE TABLE "rxdb"."rxdb_migration" (
        "id" serial PRIMARY KEY,
        "name" varchar NOT NULL,
        "executedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await initializer.internalQuery(`
      CREATE TABLE "rxdb"."rxdb_change" (
        "id" serial PRIMARY KEY,
        "entityId" uuid NOT NULL
      )
    `);
    await initializer.createTables([PGliteLegacyTodo]);
    const legacyTodoTableName = getEntityMetadata(PGliteLegacyTodo).tableName;
    await initializer.internalQuery(
      `DROP TRIGGER "${legacyTodoTableName}_change_trigger" ON "public"."${legacyTodoTableName}"`
    );
    await initializer.internalQuery(`DROP FUNCTION "public"."${legacyTodoTableName}_change_trigger_fn"() CASCADE`);
    await initializer.disconnect();
    adapters.delete(initializer);

    const writer = await createDiskLegacyAdapter(dataDir, dbName);
    const migrator = await createDiskLegacyAdapter(dataDir, dbName);
    await writer.internalQuery('BEGIN');
    await writer.internalQuery(`INSERT INTO "rxdb"."rxdb_change" ("entityId") VALUES ($1::uuid)`, [
      '550e8400-e29b-41d4-a716-446655440001'
    ]);

    try {
      await expect(migrator.migrateSystemSchema()).rejects.toBeInstanceOf(RxDBSystemMigrationLockError);
      expect(await getEntityIdColumnType(migrator)).toBe('uuid');
      expect(await getWatermarks(migrator)).toEqual([]);
      expect(await getBusinessChangeTriggers(migrator)).toEqual([]);
    } finally {
      await writer.internalQuery('ROLLBACK');
      await writer.disconnect();
      adapters.delete(writer);
    }

    await expect(migrator.migrateSystemSchema()).resolves.toBeUndefined();
    expect(await getEntityIdColumnType(migrator)).toBe('text');
    expect((await getWatermarks(migrator)).map(row => row.name)).toEqual([
      RXDB_SYSTEM_SCHEMA_WATERMARK,
      RXDB_CHANGE_CODEC_WATERMARK
    ]);
    expect(await getBusinessChangeTriggers(migrator)).toEqual([`${legacyTodoTableName}_change_trigger`]);

    const currentPeer = await createDiskLegacyAdapter(dataDir, dbName);
    await expect(migrator.migrateSystemSchema()).resolves.toBeUndefined();
    await currentPeer.disconnect();
    adapters.delete(currentPeer);
  });

  it('升级旧 trigger 到 transaction-local setting，并保留激活分支', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'aiao-pglite-trigger-context-'));
    temporaryDirectories.add(dataDir);
    const dbName = `pglite-trigger-context-${++databaseIndex}`;
    const branchId = 'feature-before-trigger-migration';
    const createDatabase = async (): Promise<{ rxdb: RxDB; adapter: RxDBAdapterPGlite }> => {
      const rxdb = new RxDB({
        dbName,
        entities: [PGliteLegacyTodo],
        sync: { local: { adapter: 'pglite' }, type: SyncType.None }
      });
      rxdb.adapter('pglite', database => new RxDBAdapterPGlite(database, { dataDir }));
      rxdb.use(rxDBPluginHistory);
      const adapter = await rxdb.connect('pglite');
      databases.add(rxdb);
      return { rxdb, adapter };
    };

    const initial = await createDatabase();
    await initial.rxdb.versionManager.createBranch(branchId);
    await initial.rxdb.versionManager.switchBranch(branchId);
    const todoMetadata = getEntityMetadata(PGliteLegacyTodo);
    await initial.adapter.internalQuery(`
      CREATE OR REPLACE FUNCTION "${todoMetadata.namespace}"."${todoMetadata.tableName}_change_trigger_fn"()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await initial.adapter.internalQuery(`DELETE FROM "rxdb"."rxdb_migration" WHERE "name" = $1::text`, [
      RXDB_SYSTEM_SCHEMA_WATERMARK
    ]);
    await initial.adapter.internalQuery(
      `INSERT INTO "rxdb"."rxdb_migration" ("name", "executedAt") VALUES ($1::text, now())`,
      [`${RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX}${RXDB_SYSTEM_SCHEMA_VERSION - 1}`]
    );
    await initial.rxdb.disconnectAll();
    databases.delete(initial.rxdb);

    const reopened = await createDatabase();
    const definition = await getChangeTriggerFunctionDefinition(reopened.adapter, PGliteLegacyTodo);
    expect(definition).toMatch(/current_setting\('rxdb\.transaction_id'(?:::text)?, true\)/);
    expect(definition).toContain(`'${branchId}'`);

    const todo = reopened.rxdb.entityManager.instantiate(PGliteLegacyTodo);
    todo.title = 'migrated trigger context';
    let transactionId = '';
    await reopened.adapter.transaction(async executor => {
      transactionId = executor.id;
      await executor.saveMany([todo]);
    });
    const change = await reopened.adapter.internalQuery<{ branchId: string; transactionId: string | null }>(
      `SELECT "branchId", "transactionId" FROM "rxdb"."rxdb_change" WHERE "entityId" = $1::text`,
      [encodeRxDBChangeEntityId(todo.id)]
    );
    const matchingChange = change.rows.find(row => row.transactionId === transactionId);
    expect(matchingChange).toEqual({ branchId, transactionId });
  });

  // FR-048 的「至多一个 active」那一半架在 `rxdb_branch.activeKey` 的可空唯一列上。该列是在
  // v4 水位线**之后**才进 schema 的，而既有库的升级路径只按表粒度补建、从不看列——不在这里补，
  // 那批库的约束就永远缺席，且不报任何错。
  it('给既有库补 activeKey 列与唯一索引，并回填当前 active 分支', async () => {
    const adapter = await createLegacyDatabase();
    await createLegacyBranchTable(adapter, [
      { id: 'main', activated: false },
      { id: 'feature-x', activated: true }
    ]);

    await adapter.migrateSystemSchema();

    expect(await getBranchColumns(adapter)).toContain('activeKey');
    expect(await getBranchIndexes(adapter)).toContain('idx_rxdb_rxdb_branch_activeKey');
    expect(await getBranchRows(adapter)).toEqual([
      { id: 'feature-x', activated: true, activeKey: ACTIVE_BRANCH_KEY },
      { id: 'main', activated: false, activeKey: null }
    ]);

    // 索引得真的在管事。只断言它存在的话，建到别的列上（比如 `activated`）照样能过，
    // 而那样的索引对「两行 active」毫无阻挡。
    await expect(
      adapter.internalQuery(`UPDATE "rxdb"."rxdb_branch" SET "activeKey" = $1::text WHERE "id" = 'main'`, [
        ACTIVE_BRANCH_KEY
      ])
    ).rejects.toThrow();
  });

  it('零 active 的既有库把 main 激活并写上哨兵值', async () => {
    const adapter = await createLegacyDatabase();
    await createLegacyBranchTable(adapter, [
      { id: 'main', activated: false },
      { id: 'feature-x', activated: false }
    ]);

    await adapter.migrateSystemSchema();

    expect(await getBranchRows(adapter)).toEqual([
      { id: 'feature-x', activated: false, activeKey: null },
      { id: 'main', activated: true, activeKey: ACTIVE_BRANCH_KEY }
    ]);
  });

  it('多 active 的既有库整体回滚，不猜一个留下', async () => {
    const adapter = await createLegacyDatabase();
    await createLegacyBranchTable(adapter, [
      { id: 'feature-x', activated: true },
      { id: 'main', activated: true }
    ]);

    await expect(adapter.migrateSystemSchema()).rejects.toBeInstanceOf(AmbiguousActiveBranchError);

    // 「整体回滚」要连**同一次迁移里的其它步骤**一起验，只看列没加回来是不够的：
    // entityId 的 ALTER 排在补列之前，它留在库里就说明这次升级其实是半截的。
    expect(await getBranchColumns(adapter)).not.toContain('activeKey');
    expect(await getBranchIndexes(adapter)).not.toContain('idx_rxdb_rxdb_branch_activeKey');
    expect(await getWatermarks(adapter)).toEqual([]);
    expect(await getEntityIdColumnType(adapter)).toBe('uuid');
  });

  // 这一步在**每一次** `migrateSystemSchema()` 上都会跑，新库也不例外：水位线是本方法最后
  // 才写的，所以第一次 connect() 同样走完整条升级路径。回填因此必须幂等到**一行都不写**，
  // 而不只是「写回同一个值」——`rxdb_branch` 挂着 NOTIFY 触发器，白写一遍就会异步派发出一条
  // `inversePatch:{}` 的裸 RxDBBranch UPDATE 事件，落进调用方的事件流里（清库后的下一个用例、
  // 或者业务侧的 `ENTITY_LOCAL_UPDATE_EVENT` 订阅），且没有任何东西会报错。
  it('库已是目标形态时一行都不写', async () => {
    const adapter = await createLegacyDatabase();
    await createLegacyBranchTable(adapter, [
      { id: 'main', activated: true },
      { id: 'feature-x', activated: false }
    ]);
    // 手工补到「当前形态」：列、唯一索引、哨兵值都已就位，只差水位线——这正是新库第一次
    // 走到这里时的样子。
    await adapter.internalQuery(`ALTER TABLE "rxdb"."rxdb_branch" ADD COLUMN "activeKey" varchar`);
    await adapter.internalQuery(
      `CREATE UNIQUE INDEX "idx_rxdb_rxdb_branch_activeKey" ON "rxdb"."rxdb_branch" ("activeKey" bpchar_ops)`
    );
    await adapter.internalQuery(`UPDATE "rxdb"."rxdb_branch" SET "activeKey" = $1::text WHERE "id" = 'main'`, [
      ACTIVE_BRANCH_KEY
    ]);
    const versionsBefore = await getBranchRowVersions(adapter);

    await adapter.migrateSystemSchema();

    expect(await getBranchRowVersions(adapter)).toEqual(versionsBefore);
    expect(await getBranchRows(adapter)).toEqual([
      { id: 'feature-x', activated: false, activeKey: null },
      { id: 'main', activated: true, activeKey: ACTIVE_BRANCH_KEY }
    ]);
  });

  it('高版本水位在 ALTER 或业务写入前 fail-fast', async () => {
    const adapter = await createLegacyDatabase();
    await adapter.internalQuery(`INSERT INTO "rxdb"."rxdb_migration" ("name") VALUES ('__rxdb_change_codec__:2')`);

    await expect(adapter.migrateSystemSchema()).rejects.toBeInstanceOf(UnsupportedRxDBSystemVersionError);

    expect(await getEntityIdColumnType(adapter)).toBe('uuid');
    const changes = await adapter.internalQuery<{ entityId: string }>(`SELECT "entityId" FROM "rxdb"."rxdb_change"`);
    expect(changes.rows).toEqual([{ entityId: '550e8400-e29b-41d4-a716-446655440000' }]);
  });
});
