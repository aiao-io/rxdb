import { runLifecycleSuite } from '@aiao/rxdb-test/encrypted';

import { waSqliteEncryptedFactory } from './wa-sqlite-factory.js';

async function readWaSqliteDatabaseFile(): Promise<Uint8Array> {
  return new Uint8Array();
}

runLifecycleSuite({
  factory: waSqliteEncryptedFactory,
  readDatabaseFile: readWaSqliteDatabaseFile
});
