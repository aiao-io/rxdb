import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite, SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { getE2eDbName } from '@aiao/rxdb-test';

import { ENTITIES } from '../entities/asset-entities';

let rxdb: RxDB | null | undefined;
const DEFAULT_DB_NAME = 'admin-workbench';

export default (): RxDB => {
  if (rxdb) return rxdb;
  const dbName = getE2eDbName(DEFAULT_DB_NAME);
  rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities: [...ENTITIES],
    sync: {
      local: {
        adapter: 'sqlite-wasm'
      },
      type: SyncType.None
    }
  });
  rxdb
    .use(rxDBPluginHistory)
    .use(rxDBPluginSearch, { debounce: 300, pageSize: 20, snippetLength: 64 })
    .adapter('sqlite-wasm', db => {
      const options: SqliteOptions = {
        // 主线程 + IndexedDB：同时满足两个硬约束——
        // US-527 备份/恢复矩阵里浏览器可备份的组合（OPFS 与 worker transport 都报
        // unsupported_combination）；以及 FTS5 全文搜索（sqlite-wasm 构建自带 FTS5，
        // wa-sqlite 的固定 wasm 未开 SQLITE_ENABLE_FTS5）。
        vfs: 'idb'
      };
      return new RxDBAdapterSqlite(db, options);
    });
  rxdb.init();
  const devtools = getDevToolsConnector();
  devtools.init(rxdb, getEntityMetadata);
  return rxdb;
};
