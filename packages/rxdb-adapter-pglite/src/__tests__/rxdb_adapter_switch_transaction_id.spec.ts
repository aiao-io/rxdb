import { encodeRxDBChangeEntityId, RxDB, SyncType } from '@aiao/rxdb';
import { ENTITIES, User } from '@aiao/rxdb-test/shop';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import rxdb_adapter_switch_transaction_id from '../version/switch_transaction_id.js';

describe('事务 ID 上下文', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;
  const dbName = `switch-tx-test-${Date.now()}`;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName,
      context: { userId: 'test-user' },
      entities: [...ENTITIES],
      sync: {
        local: { adapter: 'pglite' },
        type: SyncType.None
      }
    });

    rxdb.adapter('pglite', async db => {
      adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
      return adapter;
    });

    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    await rxdb.disconnectAll();
  });

  it('只生成一条参数化的 transaction-local setting，不生成 trigger DDL', () => {
    const transactionId = '123e4567-e89b-12d3-a456-426614174000';
    const statement = rxdb_adapter_switch_transaction_id(transactionId);

    expect(statement).toEqual({
      sql: "SELECT set_config('rxdb.transaction_id', $1::text, true)",
      params: [transactionId]
    });
    expect(statement.sql).not.toMatch(/CREATE|DROP|ALTER/i);
  });

  it('日志事务把 executor ID 写入 change，且不改变当前分支', async () => {
    const branchId = 'feature-transaction-setting';
    await rxdb.versionManager.createBranch(branchId);
    await rxdb.versionManager.switchBranch(branchId);

    const user = rxdb.entityManager.instantiate(User);
    user.name = 'Transaction Context User';
    user.age = 30;
    let transactionId = '';

    await adapter.transaction(async executor => {
      transactionId = executor.id;
      await executor.saveMany([user]);
    });

    const result = await adapter.query<{ branchId: string; transactionId: string | null }>(
      `SELECT "branchId", "transactionId" FROM "rxdb"."rxdb_change" WHERE "entityId" = $1`,
      [encodeRxDBChangeEntityId(user.id)]
    );

    expect(result.rows).toEqual([{ branchId, transactionId }]);
  });
});
