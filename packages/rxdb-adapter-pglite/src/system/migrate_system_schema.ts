import type { EntityMetadata, EntityType } from '@aiao/rxdb';
import {
  ACTIVE_BRANCH_KEY,
  AmbiguousActiveBranchError,
  assertSupportedRxDBSystemVersions,
  getEntityMetadata,
  getRxDBSystemVersionState,
  isCurrentRxDBSystemVersion,
  RXDB_CHANGE_CODEC_WATERMARK,
  RXDB_CHANGE_CODEC_WATERMARK_PREFIX,
  RXDB_SYSTEM_SCHEMA_WATERMARK,
  RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX,
  RxDBBranch,
  RxDBChange,
  RxDBMigration,
  RxDBSystemMigrationLockError
} from '@aiao/rxdb';
import { AsyncQueueExecutor } from '@aiao/utils';
import {
  type EncryptionContext,
  getTableColumnIndexName,
  getTableNameByMetadata,
  quoteIdentifier,
  RxdbAdapterPGliteError,
  rxDBColumnTypeToPGliteType,
  rxDBColumnTypeToPGliteTypeIndexName
} from '../pglite.utils.js';
import type { IPGliteClient } from '../PGliteClient.js';
import { remove_trigger_sql } from '../table/remove_trigger_sql.js';
import generate_trigger_sql from '../table/trigger_sql.js';

type SystemMigrationOutcome = 'current' | 'migrated' | 'storage-peer';

/** 系统 schema 迁移宿主。 */
export interface SystemSchemaMigrationHost {
  readonly entities: readonly EntityType[];
  readonly encryptionContext: EncryptionContext;
  readonly queue: AsyncQueueExecutor;
  readonly suppressedChangeTables: Set<string>;
  getClient(): Promise<IPGliteClient>;
}

/** 零 active 时的恢复目标；与 `system/active-branch-guard.ts` 用的是同一个名字。 */
const MAIN_BRANCH_ID = 'main';

/**
 * 在既有库上补出 `rxdb_branch.activeKey` 与它那条唯一索引，并把基数收敛到「至多一个 active」。
 *
 * @param tx - 迁移那个事务
 * @param branchMetadata - `RxDBBranch` 的元数据
 * @param existingTables - 库里现有的 `namespace\0tableName` 集合
 * @throws {@link AmbiguousActiveBranchError} 库里有多行 `activated` 时；一行都不改，由调用方回滚整条迁移
 *
 * @remarks
 * 顺序是被两条**相反**的约束夹出来的，不是风格：**先建索引、后回填**。
 *
 * 反过来不行——Postgres 在关系上有未触发的 AFTER 触发器事件时直接拒绝 `CREATE INDEX`
 * （`cannot CREATE INDEX ... because it has pending trigger events`），而 `rxdb_branch`
 * 带着变更日志触发器，回填那两条 UPDATE 正好会把事件排进队列。
 *
 * 先建索引之所以安全，是因为列要么是这一步刚加的（整列 NULL），要么是随建表语句一起来的
 * ——而建表语句同时产出索引（`unique: true` 在两端都编译成独立的 `CREATE UNIQUE INDEX`），
 * 于是「列在、索引不在且已有重复值」这个组合在正常路径上不可达。真撞上就让它原样炸，
 * 不猜也不补。
 *
 * 回填写成「先全清、再点亮」两条语句，而不是一条 `CASE`：唯一索引是**逐行立即**检查的，
 * 把哨兵值从一行搬到另一行会按行处理顺序瞬时自撞。
 *
 * 两条语句都必须在库态已经正确时**一行都不写**。本步骤不只跑在旧库上：水位线是
 * `migrateSystemSchema()` 最后才写的，所以新库第一次 connect() 同样会走完这里。
 * `rxdb_branch` 挂着 `pg_notify` 触发器，把同一个值原样写回去一样会 NOTIFY，异步派发成一条
 * `inversePatch: {}` 的裸 `RxDBBranch` UPDATE 事件混进调用方的事件流——而且没有任何东西会报错。
 *
 * **零 active 且库里连 `main` 行都没有时，这里什么都不建。** 迁移 0004 的不变量是「新库与
 * 升级库逐字段相同」——一个分支行必须连带 `rxdb_commit_branch_ref` 与 `rxdb_working_tree_state`
 * 两行（见 `commit/branch-commit-rows.ts`），而这里是裸 SQL，造不出那两行。凭空插一行
 * `main` 等于亲手制造一个原本不存在的不一致；这种库交给实体层的 `resolve_current_branch`
 * 去建，它走的是能连带写全的那条路。空表本身不违反「至多一个」，索引照建不误。
 */
