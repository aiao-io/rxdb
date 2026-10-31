import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

let connectedDevToolsDb: RxDB | null = null;

/** 把 DevTools 连接器切到当前活动看板；备份与清理临时库不经过这里。 */
export const connectBoardDevTools = (db: RxDB): void => {
  if (connectedDevToolsDb === db) return;
  const connector = getDevToolsConnector();
  if (connectedDevToolsDb !== null) connector.disconnect();
  connector.init(db, getEntityMetadata);
  connectedDevToolsDb = db;
};

/**
 * 看板实例工厂（US-537 首轮支持组合）：sqlite-wasm 主线程 `vfs: 'idb'`，库名由外壳分配；
 * 归档只恢复到同 adapter、未连接的新库名，恢复编排在 `BoardShellController`。
 */
export const createBoardRxdb = (dbName: string): RxDB => {
  const db = new RxDB({
    dbName,
    entities: [Board, Column, Task, BoardLabel, TaskLabel],
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  });
  // 搜索插件自阶段 A 起安装并维护索引（schema 一次到位）
  db.use(rxDBPluginHistory);
  db.use(rxDBPluginSearch);
  db.adapter(
    'sqlite-wasm',
    () => new RxDBAdapterSqlite(db, { vfs: 'idb', wasmUrl: `${document.baseURI}sqlite-wasm/wa-sqlite-async.wasm` })
  );
  return db;
};
