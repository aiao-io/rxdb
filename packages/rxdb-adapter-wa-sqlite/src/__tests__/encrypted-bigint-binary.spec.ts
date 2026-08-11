import { runBigIntBinaryEncryptedSuite } from '@aiao/rxdb-test/encrypted';

import { waSqliteEncryptedFactory } from './wa-sqlite-factory.js';

runBigIntBinaryEncryptedSuite({ factory: waSqliteEncryptedFactory });
