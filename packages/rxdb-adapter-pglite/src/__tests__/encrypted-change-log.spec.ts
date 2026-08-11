import { runChangeLogSuite } from '@aiao/rxdb-test/encrypted';

import { pgliteFactory, readPGliteDatabaseFile } from './encrypted-test-fixture.js';

runChangeLogSuite({
  factory: pgliteFactory,
  readDatabaseFile: readPGliteDatabaseFile,
  resolveTableName: ({ namespace, tableName }) => `"${namespace}"."${tableName}"`
});