const ensureBranchActiveKey = async (
  tx: Pick<IPGliteClient, 'query'>,
  branchMetadata: EntityMetadata,
  existingTables: ReadonlySet<string>
): Promise<void> => {
  if (!existingTables.has(`${branchMetadata.namespace}\u0000${branchMetadata.tableName}`)) return;

  const activeKeyProperty = branchMetadata.properties.find(property => property.name === 'activeKey');
  if (!activeKeyProperty) {
    throw new RxdbAdapterPGliteError('RxDBBranch metadata is missing the "activeKey" property.');
  }
  const branchTable = getTableNameByMetadata(branchMetadata);
  const activeKeyColumn = quoteIdentifier(activeKeyProperty.columnName);

  const columnResult = await tx.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1::text AND table_name = $2::text AND column_name = $3::text`,
    [branchMetadata.namespace, branchMetadata.tableName, activeKeyProperty.columnName]
  );
  if (columnResult.rows.length === 0) {
    // 列类型走与建表同一个 helper：新库与升级库的形状必须逐字节一致，各写一份字面量
    // 不会有编译错误，只会让两条路径悄悄分叉。
    await tx.query(
      `ALTER TABLE ${branchTable} ADD COLUMN ${activeKeyColumn} ${rxDBColumnTypeToPGliteType(activeKeyProperty)}`
    );
  }

  const activeResult = await tx.query<{ id: string }>(
    `SELECT "id" FROM ${branchTable} WHERE "activated" IS TRUE ORDER BY "id"`
  );
  if (activeResult.rows.length > 1) {
    throw new AmbiguousActiveBranchError(activeResult.rows.map(row => row.id));
  }

  await tx.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier(
      getTableColumnIndexName(branchMetadata, activeKeyProperty)
    )} ON ${branchTable}(${activeKeyColumn} ${rxDBColumnTypeToPGliteTypeIndexName(activeKeyProperty)})`
  );

  const activeBranchId = activeResult.rows[0]?.id;
  // 两条 UPDATE 都带着「已经对了就别碰」的谓词。清空那条顺便把目标行排除在外——它本来就要被
  // 点亮，先清再写等于凭空重写一次。排除它不会削弱两条语句拆开的初衷：哨兵值从 A 行搬到 B 行时
  // A 仍在清空范围内，索引照样不会瞬时自撞。
  await tx.query(
    `UPDATE ${branchTable} SET ${activeKeyColumn} = NULL
     WHERE ${activeKeyColumn} IS NOT NULL AND "id" <> $1::text`,
    [activeBranchId ?? MAIN_BRANCH_ID]
  );

  if (activeBranchId !== undefined) {
    await tx.query(
      `UPDATE ${branchTable} SET ${activeKeyColumn} = $1::text
       WHERE "id" = $2::text AND ${activeKeyColumn} IS DISTINCT FROM $1::text`,
      [ACTIVE_BRANCH_KEY, activeBranchId]
    );
    return;
  }
  // 零 active 这一支不需要守卫：`activated` 此刻必然为假（否则不会走到这里），这条 UPDATE
  // 一定是真变更。
  await tx.query(`UPDATE ${branchTable} SET "activated" = TRUE, ${activeKeyColumn} = $1::text WHERE "id" = $2::text`, [
    ACTIVE_BRANCH_KEY,
    MAIN_BRANCH_ID
  ]);
};

/**
 * 把系统表升级到当前水位线。
 *
 * `storage-peer` 在事务回调之后抛 {@link RxDBSystemMigrationLockError}：
 * 对端持有同一份持久化存储时不能在本进程改 schema。
 */
