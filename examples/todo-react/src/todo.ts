import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';

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
    // 跨 Tab 同步默认开启（multiInstance 默认为 true），两个标签页写同一份 idb:// 数据会互相推送。
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'idb' }));
  rxdb.init();
  return rxdb;
}
