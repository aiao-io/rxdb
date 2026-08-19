import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { FileLarge, FileNode, MenuLarge, MenuSimple, Todo } from '@aiao/rxdb-test/entities';
import { checkOPFSAvailable } from '@aiao/utils';
import { connectWithOpfsFallback } from './connect-wa-sqlite-adapter';
import { WEB_PREVIEW_DB_NAME } from './db-names';
import { DesktopLaunch } from './desktop-launch.entity';

/**
 * 构建渲染进程内的 RxDB 单例（wa-sqlite / OPFS，无远端同步）。
 *
 * @returns 已 `init()` 但**尚未 `connect()`** 的 RxDB 实例；连接由 `LocalDatabaseService` 负责
 *
 * @remarks
 * 这条分支只在 preload **没有**注入桌面桥接时被选中 —— 也就是 `nx serve dev-rxdb-electron`
 * 直接开浏览器预览的场景。打包后的 Electron 窗口一律走 `setup_rxdb_desktop.ts`。
 *
 * **本模块不调用 `inject()`。** 它经由动态 `import()` 加载（US-207 E11），调用点已经在
 * 至少一个 `await` 之后 —— 注入上下文那时已经离开，`inject()` 会以 NG0203 失败。
 * 浏览器运行时那道闸因此上移到 `app.config.ts` 的 `provideRxDB` 工厂里，在 `await` 之前执行；
 * 连接与拆卸则分别归 `LocalDatabaseService` 与 `provideRxDB` 自己（工厂产出的实例由它负责销毁）。
 *
 * 模块级单例也一并去掉了：唯一的调用点是 `setup_rxdb.ts` 的 `localDatabase()`，
 * 那里已经把建库 Promise 记住了。两层缓存等于两个「哪个才是本 app 的实例」的答案。
 */
export default () => {
  // ELEC-10：wasm 路径不能从 APP_BASE_HREF 拼。该 token 现在固定是空串
  // （hash 路由的要求，见 app.config.ts），拼出来会变成裸相对路径，
  // 在 worker 里按 worker 脚本位置解析 —— 恰好能用，但纯属巧合。
  // 这里改为显式相对 `document.baseURI` 解析：dev 下是 dev server 根，
  // 生产 file: 下是 index.html 所在目录，两者都指向真正的产物位置。
  const wasmBase = new URL('wa-sqlite/', document.baseURI).href;

  const rxdb = new RxDB({
    dbName: WEB_PREVIEW_DB_NAME,
    context: { userId: 'userId' },
    // `DesktopLaunch` 两个后端都注册，理由见 `setup_rxdb_desktop.ts` 同一处。
    entities: [Todo, MenuLarge, MenuSimple, FileNode, FileLarge, DesktopLaunch],
    // 这里原先还声明了 `remote: { adapter: 'supabase' }`，可全文件只注册了 `wa-sqlite`
    // 一个适配器。声明会让 `remoteAdapter$` 去解析一个不存在的适配器名，谁订阅谁炸；
    // `SyncType.None` 没人订阅把这条故障暂时掩住了。远端同步另有 dev-rxdb-supabase。
    // 与 dev-rxdb-tauri 的 TAURI-04 同一处修正。
    sync: {
      local: {
        adapter: 'wa-sqlite'
      },
      type: SyncType.None
    }
  });

  // US-504：浏览器预览下 storage 落回插件默认的 OPFS 后端。不装的话 `/storage` 页在
  // `nx serve` 里会直接炸在 `rxdb.storage` 上 —— 而这个 demo 想让人看见的恰恰是
  // 「同一个页面、同一套 API，换掉的只是文件落在哪」。
  // 刻意不显式写 rootDir：桌面路径那个常量是给主进程的物理布局用的，
  // 搬到这条 OPFS 路径上只会多出一处需要同步、却没有任何东西去核对的配置。
  rxdb
    .use(rxDBPluginGraph)
    .use(rxDBPluginStorage)
    .adapter('wa-sqlite', async db => {
      let opfsWorker: Worker | undefined;
      const available = await checkOPFSAvailable();
      return connectWithOpfsFallback(
        available,
        () => {
          opfsWorker = new Worker(new URL('./wa-sqlite.worker', import.meta.url), {
            type: 'module',
            name: 'rxdb-wa-sqlite-worker'
          });
          const options: WaSqliteOptions = {
            vfs: 'OPFSCoopSyncVFS',
            // OPFSCoopSyncVFS 同时支持 sync 与 async，适配器无从猜测；wasmPath 指向的是
            // 同步产物 wa-sqlite.wasm，必须显式声明 sync 模式，否则会加载 asyncify glue 配同步 wasm。
            async: false,
            worker: true,
            workerInstance: opfsWorker,
            workerOwnership: 'client',
            wasmPath: `${wasmBase}wa-sqlite.wasm`
          };
          return new RxDBAdapterWaSqlite(db, options);
        },
        () => {
          const options: WaSqliteOptions = {
            vfs: 'IDBBatchAtomicVFS',
            sharedWorker: true,
            sharedWorkerInstance: new SharedWorker(new URL('./wa-sqlite-shared.worker', import.meta.url), {
              type: 'module',
              name: 'rxdb-wa-sqlite-shared-worker'
            }),
            workerOwnership: 'client',
            wasmPath: `${wasmBase}wa-sqlite-async.wasm`
          };
          return new RxDBAdapterWaSqlite(db, options);
        },
        error => {
          opfsWorker?.terminate();
          console.warn('OPFS VFS connect failed; using IDB VFS instead', error);
        }
      );
    });

  rxdb.init();
  return rxdb;
};
