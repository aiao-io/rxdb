import { describe, expect, it } from 'vitest';

import type { WaSqliteClient } from '../SqliteClient.js';
import { readWaSqliteDatabaseFile } from './wa-sqlite-db-dump.js';
import { waSqliteFactory } from './wa-sqlite-factory.js';

describe('wa-sqlite physical database dump', () => {
  it('读取 SQLite 物理页而不是重新编码可见行', async () => {
    const dbName = `physical-dump-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const client = await waSqliteFactory.createClient<WaSqliteClient>(dbName, {
      vfs: 'IDBBatchAtomicVFS'
    });
    const sentinel = 'physical-page-sentinel-7f3c9a';

    try {
      await client.execute('PRAGMA secure_delete = OFF');
      await client.execute('CREATE TABLE physical_probe (value TEXT NOT NULL)');
      await client.execute('INSERT INTO physical_probe VALUES (?)', [sentinel]);
      await client.execute('DELETE FROM physical_probe');

      const adapter = {
        query: (sql: string) => client.execute(sql),
        rxdb: { config: { dbName } }
      };
      const bytes = await readWaSqliteDatabaseFile(adapter);
      const text = new TextDecoder().decode(bytes);

      expect(text.startsWith('SQLite format 3\0')).toBe(true);
      expect(text).toContain(sentinel);
    } finally {
      await client.disconnect();
    }
  });
});
