import { runBigIntBinaryEncryptedSuite } from '@aiao/rxdb-test/encrypted';

import { sqliteaiEncryptedFactory } from './sqliteai-factory.js';

runBigIntBinaryEncryptedSuite({ factory: sqliteaiEncryptedFactory });
