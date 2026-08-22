import type { EntityMetadata, EntityType } from '@aiao/rxdb';
import {
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
