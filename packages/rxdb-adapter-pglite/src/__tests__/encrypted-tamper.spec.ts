import { runTamperSuite } from '@aiao/rxdb-test/encrypted';

import { pgliteFactory, readPGliteDatabaseFile } from './encrypted-test-fixture.js';

runTamperSuite({
  factory: pgliteFactory,
  readDatabaseFile: readPGliteDatabaseFile,
  resolveTableName: ({ namespace, tableName }) => `"${namespace}"."${tableName}"`
});
