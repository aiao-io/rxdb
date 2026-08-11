import { runTamperSuite } from '@aiao/rxdb-test/encrypted';

import { waSqliteEncryptedFactory } from './wa-sqlite-factory.js';

/**
 * wa-sqlite 的篡改套件没有单独的文件转储——套件直接使用
 * `adapter.query(...)` 读写原始信封单元。这里仍传入 stub，以满足共享选项结构。
 */
async function readWaSqliteDatabaseFile(): Promise<Uint8Array> {
  return new Uint8Array();
}

runTamperSuite({
  factory: waSqliteEncryptedFactory,
  readDatabaseFile: readWaSqliteDatabaseFile
});
