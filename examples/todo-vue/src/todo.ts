import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import waSqliteAsync from 'wa-sqlite/dist/wa-sqlite-async.wasm?url';

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
  // IDBBatchAtomicVFS（默认）持久化到 IndexedDB、主线程运行；wasmPath 指向 async 构建。
  rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { wasmPath: waSqliteAsync }));
  rxdb.init();
  return rxdb;
}
