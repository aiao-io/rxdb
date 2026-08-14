import {
  Entity,
  EntityBase,
  PropertyType,
  RXDB_CHANGE_CODEC_WATERMARK,
  RXDB_SYSTEM_SCHEMA_WATERMARK,
  RXDB_WRITER_PROTOCOL_VERSION,
  RxDBChange,
  RxDBMigration,
  UnsupportedRxDBSystemVersionError,
  getEntityMetadata
} from '@aiao/rxdb';
import { filter, firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { get_table_name_by_metadata, quote_sql_identifier } from '../sqlite-core.utils.js';
import type { AdapterFactory } from './adapter-factory.js';
import { Todo } from './fixtures/Todo.js';
import { SUITE_DEADLINE_MS } from './test-utils.js';

const currentWatermarks = [RXDB_SYSTEM_SCHEMA_WATERMARK, RXDB_CHANGE_CODEC_WATERMARK] as const;

@Entity({ name: 'RuntimeTodo', properties: [{ name: 'title', type: PropertyType.string }] })
class RuntimeTodo extends EntityBase {
  title!: string;
}

const placeholders = currentWatermarks.map(() => '?').join(', ');

const readWatermarks = async (adapter: RxDBAdapterSqliteBase): Promise<Array<[number, string]>> => {
  const table = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
  const result = await adapter.internalQuery(
    `SELECT "id", "name" FROM ${table} WHERE "name" IN (${placeholders}) ORDER BY "id"`,
    [...currentWatermarks]
  );
  return (result.results[0]?.rows ?? []) as Array<[number, string]>;
};

const readRows = async (adapter: RxDBAdapterSqliteBase, sql: string): Promise<unknown[][]> => {
  const result = await adapter.internalQuery(sql);
  return result.results.flatMap(item => item.rows);
};

const readGuardEpoch = async (adapter: RxDBAdapterSqliteBase): Promise<number> => {
  const rows = await readRows(adapter, `SELECT "epoch" FROM "rxdb$rxdb_upgrade_guard"`);
  const epoch = rows[0]?.[0];
  if (typeof epoch !== 'number') throw new Error('Missing writer guard epoch.');
  return epoch;
};

const reconnectAdapter = async (
  adapter: RxDBAdapterSqliteBase,
  adapterName: string
): Promise<RxDBAdapterSqliteBase> => {
  const rxdb = adapter.rxdb;
  await rxdb.disconnectAll();
  const connect = rxdb.connect.bind(rxdb) as (name: string) => Promise<RxDBAdapterSqliteBase>;
  return connect(adapterName);
};

/** system schema 迁移测试：系统表结构的升级与持久化。 */
export function systemSchemaMigrationSuite(factory: AdapterFactory): void {
  describe.sequential(`system schema migration [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [Todo], persistent: true });
      await firstValueFrom(adapter.rxdb.versionManager.history().undoHistories$);
    });

    afterAll(async () => {
      if (!adapter) return;
      try {
        await adapter.rxdb.disconnectAll();
      } finally {
        await factory.cleanupAdapter?.(adapter);
      }
    });

    it('注册持久化 writer lease 并初始化 open guard', async () => {
      const guardRows = await readRows(
        adapter,
        `SELECT "epoch", "state", "minProtocol" FROM "rxdb$rxdb_upgrade_guard"`
      );
      const leaseRows = await readRows(
        adapter,
        `SELECT "writerId", "protocolVersion", "epoch", julianday("expiresAt") > julianday("lastSeenAt")
         FROM "rxdb$rxdb_writer_lease"`
      );

      expect(guardRows).toEqual([[2, 'open', RXDB_WRITER_PROTOCOL_VERSION]]);
      expect(leaseRows).toHaveLength(1);
      expect(leaseRows[0]?.[0]).toEqual(expect.any(String));
      expect(leaseRows[0]?.slice(1)).toEqual([RXDB_WRITER_PROTOCOL_VERSION, 2, 1]);
    });

    it('持久化 epoch 提升后在业务事务回调前 fence 旧 writer', async () => {
      const writerEpoch = await readGuardEpoch(adapter);
      const fencedEpoch = writerEpoch + 1;
      await adapter.internalQuery(`UPDATE "rxdb$rxdb_upgrade_guard" SET "epoch" = ? WHERE "databaseId" = ?`, [
        fencedEpoch,
        adapter.rxdb.config.dbName
      ]);

      try {
        await expect(
          adapter.query(`UPDATE "rxdb$rxdb_writer_lease" SET "protocolVersion" = "protocolVersion" WHERE 0`)
        ).rejects.toThrow(/was fenced by epoch \d+|requires reconnect/);

        let transactionBodyRan = false;
        await expect(
          adapter.transaction(async () => {
            transactionBodyRan = true;
          }, false)
        ).rejects.toThrow('requires reconnect');
        expect(transactionBodyRan).toBe(false);

        const staleTodo = new Todo();
        staleTodo.title = 'stale-writer';
        staleTodo.completed = false;
        await expect(adapter.getRepository(Todo).create(staleTodo)).rejects.toThrow('requires reconnect');
      } finally {
        await adapter.internalQuery(`UPDATE "rxdb$rxdb_upgrade_guard" SET "epoch" = ? WHERE "databaseId" = ?`, [
          writerEpoch,
          adapter.rxdb.config.dbName
        ]);
        await expect(adapter.transaction(async () => undefined, false)).rejects.toThrow('requires reconnect');
        adapter = await reconnectAdapter(adapter, factory.name);
      }
    });

    it('运行期建表和 sequence 更新受 writer guard 保护', async () => {
      await expect(adapter.createTables([RuntimeTodo])).resolves.toBe(true);
      const tableWriterEpoch = await readGuardEpoch(adapter);
      await adapter.internalQuery(`UPDATE "rxdb$rxdb_upgrade_guard" SET "epoch" = ? WHERE "databaseId" = ?`, [
        tableWriterEpoch + 1,
        adapter.rxdb.config.dbName
      ]);

      try {
        await expect(adapter.createTables([RuntimeTodo])).rejects.toThrow(/was fenced by epoch \d+|requires reconnect/);
      } finally {
        await adapter.internalQuery(`UPDATE "rxdb$rxdb_upgrade_guard" SET "epoch" = ? WHERE "databaseId" = ?`, [
          tableWriterEpoch,
          adapter.rxdb.config.dbName
        ]);
        adapter = await reconnectAdapter(adapter, factory.name);
      }

      const sequenceWriterEpoch = await readGuardEpoch(adapter);
      await adapter.internalQuery(`UPDATE "rxdb$rxdb_upgrade_guard" SET "epoch" = ? WHERE "databaseId" = ?`, [
        sequenceWriterEpoch + 1,
        adapter.rxdb.config.dbName
      ]);
      try {
        await expect(adapter.setRxDBChangeSequence(123)).rejects.toThrow(/was fenced by epoch \d+|requires reconnect/);
      } finally {
        await adapter.internalQuery(`UPDATE "rxdb$rxdb_upgrade_guard" SET "epoch" = ? WHERE "databaseId" = ?`, [
          sequenceWriterEpoch,
          adapter.rxdb.config.dbName
        ]);
        adapter = await reconnectAdapter(adapter, factory.name);
      }
    });

    it(
      '升级旧 UUID/plain JSON change，重复执行不改写历史',
      async () => {
        const migrationTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
        const changeTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBChange)));
        const todoTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(Todo)));
        const legacyId = '550e8400-e29b-41d4-a716-446655440000';
        const now = new Date().toISOString();
        const legacyCreatedAt = new Date(Date.now() + 60_000).toISOString();
        await adapter.internalQuery(`DELETE FROM ${migrationTable} WHERE "name" IN (${placeholders})`, [
          ...currentWatermarks
        ]);
        await adapter.internalQuery(
          `INSERT INTO ${todoTable} ("id", "title", "completed", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)`,
          [legacyId, 'legacy', 0, now, now]
        );
        await adapter.internalQuery(
          `INSERT INTO ${changeTable}
         ("type", "namespace", "entity", "branchId", "entityId", "inversePatch", "patch", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ['INSERT', 'public', 'Todo', 'main', legacyId, null, '{"title":"legacy"}', legacyCreatedAt, legacyCreatedAt]
        );

        adapter = await reconnectAdapter(adapter, factory.name);

        const changes = await adapter.localRxDBChange().find({
          where: {
            combinator: 'and',
            rules: [{ field: 'entityId', operator: '=', value: legacyId }]
          }
        });
        expect(changes).toHaveLength(1);
        expect(changes[0].entityId).toBe(legacyId);
        expect(changes[0].patch).toEqual({ title: 'legacy' });

        const history = adapter.rxdb.versionManager.history(Todo);
        await firstValueFrom(
          history.undoHistories$.pipe(
            filter(histories =>
              histories.some(item =>
                item.changes.some(change => change.type === 'INSERT' && change.entityId === legacyId)
              )
            )
          )
        );

        await adapter.rxdb.versionManager.createBranch('legacy-history');
        await adapter.rxdb.versionManager.switchBranch('legacy-history');
        expect(
          await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: legacyId }] }
          })
        ).toHaveLength(1);
        await adapter.rxdb.versionManager.switchBranch('main');

        await history.undo();
        expect(
          await adapter.getRepository(Todo).find({
            where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: legacyId }] }
          })
        ).toHaveLength(0);
        const firstWatermarks = await readWatermarks(adapter);
        expect(firstWatermarks.map(row => row[1])).toEqual(currentWatermarks);

        adapter = await reconnectAdapter(adapter, factory.name);

        expect(await readWatermarks(adapter)).toEqual(firstWatermarks);
        const rawChange = await adapter.internalQuery(`SELECT "entityId", "patch" FROM ${changeTable} WHERE "id" = ?`, [
          changes[0].id
        ]);
        expect(rawChange.results[0]?.rows[0]).toEqual([legacyId, '{"title":"legacy"}']);
        // 本例走两次 reconnect（各含一轮 bootstrap + 迁移）外加建/切分支与 undo，单跑约 1~3.5s。
        // 原先写死 10s，低于 acceptance 配置的 30s，并发下 sqlite / sqliteai 两个 suite 超时假红。
      },
      SUITE_DEADLINE_MS
    );

    it('迁移失败完整回滚，重新打开后自动重试且不改写 change', async () => {
      const migrationTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
      const changeTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBChange)));
      const failureTrigger = quote_sql_identifier('reject_codec_watermark');
      const changesBefore = await readRows(
        adapter,
        `SELECT "id", "entityId", "inversePatch", "patch" FROM ${changeTable} ORDER BY "id"`
      );

      await adapter.internalQuery(`DELETE FROM ${migrationTable} WHERE "name" IN (${placeholders})`, [
        ...currentWatermarks
      ]);
      await adapter.internalQuery(`
        CREATE TRIGGER ${failureTrigger}
        BEFORE INSERT ON ${migrationTable}
        WHEN NEW."name" = '${RXDB_CHANGE_CODEC_WATERMARK}'
        BEGIN
          SELECT RAISE(ABORT, 'injected codec watermark failure');
        END;
      `);
      const triggersBefore = await readRows(
        adapter,
        `SELECT "name", "sql" FROM sqlite_master WHERE "type" = 'trigger' ORDER BY "name"`
      );

      await expect(adapter.migrateSystemSchema()).rejects.toThrow('injected codec watermark failure');

      expect(await readWatermarks(adapter)).toEqual([]);
      expect(
        await readRows(adapter, `SELECT "name", "sql" FROM sqlite_master WHERE "type" = 'trigger' ORDER BY "name"`)
      ).toEqual(triggersBefore);
      expect(
        await readRows(adapter, `SELECT "id", "entityId", "inversePatch", "patch" FROM ${changeTable} ORDER BY "id"`)
      ).toEqual(changesBefore);

      await adapter.internalQuery(`DROP TRIGGER ${failureTrigger}`);
      adapter = await reconnectAdapter(adapter, factory.name);

      expect((await readWatermarks(adapter)).map(row => row[1])).toEqual(currentWatermarks);
      expect(
        await readRows(adapter, `SELECT "id", "entityId", "inversePatch", "patch" FROM ${changeTable} ORDER BY "id"`)
      ).toEqual(changesBefore);
    });

    it('高版本水位 fail-fast', async () => {
      const migrationTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
      await adapter.internalQuery(
        `INSERT INTO ${migrationTable} ("name", "executedAt") VALUES (?, CURRENT_TIMESTAMP)`,
        ['__rxdb_change_codec__:2']
      );

      await expect(adapter.migrateSystemSchema()).rejects.toBeInstanceOf(UnsupportedRxDBSystemVersionError);
    });
  });
}
