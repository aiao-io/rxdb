import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RxDB,
  RxDBChange,
  SyncType,
  uuid,
  type EntityType,
  type MigrationType
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { cloneEntityClasses } from '@aiao/rxdb/testing';
import sqliteWasmAsyncUrl from '@subframe7536/sqlite-wasm/wasm-async?url&inline';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { RxDBAdapterSqlite } from '../RxDBAdapterSqlite.js';

@Entity({ name: 'UpgradeOld', tableName: 'upgrade_old', properties: [{ name: 'title', type: PropertyType.string }] })
class UpgradeOld extends EntityBase {
  title!: string;
}

@Entity({ name: 'UpgradeNew', tableName: 'upgrade_new', properties: [{ name: 'title', type: PropertyType.string }] })
class UpgradeNew extends EntityBase {
  title!: string;
}

interface OpenOptions {
  readonly entities: EntityType[];
  readonly migrations?: MigrationType[];
  readonly workingTree?: boolean;
}

/**
 * 门禁补缺：**既有库 + 新版本多了一张记日志的实体表 + 引导期要开迁移事务**。
 *
 * @remarks
 * sqlite 侧每个带日志的事务开头都会按 `config.entities` 的**全部**实体重建变更触发器
 * （`#run_transaction` → `generate_table_set_trigger_sql`）。既有库上新实体的表要等到
 * `RxDB.#ensureEntityTables`（在系统迁移与接入方迁移**之后**）才补建，所以迁移那次事务
 * 若写日志，就会对一张还不存在的表 `CREATE TRIGGER`，整条 `connect()` 以
 * `no such table` 失败。工作树插件贡献了系统迁移，装了它的库每次 `connect()` 都会开这次事务
 * ——US-031 在 demo 既有库上加四张可排序树表时，打开即挂。
 *
 * 必须用持久 vfs：首装（`RxDBMigration` 表不存在）走的是一次性建全表，碰不到补建路径。
 */
const open = async ({ entities, migrations, workingTree }: OpenOptions, dbName: string) => {
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities,
    migrations,
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  });
  rxdb.use(rxDBPluginHistory);
  if (workingTree) rxdb.use(rxDBPluginWorkingTree);
  rxdb.adapter(
    'sqlite-wasm',
    async db => new RxDBAdapterSqlite(db, { vfs: 'idb', batchTimeout: 1, wasmUrl: sqliteWasmAsyncUrl })
  );
  databases.push(rxdb);
  await rxdb.connect('sqlite-wasm');
  return rxdb;
};

const databases: RxDB[] = [];

/** 工作树插件后加的两张系统表：只读检出位的登记表（US-313）与提交的分叉点（US-314） */
const laterWorkingTreeTables = (rxdb: RxDB) =>
  rxdb.systemEntities.filter(EntityClass =>
    ['Worktree', 'CommitForkPoint'].includes(getEntityMetadata(EntityClass).name)
  );

/** 提交工作树里的全部改动，交回提交 id。 */
const commitAll = async (rxdb: RxDB, message: string): Promise<string> => {
  const status = await rxdb.workingTree.status();
  const result = await rxdb.workingTree.commit(message, {
    expectedBranch: { branchId: status.branchId, activationRevision: status.activationRevision },
    expectedHeadRevision: status.headRevision,
    expectedWorkingTreeRevision: status.workingTreeRevision,
    authorId: 'working-tree-reopen',
    operationId: uuid()
  });
  if (!result.ok) throw new Error(`提交「${message}」没落库：${JSON.stringify(result.conflict)}`);
  return result.commitId;
};

