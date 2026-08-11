import { afterAll } from 'vitest';

import { runCrudSuite, runQueryValidationSuite } from '@aiao/rxdb-test/encrypted';

import { readWaSqliteDatabaseFile } from './wa-sqlite-db-dump.js';
import { waSqliteEncryptedFactory, waSqlitePersistentEncryptedFactory } from './wa-sqlite-factory.js';

runCrudSuite({
  factory: waSqlitePersistentEncryptedFactory,
  readDatabaseFile: readWaSqliteDatabaseFile
});

runQueryValidationSuite({ factory: waSqliteEncryptedFactory });

// 尽力终止：避免套件之间残留 worker。
afterAll(() => {
  /* 套件内部每个 describe 的 afterAll 负责断开连接。 */
});
