import { runBigIntBinaryEncryptedSuite } from '@aiao/rxdb-test/encrypted';

import { sqliteWasmEncryptedFactory } from './sqlite-wasm-factory.js';

runBigIntBinaryEncryptedSuite({ factory: sqliteWasmEncryptedFactory });
