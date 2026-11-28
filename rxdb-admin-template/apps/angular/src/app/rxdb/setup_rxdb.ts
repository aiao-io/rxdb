import { getEntityMetadata, getRxDBIdentityDatabaseName, RxDB, SyncType, type RxDBIdentity } from '@aiao/rxdb';
import type { SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { authSession } from '@rxdb-admin-template/collaboration/auth';
import { appConfig, type AppConfig } from '../app-config';

import { ENTITIES } from '../entities/asset-entities';
import { workbenchShell } from '../shell/workbench-shell';
import { workbenchActivityIndex } from './workbench-activity-index';

/**
 * 本机工作台库的审计用户标识，写入数据库 `context.userId`。
 *
 * @remarks
 * 取值保持 `'userId'`：本机库里的审计字段（`createdBy` / `updatedBy`）及其进入的历史与活动记录都以它归属。
 * 工作台库已按账号分开（ADMIN-US-222），库归谁由库本身的身份表达，审计字段不再承担区分账号的职责（owner 2026-11-28 定）。
 * 团队协作的云端身份来自协作包的真实会话（ADMIN-US-201 AC#9），接入真实身份时不得复用此常量。
 */
export const ANONYMOUS_LOCAL_USER_ID = 'userId';

/**
 * 自动化测试里存工作台库基础名的 sessionStorage 键。沿用原来存隔离库名的键：既有用例按它在另一个页面重开同一个库。
 */
export const E2E_DATABASE_BASE_KEY = '__aiao_e2e_db_name__';

/**
 * 工作台库名的基础名：按身份派生库名之前的那一段（ADMIN-US-222）。
 *
 * @param config - 应用配置
 * @returns 平常就是配置的库名；自动化测试（`navigator.webdriver`）里是这个浏览器上下文的短基础名
 *
 * @remarks
 * 自动化测试里每个浏览器上下文换一个基础名，存在 sessionStorage：用例之间不共库，同一个上下文刷新、
 * 在另一个页面带着同一个值重开仍是同一个库。基础名要短：sqlite-wasm 的 IndexedDB 文件系统里库名至多 41 字节
 * （见协作包的 `teamDatabaseName`），按身份派生还要再加 17 字节。
 */
export function workbenchBaseName(config: AppConfig): string {
  if (!navigator.webdriver) return config.dbName;
  const existing = sessionStorage.getItem(E2E_DATABASE_BASE_KEY);
  if (existing) return existing;
  const base = `aw-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  sessionStorage.setItem(E2E_DATABASE_BASE_KEY, base);
  return base;
}

let rxdb: RxDB | undefined;

/**
 * 按应用配置与账号身份创建工作台库，保留工作台的存储与插件组合：每个账号一个本机库（ADMIN-US-222）。
 *
 * @param config - 应用配置
 * @param identity - 账号的本机库身份，默认取全局会话本机记下的那一份（首屏之前就要建库，这时还没联网确认）
 * @returns 尚未连接的数据库
 *
 * @remarks
 * 库名由身份派生（`getRxDBIdentityDatabaseName`），库也按这份身份绑定：换了账号就是另一个库，打开别人的库会报身份不匹配。
 * 没有身份（从没登录过、已退出）时建一个不注册本地适配器的占位实例：登录页不用库，登录门禁之外也没有页面会连库，
 * 谁误连它都会当场报错，碰不到任何本机数据。登录之前设备共用的旧库（库名就是配置的库名）不再打开（owner 2026-11-28 定）。
 */
export function createWorkbenchDatabase(
  config: AppConfig = appConfig,
  identity: RxDBIdentity | null = authSession().databaseIdentity()
): RxDB {
  const database = new RxDB({
    dbName: identity ? getRxDBIdentityDatabaseName(workbenchBaseName(config), identity) : `${config.dbName}-signed-out`,
    ...(identity ? { identity } : {}),
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
    .use(rxDBPluginSearch, { debounce: 300, pageSize: 20, snippetLength: 64 });
  if (identity)
    database.adapter('sqlite-wasm', async db => {
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
