import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import {
  createTauriHostTransport,
  RxDBAdapterTauri,
  TAURI_ADAPTER_NAME,
  type DesktopHostTransport
} from '@aiao/rxdb-adapter-tauri';
import {
  createDevToolsDesktopSettingsProvider,
  createDevToolsNativeSnapshotSource,
  createSystemClock,
  DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT,
  getDevToolsConnector,
  type DevToolsCapability,
  type DevToolsMutationPolicy,
  type DevToolsSnapshotSource
} from '@aiao/rxdb-devtools';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginStorage, type RxDBStoragePluginOptions } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';
import { createDevToolsDesktopFilesystem } from '@aiao/rxdb-plugin-storage/devtools-desktop';
import {
  createDevToolsStorageSnapshotPorts,
  type DevToolsStorageSnapshotPorts
} from '@aiao/rxdb-plugin-storage/devtools-desktop-snapshot';
import { FileLarge, FileNode, MenuLarge, MenuSimple, Todo } from '@aiao/rxdb-test/entities';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createTauriConnectorTransport } from '../devtools/tauri-connector-transport';
import { DESKTOP_DEMO_DB_NAME } from './db-names';
import { DesktopLaunch } from './desktop-launch.entity';

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
 * 挂载键，与 Rust 侧 `devtools_config.rs` 的 `CONFIG_GLOBAL_KEY` 逐字一致。
 *
 * @remarks
 * 页面与 Rust 分属两条工具链，这里只能写字面量；由 `devtools-runtime-config.spec.ts`
 * 的一条用例读 Rust 源码把两处钉在一起。Electron 侧同名同值，页内读法因此两端一致。
 */
export const DEVTOOLS_RUNTIME_CONFIG_KEY = '__aiaoRxdbDevToolsConfig__';

/**
 * 读取本次运行的 DevTools 授权配置。
 *
 * @returns Rust 侧注入脚本带进来的档位与写入开关；没有（release、或没开开发态 DevTools）时为空对象。
 *
 * @remarks
 * 返回空对象而不是一份默认值，是为了让调用点能用展开语法把「没有配置」表达成
 * **完全不传这两个键**，交给库自己的默认值——而不是在这里复制一份可能与库不同步的默认档。
 *
 * 值必须在**页面脚本之前**就位：`getDevToolsConnector()` 是一次性全局单例，首次调用即定档。
 * 所以它由 Tauri 插件的 `js_init_script` 注入，而不是一次 `invoke`——异步 IPC 会留下一段
 * 「按默认档已经可用」的授权空窗。
 */
export function devToolsRuntimeConfig(): {
  capabilities?: DevToolsCapability;
  mutationPolicy?: DevToolsMutationPolicy;
} {
  const config = (globalThis as Record<string, unknown>)[DEVTOOLS_RUNTIME_CONFIG_KEY] as
    | { capability: DevToolsCapability; mutationPolicy: DevToolsMutationPolicy }
    | undefined;
  return config === undefined ? {} : { capabilities: config.capability, mutationPolicy: config.mutationPolicy };
}

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

/** {@link createDesktopDevToolsProviders} 的入参。 */
export interface DesktopDevToolsProvidersOptions {
  /**
   * 与 Rust 宿主通信的传输层，**必须显式传入**。
   *
   * @remarks
   * 而且必须是适配器与 storage 插件用的**同一个实例**：三者共用一条通道，host 侧的会话表
   * 才知道它们同属一个窗口，窗口销毁时才回收得干净。
   */
  readonly transport: DesktopHostTransport;
  /**
   * 取文件存储服务；**延迟调用**。
   *
   * @remarks
   * 传函数而不是实例：`rxdb.storage` 要等 `connect()` 才挂上，而 connector 在 `init()` 时
   * 就已经装配好了。这里先读一次存起来的话，快照拿到的是一个还没连上的 storage。
   */
  readonly getStorage: () => DevToolsStorageSnapshotPorts['storage'];
}

