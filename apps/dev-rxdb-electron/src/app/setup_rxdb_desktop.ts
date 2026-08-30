import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { ELECTRON_ADAPTER_NAME, RxDBAdapterElectron } from '@aiao/rxdb-adapter-electron';
import {
  createDevToolsElectronSettingsProvider,
  DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT,
  getDevToolsConnector
} from '@aiao/rxdb-devtools';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';
import { createDevToolsDesktopFilesystem } from '@aiao/rxdb-plugin-storage/devtools-desktop';
import { FileLarge, FileNode, MenuLarge, MenuSimple, Todo } from '@aiao/rxdb-test/entities';
import { DESKTOP_DEMO_DB_NAME } from './db-names';
import { DesktopLaunch } from './desktop-launch.entity';

/**
 * 文件内容在存储根下的子目录名（US-504）。
 *
 * @remarks
 * 物理位置是 `userData/rxdb-files/<此值>/`：外层由主进程的 `DESKTOP_STORAGE_DIRECTORY`
 * 决定，内层由 storage 插件的 `rootDir` 决定。显式写出而不吃插件默认值 ——
 * e2e 要按这个路径去磁盘上核对字节，默认值一旦变动，那边只会看到「文件不见了」。
 *
 * 与 Tauri demo 的同名常量取值一致：两个 demo 的磁盘布局对得上，差别才真的只剩宿主。
 */
export const DESKTOP_STORAGE_ROOT_DIR = 'files';

/**
 * 构建本 app 的 RxDB 单例（主进程持有的应用作用域 SQLite 文件，无远端同步）。
 *
 * @returns 已 `init()` 但**尚未 `connect()`** 的 RxDB 实例；连接由 `LocalDatabaseService` 负责
 *
 * @remarks
 * US-207：与 `setup_rxdb_wa-sqlite.ts` 同构 —— 相同实体集、同样纯本地。数据落在
 * `userData/rxdb-data/desktop_demo@0_1.sqlite3`，一个可备份、可迁移的真实文件（AC#1）；
 * wa-sqlite 那份落在渲染进程的 OPFS/IDB 里。
 *
 * 选路由 `setup_rxdb.ts` 的候选表 + `local-backend.ts` 的 `selectLocalBackend` 负责，
 * 本模块只在 preload 注入过桥接的窗口里被 `import()`。
 *
 * **本模块不调用 `inject()`。** 它经由动态 `import()` 加载（US-207 E11），调用点已经在
 * 至少一个 `await` 之后 —— 注入上下文那时已经离开，`inject()` 会以 NG0203 失败。
 * 浏览器运行时这道闸因此上移到 `app.config.ts` 的 `provideRxDB` 工厂里，在 `await` 之前执行。
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
        adapter: ELECTRON_ADAPTER_NAME
      },
      type: SyncType.None
    }
  });

  // US-504：文件内容也交给主进程写成原生文件。`use()` 必须排在 `init()` 之前 ——
  // 插件的 install() 是往 `config.entities` 里追加 StorageFileMeta，init() 之后再追加，
  // 建表那一步早已跑完，metadata 表不会存在。
  //
  // US-207 E10：storage 后端**不自己探测运行时**，跟着同一次判定走 —— 它在这里出现，
  // 只因为这个模块本身就是「桌面候选被选中」的产物。插件那边还有一道
  // `adapter_mismatch` 兜底（见 `createDesktopStorageFilesystem` 的 TSDoc）：
  // `sync.local.adapter` 不是桌面适配器时直接拒绝启用，而不是降级回 OPFS。
  // 那条错误码沿用现成的，不新造。
  //
  // 不传 transport：桌面后端与适配器共用 preload 暴露的那一条通道，不新增 preload 方法。
  rxdb
    .use(rxDBPluginGraph)
    .use(rxDBPluginStorage, {
      rootDir: DESKTOP_STORAGE_ROOT_DIR,
      filesystem: createDesktopStorageFilesystem()
    })
    // 同样不传 transport：适配器自己去全局键上找 preload 暴露的桥接，
    // 渲染进程因此拿不到、也不需要知道库文件的物理路径（AC#3）。
    .adapter(ELECTRON_ADAPTER_NAME, async db => new RxDBAdapterElectron(db));

  rxdb.init();

  // US-904 阶段 D：把页内 connector 接到原生后端。`files` 走桌面 host（native-files），
  // `settings` 是 Electron `sqlite` 语义，`database` 的 descriptor 显示为 `electron`。
  // 文件系统与 storage 插件共用同一个 `rootDir`，看到的才是同一批文件。
  const devtools = getDevToolsConnector({
    providers: {
      nativeFiles: {
        filesystem: createDevToolsDesktopFilesystem({ rootDir: DESKTOP_STORAGE_ROOT_DIR }),
        maxTransferBytes: DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT
      },
      settings: createDevToolsElectronSettingsProvider(),
      runtime: 'electron'
    }
  });
  devtools.init(rxdb, getEntityMetadata);

  return rxdb;
};
