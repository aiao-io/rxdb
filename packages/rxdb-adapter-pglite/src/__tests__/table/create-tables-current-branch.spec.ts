import {
  encodeRxDBChangeEntityId,
  Entity,
  EntityBase,
  MAIN_BRANCH_ID,
  PropertyType,
  RxDB,
  RxDBChange,
  RxDBMigration,
  SyncType
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';

/**
 * 建库时不在 `entities` 里、事后才由 `createTables()` 单独补出来的实体。
 *
 * @remarks
 * 复刻 `RxDB.#ensureEntityTables` 的输入形态：一张此前不存在的表，在一条**已经跑起来**的连接上补建。
 */
@Entity({
  name: 'PglLateTodo',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class PglLateTodo extends EntityBase {
  title!: string;
}

@Entity({
  name: 'PglEarlyTodo',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class PglEarlyTodo extends EntityBase {
  title!: string;
}

const databases = new Set<RxDB>();
const adapters = new Set<RxDBAdapterPGlite>();
let databaseIndex = 0;

afterEach(async () => {
  const pendingDatabases = Array.from(databases);
  const pendingAdapters = Array.from(adapters);
  databases.clear();
  adapters.clear();
  await Promise.all(pendingDatabases.map(database => database.disconnectAll()));
  await Promise.all(pendingAdapters.map(adapter => adapter.disconnect()));
});

/** 起一个正常的内存库（含系统表与 main 分支行） */
const openDatabase = async (): Promise<{ rxdb: RxDB; adapter: RxDBAdapterPGlite }> => {
  const rxdb = new RxDB({
    dbName: `pglite-late-table-${++databaseIndex}-${Date.now()}`,
    entities: [PglEarlyTodo],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.adapter('pglite', database => new RxDBAdapterPGlite(database, { store: 'memory' }));
  rxdb.use(rxDBPluginHistory);
  const adapter = await rxdb.connect('pglite');
  databases.add(rxdb);
  return { rxdb, adapter };
};

const insertLateTodo = async (adapter: RxDBAdapterPGlite, title: string): Promise<string> => {
  const id = crypto.randomUUID();
  await adapter.internalQuery(
    `INSERT INTO "public"."PglLateTodo" ("id", "title", "createdAt", "updatedAt") VALUES ($1, $2, now(), now())`,
    [id, title]
  );
  return id;
};

const readChangeBranchIds = async (adapter: RxDBAdapterPGlite, id: string): Promise<string[]> => {
  const result = await adapter.internalQuery<{ branchId: string }>(
    `SELECT "branchId" FROM "rxdb"."rxdb_change" WHERE "entityId" = $1`,
    [encodeRxDBChangeEntityId(id)]
  );
  return result.rows.map(row => row.branchId);
};

describe('createTables 补建的表，变更触发器挂在哪条分支上', () => {
  it('库停在非根分支时，补建的表要把变更记在当前分支名下', async () => {
    const { rxdb, adapter } = await openDatabase();
    const branchId = 'feature-late-table';
    await rxdb.versionManager.createBranch(branchId);
    await rxdb.versionManager.switchBranch(branchId);

    await adapter.createTables([PglLateTodo]);

    // 断言落在**触发器自己写下的那一格**上，而不是触发器 DDL 的文本：这条链路的故障形态是
    // 「变更被记到一条当前并不在的分支名下」，只有读回 rxdb_change 才能证伪它。
    // PG 侧没有 sqlite 那样的每事务自愈（`#run_transaction` → `switch_transaction_id`），
    // 触发器只在建表 / `switch_branch` / 系统迁移三处重建，这里错了就一直错到下次切分支。
    expect(await readChangeBranchIds(adapter, await insertLateTodo(adapter, 'on feature'))).toEqual([branchId]);
  });

  it('库停在根分支时照旧写根分支', async () => {
    const { adapter } = await openDatabase();

    await adapter.createTables([PglLateTodo]);

    expect(await readChangeBranchIds(adapter, await insertLateTodo(adapter, 'on main'))).toEqual([MAIN_BRANCH_ID]);
  });

  it('连 rxdb_branch 都还没有的旧库上，补建照样要能跑完', async () => {
    // `system-schema-migration.spec.ts` 里那条升级用例正是这个形态：只有 rxdb_migration 与
    // rxdb_change 两张表，分支表要等 `migrateSystemSchema()` 才建出来。补建时去读当前分支
    // 必须先问「读得到吗」——直接读就是在这里报 `relation "rxdb"."rxdb_branch" does not exist`，
    // 把一条本来能跑完的升级路径堵死在建表上。
    const rxdb = {
      config: { dbName: `pglite-late-table-legacy-${++databaseIndex}`, entities: [RxDBChange, RxDBMigration] },
      context: {},
      connect: vi.fn(async () => undefined),
      dispatchEvent: vi.fn(),
      schemaManager: { getEntityMetadata: vi.fn(), getEntityTypeByTableName: vi.fn() }
    } as unknown as RxDB;
    const adapter = new RxDBAdapterPGlite(rxdb, { store: 'memory' });
    adapters.add(adapter);
    await adapter.connect();
    await adapter.internalQuery('CREATE SCHEMA IF NOT EXISTS "rxdb"');
    await adapter.internalQuery(`
      CREATE TABLE "rxdb"."rxdb_change" (
        "id" serial PRIMARY KEY,
        "type" varchar NOT NULL,
        "namespace" varchar NOT NULL,
        "entity" varchar NOT NULL,
        "branchId" varchar NOT NULL,
        "transactionId" uuid,
        "entityId" text NOT NULL,
        "inversePatch" jsonb,
        "patch" jsonb
      )
    `);

    await expect(adapter.createTables([PglLateTodo])).resolves.toBe(true);
    expect(await readChangeBranchIds(adapter, await insertLateTodo(adapter, 'legacy'))).toEqual([MAIN_BRANCH_ID]);
  });
});
