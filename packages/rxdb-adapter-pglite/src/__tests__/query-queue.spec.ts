import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { afterEach, describe, expect, it } from 'vitest';

import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';

describe('RxDBAdapterPGlite query queue', () => {
  let database: RxDB | undefined;

  afterEach(async () => {
    await database?.disconnectAll();
  });

  it('相同并发写入必须逐次执行', async () => {
    database = new RxDB({
      context: { userId: 'query-queue' },
      dbName: `query-queue-${crypto.randomUUID()}`,
      entities: [Todo],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    database.adapter('pglite', async rxdb => new RxDBAdapterPGlite(rxdb, { store: 'memory' }));
    const adapter = await database.connect('pglite');

    await adapter.query('CREATE TEMP TABLE repeated_writes (value integer)');
    await Promise.all([
      adapter.query('INSERT INTO repeated_writes (value) VALUES ($1)', [1]),
      adapter.query('INSERT INTO repeated_writes (value) VALUES ($1)', [1])
    ]);

    const result = await adapter.query<{ count: number }>('SELECT count(*)::integer AS count FROM repeated_writes');
    expect(result.rows[0]?.count).toBe(2);
  });
});
