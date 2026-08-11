import { runBigIntBinaryEncryptedSuite } from '@aiao/rxdb-test/encrypted';

import { sqliteOfficialEncryptedFactory } from './sqlite-official-factory.js';

runBigIntBinaryEncryptedSuite({ factory: sqliteOfficialEncryptedFactory });
