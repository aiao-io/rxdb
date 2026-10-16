import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { checkOPFSAvailable } from '@aiao/utils';

@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
export class Todo extends EntityBase {
  title!: string;
  completed!: boolean;
}

let rxdb: RxDB | null = null;

export function getRxdb(): RxDB {
  if (rxdb) return rxdb;
  rxdb = new RxDB({
    dbName: 'todo',
    entities: [Todo],
    // 跨 Tab 同步默认开启（multiInstance 默认为 true），两个标签页写同一份 IndexedDB 数据会互相推送。
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });
  rxdb.adapter('wa-sqlite', async db => {
    let options: WaSqliteOptions;
    const available = await checkOPFSAvailable();
    if (available) {
      options = {
        vfs: 'OPFSCoopSyncVFS',
        // OPFSCoopSyncVFS 同时支持 sync 与 async，适配器无从猜测；wasmPath 指向的是
        // 同步产物 wa-sqlite.wasm，必须显式声明 sync 模式，否则会加载 asyncify glue 配同步 wasm。
        async: false,
        worker: true,
        workerInstance: new Worker(new URL('./wa-sqlite.worker', import.meta.url), {
          type: 'module',
          name: 'rxdb-wa-sqlite-worker'
        }),
        workerOwnership: 'client',
        wasmPath: 'wa-sqlite/wa-sqlite.wasm'
      };
    } else {
      options = {
        vfs: 'IDBBatchAtomicVFS',
        sharedWorker: true,
        sharedWorkerInstance: new SharedWorker(new URL('./wa-sqlite-shared.worker', import.meta.url), {
          type: 'module',
          name: 'rxdb-wa-sqlite-shared-worker'
        }),
        workerOwnership: 'client',
        wasmPath: 'wa-sqlite/wa-sqlite-async.wasm'
      };
    }
    return new RxDBAdapterWaSqlite(db, options);
  });
  rxdb.init();
  return rxdb;
}
