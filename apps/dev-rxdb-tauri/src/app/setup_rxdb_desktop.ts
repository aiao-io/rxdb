import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import {
  createTauriHostTransport,
  RxDBAdapterTauri,
  TAURI_ADAPTER_NAME,
  type DesktopHostTransport
} from '@aiao/rxdb-adapter-tauri';
import { getDevToolsConnector } from '@aiao/rxdb-devtools';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginStorage, type RxDBStoragePluginOptions } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';
import { FileLarge, FileNode, MenuLarge, MenuSimple, Todo } from '@aiao/rxdb-test/entities';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DESKTOP_DEMO_DB_NAME } from './db-names';
import { DesktopLaunch } from './desktop-launch.entity';
import { createTauriConnectorTransport } from '../devtools/tauri-connector-transport';

/**
 * 文件内容在存储根下的子目录名（US-505）。
 *
 * @remarks
 * 物理位置是 `<AppData>/io.aiao.dev-rxdb-tauri/rxdb-files/<此值>/`：外层由 Rust 侧的
 * `storage_root()` 写死，内层由 storage 插件的 `rootDir` 决定。与 Electron demo 取同一个
 * 名字 —— 两个 demo 的磁盘布局一致，才谈得上「换掉的只是宿主」。
 */
export const DESKTOP_STORAGE_ROOT_DIR = 'files';

/**
 * 桌面文件后端的 storage 插件选项。
 *
 * @param transport - 与 Rust 宿主通信的传输层，**必须显式传入**
 * @returns 可直接交给 `rxdb.use(rxDBPluginStorage, ...)` 的选项
 *
 * @remarks
 * 单独导出是为了可测：Electron 侧写的是无参的 `createDesktopStorageFilesystem()`，
 * 照抄过来类型与编译都不会有意见，但它去读 preload 注入的全局桥接 —— Tauri 没有 preload
 * 这一层，`invoke` / `listen` 是 renderer 直接 import 的模块。故障因此不在接线处暴露，
 * 而要等到用户第一次点上传才以 `host_unavailable` 冒出来。
 */
export const createDesktopStorageOptions = (transport: DesktopHostTransport): RxDBStoragePluginOptions => ({
  rootDir: DESKTOP_STORAGE_ROOT_DIR,
  filesystem: createDesktopStorageFilesystem({ transport })
});

/**
 * 构建本 app 的 RxDB 单例（Tauri 宿主持有的应用作用域 SQLite 文件，无远端同步）。
 *
 * @returns 已 `init()` 但**尚未 `connect()`** 的 RxDB 实例；连接由 `connectRxDB` 负责
 *
 * @remarks
 * US-210：与 `setup_rxdb_wa-sqlite.ts` 同构 —— 相同实体集、同样纯本地。数据落在
 * `<AppData>/io.aiao.dev-rxdb-tauri/rxdb-data/desktop_demo@0_1.sqlite3`，
 * 一个可备份、可迁移的真实文件（AC#1）；wa-sqlite 那份落在 WebView 的 OPFS/IDB 里。
 *
 * `dbName` **刻意与浏览器预览那份不同**（US-207 E9）：两个后端对着两份永不互通的数据，
 * 同名会让「现在连的是哪个库」无从回答。
 *
 * 选路由 `setup_rxdb.ts` 的候选表 + `local-backend.ts` 的 `selectLocalBackend` 负责，
 * 本模块只在 Tauri 窗口里被调用。
 *
 * **本模块不调用 `inject()`。** 它经由动态 `import()` 加载（US-207 E11），调用点已经在
 * 至少一个 `await` 之后 —— 注入上下文那时已经离开，`inject()` 会以 NG0203 失败。
 * 浏览器运行时那道闸因此上移到 `app.config.ts` 的 `provideRxDB` 工厂里，在 `await` 之前执行；
 * 连接与拆卸则分别归 `startLocalDatabase` 与 `provideRxDB` 自己（工厂产出的实例由它负责销毁）。
 *
 * 模块级单例也一并去掉了：唯一的调用点是 `setup_rxdb.ts` 的 `localDatabase()`，
 * 那里已经把建库 Promise 记住了。两层缓存等于两个「哪个才是本 app 的实例」的答案。
 */
export default () => {
  const rxdb = new RxDB({
    dbName: DESKTOP_DEMO_DB_NAME,
    context: { userId: 'userId' },
    // `DesktopLaunch` 两个后端都要注册：AC#1 的判据是跨进程累计计数，而计数只有在
    // 表存在时才写得进去。浏览器预览那份也留着，否则同一份代码在两条路径上行为不同。
    entities: [Todo, MenuLarge, MenuSimple, FileNode, FileLarge, DesktopLaunch],
    sync: {
      local: {
        adapter: TAURI_ADAPTER_NAME
      },
      type: SyncType.None
    }
  });
  // Electron 侧的 transport 由 preload 挂在全局键上，适配器自己去取；Tauri 没有
  // preload 这一层，`invoke` / `listen` 是 renderer 直接 import 的模块，所以这里显式注入。
  // 包本身不依赖 `@tauri-apps/api`：注入点在应用里，包保持运行时无关。
  //
  // US-505：SQLite 与文件两族请求**共用这一个** transport，与 Electron 侧共用 preload
  // 那一条通道同构。各建一个也能跑，但那就是两条事件订阅、两份重连状态，
  // 而 host 侧的会话表根本不知道它们本属同一个窗口。
  const transport = createTauriHostTransport({
    invoke,
    listen,
    // 事件通道注册失败意味着响应式查询永远不刷新，在 UI 上表现为「数据没变」
    // ——所有故障形态里最难查的一种。默认行为是抛到全局，这里补一条明确的日志。
    onListenError: error => console.error('rxdb desktop change channel failed to register', error)
  });

  // US-505：文件内容也交给 Rust 宿主写成应用数据目录下的原生文件。`use()` 必须排在
  // `init()` 之前 —— 插件的 install() 是往 `config.entities` 里追加 StorageFileMeta，
  // init() 之后再追加，建表那一步早已跑完，metadata 表不会存在。
  rxdb
    .use(rxDBPluginGraph)
    .use(rxDBPluginStorage, createDesktopStorageOptions(transport))
    .adapter(TAURI_ADAPTER_NAME, async db => new RxDBAdapterTauri(db, { transport }));

  rxdb.init();

  // US-905 阶段 1：把页内 connector 接到 Tauri transport。阶段 1 只用真实 `database`
  // provider（走 v2 数据面）；native files/settings 是阶段 2 接 US-210/US-505 才给。
  const devtools = getDevToolsConnector({ transport: createTauriConnectorTransport() });
  devtools.init(rxdb, getEntityMetadata);

  return rxdb;
};
