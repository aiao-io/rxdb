import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, SqliteRepository, type WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { BOM_ENTITIES, rxDBPluginBom } from '@aiao/rxdb-plugin-bom';

export const createBomDatabase = (databaseName: string): RxDB => {
  const rxdb = new RxDB({
    dbName: databaseName,
    entities: [...BOM_ENTITIES],
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });
  rxdb.use(rxDBPluginBom);
  rxdb.adapter(
    'wa-sqlite',
    db =>
      new RxDBAdapterWaSqlite(db, {
        vfs: 'IDBBatchAtomicVFS',
        async: true,
        worker: false,
        wasmPath: '/wa-sqlite/wa-sqlite-async.wasm',
        batchTimeout: 1,
        repositories: { BomRepository: SqliteRepository } as unknown as WaSqliteOptions['repositories']
      })
  );
  return rxdb;
};
