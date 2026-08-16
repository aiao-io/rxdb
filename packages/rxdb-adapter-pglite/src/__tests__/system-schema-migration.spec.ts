import {
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
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

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
    const changes = await reopened.adapter.localRxDBChange().findAll({
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

  it('高版本水位在 ALTER 或业务写入前 fail-fast', async () => {
    const adapter = await createLegacyDatabase();
    await adapter.internalQuery(`INSERT INTO "rxdb"."rxdb_migration" ("name") VALUES ('__rxdb_change_codec__:2')`);

    await expect(adapter.migrateSystemSchema()).rejects.toBeInstanceOf(UnsupportedRxDBSystemVersionError);

    expect(await getEntityIdColumnType(adapter)).toBe('uuid');
    const changes = await adapter.internalQuery<{ entityId: string }>(`SELECT "entityId" FROM "rxdb"."rxdb_change"`);
    expect(changes.rows).toEqual([{ entityId: '550e8400-e29b-41d4-a716-446655440000' }]);
  });
});
