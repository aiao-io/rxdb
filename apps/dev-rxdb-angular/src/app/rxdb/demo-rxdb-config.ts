import { EntityType, RxDB, RxDBOptions, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite, SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { SqliteGraphRepository } from '@aiao/rxdb-plugin-graph/sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';
import { rxDBPluginWorkspace } from '@aiao/rxdb-plugin-workspace';
import { EncryptedUser } from '@aiao/rxdb-test/encrypted';
import { ENTITIES } from '@aiao/rxdb-test/entities';
import { ENTITIES as shop_entities } from '@aiao/rxdb-test/shop';
import { cloneEntityClasses } from '@aiao/rxdb/testing';
import { GRAPH_REPOSITORY_NAME, withSqliteWasmRepository } from './sqlite-wasm-repositories';

// dev 应用与失败现场的第二连接、导入入口共用这一份配置：归档的结构指纹由实体列表算出，
// `connect()` 在既有库上还会校验库里记过迁移的系统能力，两边配置一漂，归档就导不回来。

/** demo 的全部实体：通用测试实体 + 商城实体 + 加密实体。 */
export const DEMO_ENTITIES: readonly EntityType[] = [...ENTITIES, ...shop_entities, EncryptedUser];

/** demo 搜索插件配置。 */
export const SEARCH_PLUGIN_CONFIG = { debounce: 300, pageSize: 20, snippetLength: 64 } as const;

/** demo 的 RxDB adapter 名。 */
export const DEMO_ADAPTER_NAME = 'sqlite-wasm' as const;

/**
 * wa-sqlite 的 wasm 地址：OPFS 用同步构建，IDB 用 async 构建。
 *
 * @param baseHref - 应用的 `APP_BASE_HREF`
 * @param vfs - 存储后端
 * @returns wasm 文件 URL
 */
export function getSqliteWasmUrl(baseHref: string, vfs: 'opfs' | 'idb'): string {
  return vfs === 'opfs' ? `${baseHref}sqlite-wasm/wa-sqlite.wasm` : `${baseHref}sqlite-wasm/wa-sqlite-async.wasm`;
}

/**
 * demo 的 RxDB 构造参数。
 *
 * @param dbName - 原始库名（RxDB 自己追加 `@<后缀>`）
 * @param entities - 实体列表；同一页面里的第二个实例要传克隆的实体类
 * @returns 构造参数
 */
export function demoRxDBOptions(dbName: string, entities: readonly EntityType[] = DEMO_ENTITIES): RxDBOptions {
  return {
    dbName,
    context: { userId: 'userId' },
    entities: [...entities],
    sync: {
      local: {
        adapter: DEMO_ADAPTER_NAME
      },
      type: SyncType.None
    }
  };
}

/**
 * 给 demo 的 RxDB 实例装上插件链与 `sqlite-wasm` adapter。
 *
 * @param rxdb - 尚未 `init()` 的实例
 * @param createOptions - adapter 首次被取用时调用，返回存储参数（graph 仓库由这里注入）
 * @returns 同一个实例
 */
export function useDemoPlugins(rxdb: RxDB, createOptions: () => Promise<SqliteOptions>): RxDB {
  rxdb
    .use(rxDBPluginGraph)
    .use(rxDBPluginHistory)
    .use(rxDBPluginStorage)
    .use(rxDBPluginTree)
    .use(rxDBPluginWorkspace)
    // 只装不手动启用：`workingTree.enable()` 是数据库级的一次性开关（v1 无 `disable()`），
    // 按在这里等于替所有 demo 页做了这个决定。空库由启动时的 `enableIfEmpty()` 自动启用
    // （见 setup 里 `rxdb.init()` 之后那一行）；有内容的库保持未启用，启用走 /working-tree 面板的显式点击。
    .use(rxDBPluginWorkingTree)
    .adapter(
      DEMO_ADAPTER_NAME,
      async db =>
        new RxDBAdapterSqlite(
          db,
          withSqliteWasmRepository(await createOptions(), GRAPH_REPOSITORY_NAME, SqliteGraphRepository)
        )
    );
  rxdb.use(rxDBPluginSearch, SEARCH_PLUGIN_CONFIG);
  return rxdb;
}

/**
 * 主线程 IDB 存储参数：不设 worker，`backup()` / `restore()` 只在这种连接上可用（US-217）。
 *
 * @param baseHref - 应用的 `APP_BASE_HREF`
 * @returns 存储参数
 */
export function mainThreadIdbOptions(baseHref: string): SqliteOptions {
  return { vfs: 'idb', wasmUrl: getSqliteWasmUrl(baseHref, 'idb') };
}

/**
 * 同一页面里与 dev 应用同配置的第二个 RxDB 实例，走主线程 IDB 连接。
 *
 * @remarks
 * 实体类是模块单例，一个类只能绑定一个 RxDB 实例，所以这里用克隆的实体类；`multiInstance: false`
 * 不与主实例互发跨标签页事件。返回的实例已 `init()`，尚未 `connect()`：失败现场归档在 `connect()` 后
 * 调 `backup()`，导入在 `connect()` 前调 `restore()`。用完由调用方 `destroy()`。
 *
 * @param dbName - 原始库名
 * @param baseHref - 应用的 `APP_BASE_HREF`
 * @returns 已初始化的实例
 */
export function createMainThreadIdbRxDB(dbName: string, baseHref: string): RxDB {
  const rxdb = new RxDB({
    ...demoRxDBOptions(dbName, cloneEntityClasses([...DEMO_ENTITIES])),
    multiInstance: false
  });
  useDemoPlugins(rxdb, async () => mainThreadIdbOptions(baseHref));
  rxdb.init();
  return rxdb;
}
