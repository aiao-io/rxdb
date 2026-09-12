import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { getDevToolsConnector, resolveBrowserOpfsRoot } from '@aiao/rxdb-devtools';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { FileLarge, FileNode, MenuLarge, MenuSimple, Todo } from '@aiao/rxdb-test/entities';
import { checkOPFSAvailable } from '@aiao/utils';
import { createWaSqliteDevToolsPorts } from '../devtools/tauri-vfs-providers';
import { WEB_PREVIEW_DB_NAME } from './db-names';
import { DesktopLaunch } from './desktop-launch.entity';
import type { DevToolsForcedVfs } from './devtools-runtime-config';
import { isTauriRuntime } from './services/tauri-environment';
import { resolveWaSqliteBackend, type WaSqliteBackend } from './wa-sqlite-backend';

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
export default (forced?: DevToolsForcedVfs) => {
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
  rxdb
    .use(rxDBPluginGraph)
    .use(rxDBPluginStorage)
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
        options = {
          vfs: backend,
          sharedWorker: true,
          sharedWorkerInstance: new SharedWorker(new URL('./wa-sqlite-shared.worker', import.meta.url), {
            type: 'module',
            name: 'rxdb-wa-sqlite-shared-worker'
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
    .then(backend => {
      // runtime 按真实宿主上报：普通预览是浏览器，强制档下的 Tauri 窗口必须是 'tauri' ——
      // AC#6 的 wire 观察判据（runtime: tauri + settings 按 VFS 宣告）就靠这个字段。
      const ports = createWaSqliteDevToolsPorts(
        backend,
        resolveBrowserOpfsRoot(),
        isTauriRuntime(globalThis) ? 'tauri' : 'browser'
      );
      // 后端不可用时本地库根本开不起来，没有可调试的对象，不建 connector。
      if (ports === undefined) return;
      getDevToolsConnector({ providers: ports }).init(rxdb, getEntityMetadata);
    })
    .catch((error: unknown) => console.error('wa-sqlite devtools attach failed', error));

  return rxdb;
};
