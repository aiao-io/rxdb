import type { RxDB } from '@aiao/rxdb';
import { createRequire } from 'node:module';
const consumerRequire = createRequire('/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-adapter-sqlite-core/package.json');
const { TRANSACTION_COMMIT, TRANSACTION_ROLLBACK } = consumerRequire('@aiao/rxdb') as typeof import('@aiao/rxdb');
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterSqliteBase } from '../../../../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.js';
import type { SqliteClientLike } from '../../../../../../packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.js';
import type { SqliteResult } from '../../../../../../packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.js';
import type { SqliteTransactionExecutor } from '../../../../../../packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.js';

class BoundaryAdapter extends RxDBAdapterSqliteBase {
  readonly name = 'review-packages-20261005-boundary';
  constructor(rxdb: RxDB, private readonly client: SqliteClientLike) { super(rxdb); }
  protected async createClient(): Promise<SqliteClientLike> { return this.client; }
  protected override ready(): Promise<void> { return Promise.resolve(); }
}

const observeBoundary = async (phase: 'commit' | 'rollback') => {
  const db = new DatabaseSync(':memory:');
  const sqlLog: string[] = [];
  const client: SqliteClientLike = {
    async execute(sql): Promise<SqliteResult> {
      sqlLog.push(sql);
      db.exec(sql);
      return { sql, rowsAffected: 0, elapsed: 0, results: [] };
    },
    async disconnect(): Promise<void> { db.close(); },
    async version(): Promise<string> { return 'probe'; },
    addEventListener(): void {}
  };
  let escaped: SqliteTransactionExecutor | undefined;
  let stateAtEvent: string | undefined;
  let boundaryWrite: Promise<boolean> | undefined;
  const rxdb = {
    config: { entities: [], dbName: 'review-packages-20261005-boundary' },
    context: {},
    dispatchEvent(event: unknown): void {
      const boundaryType = phase === 'commit' ? TRANSACTION_COMMIT : TRANSACTION_ROLLBACK;
      const matches = typeof event === 'object' && event !== null && 'type' in event && event.type === boundaryType;
      if (!matches || !escaped) return;
      stateAtEvent = escaped.state;
      boundaryWrite = escaped.execute("INSERT INTO boundary VALUES ('escaped')").then(() => true, () => false);
    }
  } as unknown as RxDB;
  const adapter = new BoundaryAdapter(rxdb, client);
  await adapter.connect();
  await client.execute('CREATE TABLE boundary (value TEXT NOT NULL)');
  const transaction = adapter.transaction(async tx => {
    escaped = tx;
    await tx.execute("INSERT INTO boundary VALUES ('owned')");
    if (phase === 'rollback') throw new Error('expected rollback');
  }, false);
  if (phase === 'rollback') await expect(transaction).rejects.toThrow('expected rollback');
  else await transaction;
  const accepted = await boundaryWrite;
  const rows = db.prepare('SELECT value FROM boundary ORDER BY value').all();
  const observation = { phase, stateAtEvent, accepted, rows, sqlLog, finalState: escaped?.state };
  console.log('BOUNDARY_OBSERVATION', JSON.stringify(observation));
  await adapter.disconnect();
  return observation;
};

describe('review-packages-20261005 transaction terminal boundary', () => {
  it('COMMIT listener sees committed executor and cannot write outside the committed transaction', async () => {
    const observed = await observeBoundary('commit');
    expect(observed.stateAtEvent).toBe('committed');
    expect(observed.accepted).toBe(false);
    expect(observed.rows).toEqual([{ value: 'owned' }]);
  });
  it('ROLLBACK listener sees rolled-back executor and cannot create autocommit rows after rollback', async () => {
    const observed = await observeBoundary('rollback');
    expect(observed.stateAtEvent).toBe('rolled-back');
    expect(observed.accepted).toBe(false);
    expect(observed.rows).toEqual([]);
  });
});
