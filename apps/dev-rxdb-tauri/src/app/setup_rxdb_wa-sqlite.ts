import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { getDevToolsConnector, resolveBrowserOpfsRoot } from '@aiao/rxdb-devtools';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginStorage, type RxDBStoragePluginOptions } from '@aiao/rxdb-plugin-storage';
import { FileLarge, FileNode, MenuLarge, MenuSimple, Todo } from '@aiao/rxdb-test/entities';
import { checkOPFSAvailable } from '@aiao/utils';
import { createWaSqliteDevToolsPorts } from '../devtools/tauri-vfs-providers';
import { WEB_PREVIEW_DB_NAME } from './db-names';
import { DesktopLaunch } from './desktop-launch.entity';
import type { DevToolsForcedVfs } from './devtools-runtime-config';
import { isTauriRuntime } from './services/tauri-environment';
import { resolveWaSqliteBackend, resolveWaSqliteIdbTransport, type WaSqliteBackend } from './wa-sqlite-backend';

/**
 * 构建本 app 的 RxDB 单例（纯本地 wa-sqlite，无远端同步）。
 *
 * @param forced - US-905 AC#6 的 VFS 强制档；`undefined` 时按运行时能力探测
 * @returns 已 `init()` 但**尚未 `connect()`** 的 RxDB 实例；连接由 `connectRxDB` 负责
 *
 * @remarks
 * 这条分支只在**非** Tauri 运行时被选中 —— 也就是 `nx serve dev-rxdb-tauri` 直接开浏览器
 * 预览的场景。打包后的 Tauri 窗口一律走 `setup_rxdb_desktop.ts`。
 *
 * 唯一的例外是 VFS 强制档（US-905 AC#6 三态实测）：强制档让 wa-sqlite 候选在 Tauri 窗口里
 * 也胜出（见 `setup_rxdb.ts` 的候选表），本模块因此会带着 `forced` 被建库 —— 后端判定
 * 直接映射强制档、跳过探测，devtools 挂接则按真实运行时上报。
 *
 * **本模块不调用 `inject()`。** 它经由动态 `import()` 加载（US-207 E11），调用点已经在
 * 至少一个 `await` 之后 —— 注入上下文那时已经离开，`inject()` 会以 NG0203 失败。
 * 浏览器运行时那道闸因此上移到 `app.config.ts` 的 `provideRxDB` 工厂里，在 `await` 之前执行。
 *
 * wasm 路径随之从 `APP_BASE_HREF` 改为相对 `document.baseURI` 解析（与 Electron demo 同一
 * 写法）：解析结果是绝对 URL，而 worker 里的相对路径本来是按 **worker 脚本**的位置解析的 ——
 * 两者恰好都能用，但后者纯属巧合。
 *
 * 模块级单例也一并去掉了：唯一的调用点是 `setup_rxdb.ts` 的 `localDatabase()`，
 * 那里已经把建库 Promise 记住了。两层缓存等于两个「哪个才是本 app 的实例」的答案。
 */
