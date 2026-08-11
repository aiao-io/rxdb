import { runLifecycleSuite } from '@aiao/rxdb-test/encrypted';

import { pgliteFactory, readPGliteDatabaseFile } from './encrypted-test-fixture.js';

runLifecycleSuite({
  factory: pgliteFactory,
  readDatabaseFile: readPGliteDatabaseFile,
  resolveTableName: ({ namespace, tableName }) => `"${namespace}"."${tableName}"`
});
