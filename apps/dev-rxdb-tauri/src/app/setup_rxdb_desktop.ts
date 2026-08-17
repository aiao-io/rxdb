import { RxDB, SyncType } from '@aiao/rxdb';
import {
  createTauriHostTransport,
  DESKTOP_ADAPTER_NAME,
  type DesktopHostTransport,
  RxDBAdapterDesktop
} from '@aiao/rxdb-adapter-desktop';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginStorage, type RxDBStoragePluginOptions } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';
import { FileLarge, FileNode, MenuLarge, MenuSimple, Todo } from '@aiao/rxdb-test/entities';
import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DesktopLaunch } from './desktop-launch.entity';

let rxdb: RxDB | null | undefined;

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
 * @throws 运行在非浏览器运行时（SSR）时抛出
 *
 * @remarks
 * US-210：与 `setup_rxdb_wa-sqlite.ts` 同构 —— 相同实体集、相同 `dbName`、同样纯本地。
 * 唯一的差别是数据落在哪：wa-sqlite 落在 WebView 的 OPFS/IDB 里，这里落在
 * `<AppData>/io.aiao.dev-rxdb-tauri/rxdb-data/test_6@0_1.sqlite3`，一个可备份、可迁移的真实文件（AC#1）。
 *
 * 选路由 `setup_rxdb.ts` 的 `selectLocalBackend` 负责，本模块只在 Tauri 窗口里被调用。
 *
 * 必须在注入上下文中调用（读 `PLATFORM_ID`）。实例按模块作用域缓存，重复调用返回同一个。
 */
export default () => {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  if (!isBrowser) throw new Error('dev-rxdb-tauri requires a browser runtime');

  if (rxdb) return rxdb;
  rxdb = new RxDB({
    dbName: 'test_6',
    context: { userId: 'userId' },
    // `DesktopLaunch` 两个后端都要注册：AC#1 的判据是跨进程累计计数，而计数只有在
    // 表存在时才写得进去。浏览器预览那份也留着，否则同一份代码在两条路径上行为不同。
    entities: [Todo, MenuLarge, MenuSimple, FileNode, FileLarge, DesktopLaunch],
    sync: {
      local: {
        adapter: DESKTOP_ADAPTER_NAME
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
    .adapter(DESKTOP_ADAPTER_NAME, async db => new RxDBAdapterDesktop(db, { transport, runtime: 'tauri' }));

  rxdb.init();
  return rxdb;
};
