import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { Todo } from '@aiao/rxdb-test/entities';
import { checkOPFSAvailable } from '@aiao/utils';
import { APP_BASE_HREF, isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';

let rxdb: RxDB | null | undefined;

export default () => {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  if (!isBrowser) throw new Error('setup_rxdb requires a browser runtime (OPFS/Worker)');

  const baseHref = inject(APP_BASE_HREF);

  if (rxdb) return rxdb;
  rxdb = new RxDB({
    dbName: 'test5',
    context: { userId: 'userId' },
    entities: [Todo],
    sync: {
      local: {
        adapter: 'wa-sqlite',
      },
      type: SyncType.None,
    },
  });
  rxdb.adapter('wa-sqlite', async (db) => {
    let options: WaSqliteOptions;
    const available = await checkOPFSAvailable();
    if (available) {
      options = {
        vfs: 'OPFSCoopSyncVFS',
        worker: true,
        workerInstance: new Worker(new URL('./sqlite.worker', import.meta.url), {
          type: 'module',
          name: 'rxdb-worker',
        }),
        wasmPath: `${baseHref}wa-sqlite/wa-sqlite.wasm`,
      };
    } else {
      options = {
        vfs: 'IDBBatchAtomicVFS',
        sharedWorker: true,
        sharedWorkerInstance: new SharedWorker(new URL('./sqlite-shared.worker', import.meta.url), {
          type: 'module',
          name: 'rxdb-shared-worker',
        }),
        wasmPath: `${baseHref}wa-sqlite/wa-sqlite-async.wasm`,
      };
    }
    return new RxDBAdapterWaSqlite(db, options);
  });

  rxdb.init();

  return rxdb;
};
