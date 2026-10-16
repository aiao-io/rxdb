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

// Angular 的 esbuild 不支持 PGlite 的 `new URL(..., import.meta.url)` 定位，
// 因此把 .wasm / .data 拷成静态资源后手动编译、交给适配器。
async function loadPGliteAssets() {
  const compile = async (url: string) =>
    WebAssembly.compile(await (await fetch(url)).arrayBuffer());
  const [pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
    compile('pglite/pglite.wasm'),
    compile('pglite/initdb.wasm'),
    (await fetch('pglite/pglite.data')).blob()
  ]);
  return { pgliteWasmModule, initdbWasmModule, fsBundle };
}

export function getRxdb(): RxDB {
  if (rxdb) return rxdb;
  rxdb = new RxDB({
    dbName: 'todo',
    entities: [Todo],
    // 跨 Tab 同步默认开启（multiInstance 默认为 true），两个标签页写同一份 idb:// 数据会互相推送。
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.adapter('pglite', async db =>
    new RxDBAdapterPGlite(db, { store: 'idb', ...(await loadPGliteAssets()) })
  );
  rxdb.init();
  return rxdb;
}
