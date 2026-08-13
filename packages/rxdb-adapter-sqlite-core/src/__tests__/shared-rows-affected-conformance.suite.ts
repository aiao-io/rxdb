import { describe, expect, it } from 'vitest';
import type { SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import type { AdapterFactory } from './adapter-factory.js';

/**
 * writer lease 续租与 upgrade guard 校验的唯一判据是 `rowsAffected !== 1`
 * （`RxDBAdapterSqliteBase` 的 L507 / L556 / L618 / L1235）。这套断言把该判据所依赖的
 * 三条后端语义钉死，任一 SQLite 后端不满足即视为 fencing 不可信。
 *
 * 之所以必须是跨后端的 conformance 套件而不是人工复核：sqlite-core 内部已记录同类事故
 * （SQLC-030）——SELECT 会读到**上一条写语句**遗留的 `db.changes()`。
 */
const GUARD_TABLE = 'conformance_upgrade_guard';
const LEASE_TABLE = 'conformance_writer_lease';
const DATABASE_ID = 'conformance-db';
const WRITER_ID = 'writer-a';
const PROTOCOL_VERSION = 1;

/** 与生产一致的条件 UPSERT：guard 不满足 state/epoch/minProtocol 时 SELECT 产出 0 行，UPSERT 即命中 0 行。 */
const RENEW_LEASE_SQL = `INSERT INTO ${LEASE_TABLE} ("databaseId", "writerId", "protocolVersion", "epoch")
   SELECT ?, ?, ?, "epoch"
   FROM ${GUARD_TABLE}
   WHERE "databaseId" = ? AND "state" = 'open' AND "epoch" = ? AND "minProtocol" <= ?
   ON CONFLICT ("databaseId", "writerId") DO UPDATE SET
     "protocolVersion" = excluded."protocolVersion",
     "epoch" = excluded."epoch"`;

const renewBindings = (epoch: number) => [
  DATABASE_ID,
  WRITER_ID,
  PROTOCOL_VERSION,
  DATABASE_ID,
  epoch,
  PROTOCOL_VERSION
];

async function seedGuard(client: SqliteClientLike): Promise<void> {
  await client.execute(
    `CREATE TABLE ${GUARD_TABLE} (
       "databaseId" TEXT PRIMARY KEY,
       "epoch" INTEGER NOT NULL,
       "state" TEXT NOT NULL,
       "minProtocol" INTEGER NOT NULL
     );`
  );
  await client.execute(
    `CREATE TABLE ${LEASE_TABLE} (
       "databaseId" TEXT NOT NULL,
       "writerId" TEXT NOT NULL,
       "protocolVersion" INTEGER NOT NULL,
       "epoch" INTEGER NOT NULL,
       PRIMARY KEY ("databaseId", "writerId")
     );`
  );
  await client.execute(
    `INSERT INTO ${GUARD_TABLE} ("databaseId", "epoch", "state", "minProtocol") VALUES (?, 1, 'open', 1);`,
    [DATABASE_ID]
  );
}

/**
 * 前缀刻意压到 `ra-`：wa-sqlite 内建 VFS 的路径上限是 49 字节（`assertWaSqliteDatabaseName`），
 * 而 `${factory.name}-${Date.now()}-${随机 6 位}` 本身就占掉 30 字节。
 */
const createConformanceClient = (factory: AdapterFactory, scope: string): Promise<SqliteClientLike> =>
  factory.createClient<SqliteClientLike>(
    `ra-${scope}-${factory.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

/** SqliteBackend 契约的 `rowsAffected` conformance 套件（US-304 AC4）。 */
export function rowsAffectedConformanceSuite(factory: AdapterFactory) {
  describe(`rowsAffected conformance [${factory.name}]`, () => {
    it('条件 UPSERT 命中 1 行时为 1，guard 不匹配时为 0', async () => {
      const client = await createConformanceClient(factory, 'upsert');

      try {
        await seedGuard(client);

        const inserted = await client.execute(RENEW_LEASE_SQL, renewBindings(1));
        expect(inserted.rowsAffected).toBe(1);

        // 冲突分支（DO UPDATE）同样必须报 1，否则续租会被误判为 writer_fenced。
        const renewed = await client.execute(RENEW_LEASE_SQL, renewBindings(1));
        expect(renewed.rowsAffected).toBe(1);

        // epoch 不匹配：guard 的 SELECT 产出 0 行，UPSERT 必须命中 0 行。
        const staleEpoch = await client.execute(RENEW_LEASE_SQL, renewBindings(99));
        expect(staleEpoch.rowsAffected).toBe(0);

        // state 不是 open：同样必须命中 0 行。
        await client.execute(`UPDATE ${GUARD_TABLE} SET "state" = 'draining' WHERE "databaseId" = ?;`, [DATABASE_ID]);
        const draining = await client.execute(RENEW_LEASE_SQL, renewBindings(1));
        expect(draining.rowsAffected).toBe(0);
      } finally {
        await client.disconnect();
      }
    });

    it('紧随写语句之后的 SELECT 不继承上一条写语句的计数', async () => {
      const client = await createConformanceClient(factory, 'select');

      try {
        await seedGuard(client);

        const insertedRows = await client.execute(
          `INSERT INTO ${LEASE_TABLE} ("databaseId", "writerId", "protocolVersion", "epoch")
           VALUES (?, 'w1', 1, 1), (?, 'w2', 1, 1), (?, 'w3', 1, 1);`,
          [DATABASE_ID, DATABASE_ID, DATABASE_ID]
        );
        expect(insertedRows.rowsAffected).toBe(3);

        // SQLC-030：db.changes() 此刻仍是 3，但 SELECT 自身没有改动任何行。
        const selectAfterInsert = await client.execute(`SELECT "writerId" FROM ${LEASE_TABLE} ORDER BY "writerId";`);
        expect(selectAfterInsert.results[0].rows).toEqual([['w1'], ['w2'], ['w3']]);
        expect(selectAfterInsert.rowsAffected).toBe(0);

        const updated = await client.execute(`UPDATE ${LEASE_TABLE} SET "epoch" = 2 WHERE "writerId" IN ('w1', 'w2');`);
        expect(updated.rowsAffected).toBe(2);

        // 零行结果集同样不得继承上一条 UPDATE 的 2。
        const emptySelect = await client.execute(`SELECT "writerId" FROM ${LEASE_TABLE} WHERE "epoch" = 999;`);
        expect(emptySelect.results[0].rows).toEqual([]);
        expect(emptySelect.rowsAffected).toBe(0);

        // guard 读取在生产里紧跟 DELETE，是 drain 判定的输入，必须同样干净。
        const deleted = await client.execute(`DELETE FROM ${LEASE_TABLE} WHERE "writerId" = 'w3';`);
        expect(deleted.rowsAffected).toBe(1);
        const guardRead = await client.execute(`SELECT "state", "epoch" FROM ${GUARD_TABLE} WHERE "databaseId" = ?;`, [
          DATABASE_ID
        ]);
        expect(guardRead.results[0].rows).toEqual([['open', 1]]);
        expect(guardRead.rowsAffected).toBe(0);
      } finally {
        await client.disconnect();
      }
    });

    it('事务回滚后重放同一 UPSERT，计数不累积', async () => {
      const client = await createConformanceClient(factory, 'rollback');

      try {
        await seedGuard(client);
        const beginSql = (await client.beginTransactionSql?.()) ?? 'BEGIN;';

        await client.execute(beginSql);
        const firstAttempt = await client.execute(RENEW_LEASE_SQL, renewBindings(1));
        expect(firstAttempt.rowsAffected).toBe(1);
        await client.execute('ROLLBACK;');

        // 回滚丢弃了这一行；重放必须仍然报 1（走 INSERT 分支），而不是叠加成 2。
        await client.execute(beginSql);
        const replay = await client.execute(RENEW_LEASE_SQL, renewBindings(1));
        expect(replay.rowsAffected).toBe(1);
        await client.execute('COMMIT;');

        const persisted = await client.execute(
          `SELECT "writerId", "epoch" FROM ${LEASE_TABLE} WHERE "databaseId" = ?;`,
          [DATABASE_ID]
        );
        expect(persisted.results[0].rows).toEqual([[WRITER_ID, 1]]);
      } finally {
        await client.disconnect();
      }
    });
  });
}
