import { runCrudSuite, runQueryValidationSuite } from '@aiao/rxdb-test/encrypted';

import { pgliteFactory, readPGliteDatabaseFile } from './encrypted-test-fixture.js';

runCrudSuite({
  factory: pgliteFactory,
  readDatabaseFile: readPGliteDatabaseFile,
  resolveTableName: ({ namespace, tableName }) => `"${namespace}"."${tableName}"`
});

runQueryValidationSuite({ factory: pgliteFactory });
