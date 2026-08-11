import { runChangeLogSuite } from '@aiao/rxdb-test/encrypted';

import { readWaSqliteDatabaseFile } from './wa-sqlite-db-dump.js';
import { waSqlitePersistentEncryptedFactory } from './wa-sqlite-factory.js';

runChangeLogSuite({
  factory: waSqlitePersistentEncryptedFactory,
  readDatabaseFile: readWaSqliteDatabaseFile
});
