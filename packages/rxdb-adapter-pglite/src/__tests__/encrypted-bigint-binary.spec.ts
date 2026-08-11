import { runBigIntBinaryEncryptedSuite } from '@aiao/rxdb-test/encrypted';

import { pgliteFactory } from './encrypted-test-fixture.js';

runBigIntBinaryEncryptedSuite({
  factory: pgliteFactory,
  resolveTableName: ({ namespace, tableName }) => `"${namespace}"."${tableName}"`
});