export default async (forced?: DevToolsForcedVfs) => {
  const wasmBase = new URL('wa-sqlite/', document.baseURI).href;

  // 后端判定**只做一次**：适配器工厂开的库和 devtools 宣告的能力必须来自同一个结论。
  // 探针虽是纯函数，但两处各探一次得到的一致性只是碰巧——OPFS 可用性会随存储配额变化。
  // 强制档下探测根本不被调用：见 resolveWaSqliteBackend。
  let backendOnce: Promise<WaSqliteBackend> | undefined;
  const resolveBackend = (): Promise<WaSqliteBackend> =>
    (backendOnce ??= resolveWaSqliteBackend(forced, checkOPFSAvailable, typeof SharedWorker === 'function'));

  const rxdb = new RxDB({
    dbName: WEB_PREVIEW_DB_NAME,
    context: { userId: 'userId' },
    // `DesktopLaunch` 两个后端都注册，理由见 `setup_rxdb_desktop.ts` 同一处。
    entities: [Todo, MenuLarge, MenuSimple, FileNode, FileLarge, DesktopLaunch],
    // TAURI-04：这里原先还声明了 `remote: { adapter: 'supabase' }`，可全文件只
    // 注册了 `wa-sqlite` 一个适配器。声明会让 `remoteAdapter$` 去解析一个不存在的
    // 适配器名，谁订阅谁炸；`SyncType.None` 没人订阅把这条故障暂时掩住了。
    // 这个 demo 演示的就是纯本地 wa-sqlite，远端同步另有 dev-rxdb-supabase。
    sync: {
      local: {
        adapter: 'wa-sqlite'
      },
      type: SyncType.None
    }
  });
  // US-505：浏览器预览下 storage 落回插件默认的 OPFS 后端（根目录同为 `files`）。
  // 不装的话 `/storage` 页在 `nx serve` 里会直接炸在 `rxdb.storage` 上 —— 而这个 demo
  // 想让人看见的恰恰是「同一个页面、同一套 API，换掉的只是文件落在哪」。
  // 这里刻意不显式写 rootDir：桌面路径那个常量是给 Rust 侧的物理布局用的，
  // 搬到这条 OPFS 路径上只会多出一处需要同步、却没有任何东西去核对的配置。
  //
  // US-905 AC#6：强制档是让本模块出现在真 Tauri 窗口里的唯一原因，而 WKWebView 没有
  // `createWritable` —— 插件默认的 OPFS 后端写不进去，storage 探针会以同一句
  // `r.createWritable is not a function` 把三个档位全部打成 failed，且错误长得一模一样。
  // Tauri 宿主下 storage 因此改走 **worker 写通道**：读与目录操作仍委托插件默认 OPFS 后端
  // （文件与 metadata 留在同一个 WebView 存储域里，AC#9 的备份域不裂开），只有 openWrite
  // 拆到 worker 用 `createSyncAccessHandle` 写 —— WKWebView 的 worker 里有它、页面上没有。
  // 桌面 filesystem 在这里用不了：AC#9 的守卫会拒绝 wa-sqlite 适配器配原生文件后端
  // （`adapter_mismatch`），那正是「metadata 在浏览器、文件在原生目录」的错配。
  // 经**动态** import 接入：静态 import 会把 worker 装配拖进浏览器预览 bundle（US-207 E11）。
  let storageOptions: RxDBStoragePluginOptions | undefined;
  if (isTauriRuntime(globalThis)) {
    const { createOpfsWorkerFilesystem } = await import('./opfs-worker-filesystem');
    storageOptions = {
      // 强制档的文件域按档分根：opfs / idb 两档的 metadata 各在各自的库里，文件却共享
      // 同一个 WebView 存储域 —— 同根下前档留下的探针文件会让后档的首次上传报
      // 「文件已存在」。unavailable 档开不起库、写不到文件，也照分根，三档不搞特例。
      rootDir: forced === undefined ? 'files' : `files-${forced}`,
      filesystem: createOpfsWorkerFilesystem()
    };
  }

  rxdb
    .use(rxDBPluginGraph)
    .use(rxDBPluginHistory)
    .use(rxDBPluginStorage, storageOptions)
    .adapter('wa-sqlite', async db => {
      let options: WaSqliteOptions;
      const backend = await resolveBackend();
      if (backend === 'OPFSCoopSyncVFS') {
        options = {
          vfs: backend,
          // OPFSCoopSyncVFS 同时支持 sync 与 async，适配器无从猜测；wasmPath 指向的是
          // 同步产物 wa-sqlite.wasm，必须显式声明 sync 模式，否则会加载 asyncify glue 配同步 wasm。
          async: false,
          worker: true,
          workerInstance: new Worker(new URL('./wa-sqlite.worker', import.meta.url), {
            type: 'module',
            name: 'rxdb-wa-sqlite-worker'
          }),
          workerOwnership: 'client',
          wasmPath: `${wasmBase}wa-sqlite.wasm`
        };
      } else if (backend === 'IDBBatchAtomicVFS') {
        // 传输形态按是否强制档分叉（见 resolveWaSqliteIdbTransport 的 TSDoc）：强制档是
        // 单窗口实测脚手架，走与 opfs 档同形态的 dedicated Worker；生产路径保留
        // SharedWorker 让多标签页共享同一条连接。
        const transport = resolveWaSqliteIdbTransport(forced);
        // 强制档跳过能力探测（见 resolveForcedBackend 的 TSDoc），但生产路径的
        // `new SharedWorker` 需要一次**存在性**检查：WKWebView 没有 SharedWorker，缺它时
        // 这里是一条裸 ReferenceError，而那条专门写好的诊断只有 unavailable 档能到——
        // AC#6 三态走查里 idb 档的意义就是给出可读的 VFS 诊断，不是让错误形态取决于平台。
        if (transport === 'shared' && typeof SharedWorker !== 'function') {
          throw new Error('wa-sqlite requires OPFS or SharedWorker support');
        }
        // 与 dedicated 档同一份入口脚本：入口自己判定上下文角色（见 wa-sqlite.worker.ts 头注）。
        // 传输不同但客户端的初始化链完全相同——IDB 与 Web Locks 在两种 worker 上下文里都可用，
        // IDBBatchAtomicVFS 的多连接共享靠 Web Locks 而不是 SharedWorker 本身。
        options =
          transport === 'shared' ?
            {
              vfs: backend,
              sharedWorker: true,
              sharedWorkerInstance: new SharedWorker(new URL('./wa-sqlite.worker', import.meta.url), {
                type: 'module',
                name: 'rxdb-wa-sqlite-shared-worker'
              }),
              workerOwnership: 'client',
              wasmPath: `${wasmBase}wa-sqlite-async.wasm`
            }
          : {
              vfs: backend,
              worker: true,
              workerInstance: new Worker(new URL('./wa-sqlite.worker', import.meta.url), {
                type: 'module',
                name: 'rxdb-wa-sqlite-idb-worker'
              }),
              workerOwnership: 'client',
              wasmPath: `${wasmBase}wa-sqlite-async.wasm`
            };
      } else {
        throw new Error('wa-sqlite requires OPFS or SharedWorker support');
      }
      return new RxDBAdapterWaSqlite(db, options);
    });

  rxdb.init();

  // US-905 AC#6：按**运行时真实选中**的 VFS 宣告三领域能力。装配必须等后端判定落定，
  // 所以这里不像桌面那条路能紧接 `init()` 同步接上；`rxdb` 本身在 `init()` 后已可交给
  // connector，晚一个微任务接上只影响面板何时看见这个会话，不影响它看见什么。
  //
  // 判定失败不在这里兜底：同一个 Promise 也是适配器工厂 await 的那个，建库会带着同一个
  // 错误失败并浮到调用方。这里只补一条日志，免得多出一个无人认领的 rejection。
  //
  // 必须是链式 `.catch` 而不是 `.then(onFulfilled, onRejected)`：双参形式的 onRejected
  // **接不住 onFulfilled 自己抛的错**，而接线臂是会抛的（connector 的单实例约束、
  // `init()` 里同步跑的 `getEntityMetadata`）——那恰好就会产生这条日志本想避免的
  // 无人认领 rejection。
  void resolveBackend()
    .then(async backend => {
      const isTauri = isTauriRuntime(globalThis);
      // runtime 按真实宿主上报：普通预览是浏览器，强制档下的 Tauri 窗口必须是 'tauri' ——
      // AC#6 的 wire 观察判据（runtime: tauri + settings 按 VFS 宣告）就靠这个字段。
      const ports = createWaSqliteDevToolsPorts(backend, resolveBrowserOpfsRoot(), isTauri ? 'tauri' : 'browser');
      // 后端不可用时本地库根本开不起来，没有可调试的对象，不建 connector。
      if (ports === undefined) return;
      if (!isTauri) {
        getDevToolsConnector({ providers: ports }).init(rxdb, getEntityMetadata);
        return;
      }
      // Tauri 宿主下 connector 必须挂上中继传输，否则面板窗口发来的 HELLO 到不了这里，
      // 握手永不完成（桌面那条路在装配时显式传入同一份传输）。动态 import：静态 import
      // 会把 Tauri connector 客户端拖进浏览器预览 bundle（US-207 E11）。
      const { createTauriConnectorTransport } = await import('../devtools/tauri-connector-transport');
      getDevToolsConnector({ providers: ports, transport: createTauriConnectorTransport() }).init(
        rxdb,
        getEntityMetadata
      );
    })
    .catch((error: unknown) => console.error('wa-sqlite devtools attach failed', error));

  return rxdb;
};