const newDbName = () => `upg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

describe('既有库补建新实体表', () => {
  afterEach(async () => {
    const pending = databases.splice(0, databases.length);
    await Promise.all(pending.map(database => database.disconnectAll().catch(() => undefined)));
  });

  it('装了贡献系统迁移的插件时，connect() 补建出新表且新表可写', async () => {
    const dbName = newDbName();
    const first = await open({ entities: cloneEntityClasses([UpgradeOld]), workingTree: true }, dbName);
    await first.disconnectAll();

    const [Old, New] = cloneEntityClasses([UpgradeOld, UpgradeNew]);
    const second = await open({ entities: [Old, New], workingTree: true }, dbName);

    const created = await second.entityManager.getRepository(New).create(Object.assign(new New(), { title: 'n' }));
    expect(created.id).toBeTruthy();
  });

  // 工作树插件后加的两张系统表：只读检出位的登记表（US-313）与提交的分叉点（US-314）。在它们出现之前建的库上重开，
  // 连接期要把它们补建出来、旧数据与旧提交都还在；旧提交没有分叉点，从它建分支报 fork_point_unknown（RV-083 P2-3）
  it('工作树插件后加的系统表：既有库重开时补建，旧提交照常可读，旧提交建不了分支、新提交建得了', async () => {
    const dbName = newDbName();
    const [OldFirst] = cloneEntityClasses([UpgradeOld]);
    const first = await open({ entities: [OldFirst], workingTree: true }, dbName);
    await first.workingTree.enable();
    await first.entityManager.getRepository(OldFirst).create(Object.assign(new OldFirst(), { title: 'old' }));
    const oldCommit = await commitAll(first, 'old');
    // 退回两张表出现之前的形状。两张都是系统表、不在版本化域里，裸 DDL 不被写入门禁拦
    const firstAdapter = await firstValueFrom(first.localAdapter$);
    await firstAdapter.transaction(async executor => {
      for (const EntityClass of laterWorkingTreeTables(first)) {
        await executor.query(`DROP TABLE ${executor.tableRef(EntityClass)}`);
      }
    }, false);
    await first.disconnectAll();

    const [Old] = cloneEntityClasses([UpgradeOld]);
    const second = await open({ entities: [Old], workingTree: true }, dbName);
    const adapter = await firstValueFrom(second.localAdapter$);
    for (const EntityClass of laterWorkingTreeTables(second)) {
      expect(await adapter.isTableExisted(EntityClass)).toBe(true);
    }
    expect(
      await firstValueFrom(second.entityManager.getRepository(Old).find({ where: { combinator: 'and', rules: [] } }))
    ).toHaveLength(1);
    expect((await second.workingTree.listCommits()).entries.map(entry => entry.commitId)).toContain(oldCommit);
    await expect(second.workingTree.checkBranchFromCommit(oldCommit)).resolves.toEqual({
      ok: false,
      reason: 'fork_point_unknown'
    });

    await second.entityManager.getRepository(Old).create(Object.assign(new Old(), { title: 'new' }));
    const newCommit = await commitAll(second, 'new');
    await expect(second.workingTree.createBranchFromCommit('from-new', newCommit)).resolves.toMatchObject({ ok: true });
  });

  it('接入方配了迁移时，待执行迁移的写入照样进变更日志，随后补建新表', async () => {
    const dbName = newDbName();
    const first = await open({ entities: cloneEntityClasses([UpgradeOld]), migrations: [] }, dbName);
    await first.disconnectAll();

    const [Old, New] = cloneEntityClasses([UpgradeOld, UpgradeNew]);
    const migration: MigrationType = {
      name: 'seed-old',
      up: async executor => {
        await executor.getRepository(Old).create(Object.assign(new Old(), { title: 'seeded' }));
      },
      down: async () => undefined
    };
    const second = await open({ entities: [Old, New], migrations: [migration] }, dbName);

    const changes = await firstValueFrom(
      second.entityManager.getRepository(RxDBChange).find({
        where: { combinator: 'and', rules: [{ field: 'entity', operator: '=', value: getEntityMetadata(Old).name }] }
      })
    );
    expect(changes.map(change => change.type)).toEqual(['INSERT']);
    const created = await second.entityManager.getRepository(New).create(Object.assign(new New(), { title: 'n' }));
    expect(created.id).toBeTruthy();
  });
});