/**
 * 装配 Tauri 桌面端的 DevTools provider 端口（US-905 阶段 2）。
 *
 * @param options - 共享 transport 与延迟取 storage 的入口
 * @returns 可直接交给 `getDevToolsConnector({ providers })` 的端口集
 *
 * @remarks
 * 与 Electron 侧（`apps/dev-rxdb-electron/src/app/setup_rxdb_desktop.ts`）同构：`files` 走
 * US-505 的桌面 host（`kind: 'native-files'`），`settings` 是 `sqlite` 语义，三个领域的
 * descriptor 都显示 `runtime: 'tauri'`（AC#10）。共享包一行没复制——两端用的是同一个
 * `createDevToolsDesktopFilesystem` / `createDevToolsNativeSnapshotSource`。
 *
 * 与 Electron 的两处差别，都是 Tauri 的结构性事实：
 *
 * 1. **transport 必须显式传**。Electron 的桌面 host 桥接挂在 preload 的全局键上，省略即可；
 *    Tauri 没有 preload 那一层，省略只会在用户第一次点上传时得到 `host_unavailable`。
 * 2. **要自己接 `pagehide → dispose()`**（AC#14）。主窗口**刷新**不触发 Rust 的
 *    `WindowEvent::Destroyed`，host 因此不回收，每刷一次泄一条 host 文件会话——连同它的
 *    挂起写入与锁，而一把没放掉的独占锁会让后来者的 `lockAcquire` 永远等下去。用
 *    `pagehide` 而不是 `beforeunload`：后者在 WKWebView 上不可靠。`dispose()` 幂等。
 *
 * 单独导出是为了可测：装配点在 `default` 里要先建一个真 RxDB 才够得着，而这里要验的
 * 三件事（走的是注入的 transport、runtime 三处一致、刷新时释放会话）与 RxDB 无关。
 */
export const createDesktopDevToolsProviders = (options: DesktopDevToolsProvidersOptions) => {
  const filesystem = createDevToolsDesktopFilesystem({
    // 与 storage 插件同一个常量：两边看到的必须是同一批文件，而不是同名的两个目录。
    rootDir: DESKTOP_STORAGE_ROOT_DIR,
    transport: options.transport
  });

  // AC#11：诊断快照的物化来源。复用 storage 自己的独占锁，metadata 与已提交文件两半
  // 因此落在同一个时点。
  const snapshot: DevToolsSnapshotSource = {
    capture: signal =>
      createDevToolsNativeSnapshotSource(
        createDevToolsStorageSnapshotPorts({ storage: options.getStorage(), filesystem })
      ).capture(signal)
  };

  globalThis.addEventListener('pagehide', () => filesystem.dispose(), { once: true });

  return {
    nativeFiles: {
      filesystem,
      // 与 Electron 同值：两端走的是同一份桌面 host 协议，没有理由各定一个上限。
      maxTransferBytes: DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT,
      snapshot: { clock: createSystemClock(), source: snapshot }
    },
    settings: createDevToolsDesktopSettingsProvider('tauri'),
    runtime: 'tauri' as const
  };
};

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

  // US-905 阶段 2：把页内 connector 接到 Tauri transport 与**真实**原生后端。
  // 授权档（capability / mutationPolicy）由 Rust 侧的注入脚本在页面脚本之前放好，
  // 展开进来即可 —— 缺省时是空对象，交回库默认档。
  const devtools = getDevToolsConnector({
    ...devToolsRuntimeConfig(),
    transport: createTauriConnectorTransport(),
    // storage 延迟取：`rxdb.storage` 要等 `connect()` 才挂上，而这里还在 `init()` 之后一步。
    providers: createDesktopDevToolsProviders({ transport, getStorage: () => rxdb.storage })
  });
  devtools.init(rxdb, getEntityMetadata);

  return rxdb;
};