export async function migrateSystemSchema(host: SystemSchemaMigrationHost): Promise<void> {
  const client = await host.getClient();
  host.suppressedChangeTables.add('rxdb_migration');
  try {
    await host.queue.addTask(async () => {
      const outcome = await client.transaction<SystemMigrationOutcome>(async tx => {
        const tableResult = await tx.query<{ table_schema: string; table_name: string }>(
          `SELECT table_schema, table_name
           FROM information_schema.tables
           WHERE table_type = 'BASE TABLE'`
        );
        const existingTables = new Set(tableResult.rows.map(row => `${row.table_schema}\u0000${row.table_name}`));
        const existingMetadata: EntityMetadata[] = [];
        for (const EntityType of host.entities) {
          const metadata = getEntityMetadata(EntityType);
          if (existingTables.has(`${metadata.namespace}\u0000${metadata.tableName}`)) {
            existingMetadata.push(metadata);
          }
        }

        const migrationMetadata = getEntityMetadata(RxDBMigration);
        if (!existingTables.has(`${migrationMetadata.namespace}\u0000${migrationMetadata.tableName}`)) {
          throw new RxdbAdapterPGliteError('RxDB system migration table is missing.');
        }

        const migrationTable = getTableNameByMetadata(migrationMetadata);
        const watermarkResult = await tx.query<{ name: string }>(
          `SELECT "name" FROM ${migrationTable}
           WHERE left("name", $1::integer) = $2::text OR left("name", $3::integer) = $4::text`,
          [
            RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX.length,
            RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX,
            RXDB_CHANGE_CODEC_WATERMARK_PREFIX.length,
            RXDB_CHANGE_CODEC_WATERMARK_PREFIX
          ]
        );
        const state = getRxDBSystemVersionState(watermarkResult.rows.map(row => row.name));
        assertSupportedRxDBSystemVersions(state);
        if (isCurrentRxDBSystemVersion(state)) return 'current';

        if (client.hasStoragePeer?.() === true) return 'storage-peer';

        try {
          await tx.query(
            `LOCK TABLE ${existingMetadata.map(getTableNameByMetadata).join(', ')} IN ACCESS EXCLUSIVE MODE NOWAIT`
          );
        } catch (cause) {
          throw new RxDBSystemMigrationLockError(cause);
        }

        const branchMetadata = getEntityMetadata(RxDBBranch);
        let activeBranchId = 'main';
        if (existingTables.has(`${branchMetadata.namespace}\u0000${branchMetadata.tableName}`)) {
          const branchResult = await tx.query<{ id: string }>(
            `SELECT "id" FROM ${getTableNameByMetadata(branchMetadata)}
             WHERE "activated" IS TRUE LIMIT 1`
          );
          activeBranchId = branchResult.rows[0]?.id ?? activeBranchId;
        }

        const loggedMetadata = existingMetadata.filter(metadata => metadata.log !== false);
        for (const metadata of loggedMetadata) {
          for (const statement of remove_trigger_sql(metadata).split('---STATEMENT_SEPARATOR---')) {
            await tx.query(statement.trim());
          }
        }

        const changeMetadata = getEntityMetadata(RxDBChange);
        const columnResult = await tx.query<{ data_type: string }>(
          `SELECT data_type FROM information_schema.columns
           WHERE table_schema = $1::text AND table_name = $2::text AND column_name = 'entityId'`,
          [changeMetadata.namespace, changeMetadata.tableName]
        );
        const entityIdType = columnResult.rows[0]?.data_type;
        if (!entityIdType) {
          throw new RxdbAdapterPGliteError('RxDBChange.entityId column is missing.');
        }
        if (entityIdType !== 'text') {
          if (entityIdType !== 'uuid' && entityIdType !== 'character varying') {
            throw new RxdbAdapterPGliteError(`Unsupported legacy RxDBChange.entityId column type: ${entityIdType}`);
          }
          const changeTable = getTableNameByMetadata(changeMetadata);
          await tx.query(`ALTER TABLE ${changeTable} ALTER COLUMN "entityId" TYPE text USING "entityId"::text`);
        }

        for (const metadata of loggedMetadata) {
          const triggerSql = generate_trigger_sql(metadata, {
            branchId: activeBranchId,
            resolveEntityMetadata: host.encryptionContext.resolveEntityMetadata
          });
          for (const statement of triggerSql.split('---STATEMENT_SEPARATOR---')) {
            await tx.query(statement.trim());
          }
        }

        // RXD-036：给 rxdb_migration."name" 补唯一索引 —— 它是「同一条迁移只跑一次」的仲裁者。
        // 老库在旧实现下可能已经存了重名行（并发实例各写一条），不先去重，建索引这一步会直接失败
        // 并把整个升级卡死。保留最小 id 的那条：它是最先落库的，`executedAt` 也最接近真实执行时刻。
        const nameProperty = migrationMetadata.properties.find(property => property.name === 'name');
        if (!nameProperty) {
          throw new RxdbAdapterPGliteError('RxDBMigration metadata is missing the "name" property.');
        }
        await tx.query(
          `DELETE FROM ${migrationTable}
           WHERE "id" NOT IN (SELECT MIN("id") FROM ${migrationTable} GROUP BY "name")`
        );
        await tx.query(
          `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdentifier(
            getTableColumnIndexName(migrationMetadata, nameProperty)
          )} ON ${migrationTable}("name" ${rxDBColumnTypeToPGliteTypeIndexName(nameProperty)})`
        );

        await ensureBranchActiveKey(tx, branchMetadata, existingTables);

        for (const watermark of [RXDB_SYSTEM_SCHEMA_WATERMARK, RXDB_CHANGE_CODEC_WATERMARK]) {
          await tx.query(
            `INSERT INTO ${migrationTable} ("name", "executedAt")
             SELECT $1::text, now()
             WHERE NOT EXISTS (SELECT 1 FROM ${migrationTable} WHERE "name" = $1::text)`,
            [watermark]
          );
        }
        return 'migrated';
      });
      if (outcome === 'storage-peer') {
        throw new RxDBSystemMigrationLockError(new Error('Another PGlite client owns the same persistent storage.'));
      }
    });
  } finally {
    host.suppressedChangeTables.delete('rxdb_migration');
  }
}
