import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import type { SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { getE2eDbName } from '@aiao/rxdb-test';
import { appConfig, type AppConfig } from '../app-config';

import { ENTITIES } from '../entities/asset-entities';
import { workbenchShell } from '../shell/workbench-shell';
import { workbenchActivityIndex } from './workbench-activity-index';

/**
 * 匿名本机上下文的用户标识，写入数据库 `context.userId`。
 *
 * @remarks
 * 取值必须保持 `'userId'`：已有本机库里的审计字段（`createdBy` / `updatedBy`）及其进入的历史与活动记录
 * 都以它归属，改值会让这些记录脱离当前身份。它只代表本机匿名身份；团队协作的云端身份来自协作包的
 * 真实会话（ADMIN-US-201 AC#9），接入真实身份时不得复用此常量。
 */
export const ANONYMOUS_LOCAL_USER_ID = 'userId';

let rxdb: RxDB | undefined;

/** 按应用配置创建数据库，保留工作台的存储与插件组合。 */
export function createWorkbenchDatabase(config: AppConfig = appConfig): RxDB {
  const dbName = getE2eDbName(config.dbName);
  const database = new RxDB({
    dbName,
    context: { userId: ANONYMOUS_LOCAL_USER_ID },
    entities: [...ENTITIES],
    sync: {
      local: {
        adapter: 'sqlite-wasm'
      },
      type: SyncType.None
    }
  });
  database
    .use(rxDBPluginHistory)
    .use(workbenchActivityIndex)
    .use(rxDBPluginSearch, { debounce: 300, pageSize: 20, snippetLength: 64 })
    .adapter('sqlite-wasm', async db => {
      const { RxDBAdapterSqlite } = await import('@aiao/rxdb-adapter-sqlite-wasm');
      const options: SqliteOptions = {
        // 主线程 + IndexedDB：同时满足两个硬约束——
        // US-527 备份/恢复矩阵里浏览器可备份的组合（OPFS 与 worker transport 都报
        // unsupported_combination）；以及 FTS5 全文搜索（sqlite-wasm 构建自带 FTS5，
        // wa-sqlite 的固定 wasm 未开 SQLITE_ENABLE_FTS5）。
        vfs: 'idb',
        wasmUrl: new URL('sqlite-wasm/wa-sqlite-async.wasm', globalThis.document?.baseURI ?? 'http://localhost/').href
      };
      return new RxDBAdapterSqlite(db, options);
    });
  database.init();
  return database;
}

export default (): RxDB => {
  if (rxdb) return rxdb;
  rxdb = createWorkbenchDatabase();
  if (import.meta.env.DEV) {
    // 在同步作用域保存实例，供异步开发工具回调使用。
    const instance = rxdb;
    void import('@aiao/rxdb-devtools').then(({ getDevToolsConnector }) => {
      const devtools = getDevToolsConnector();
      devtools.init(instance, getEntityMetadata, { i18n: workbenchShell.i18n });
    });
  }
  return rxdb;
};
