import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { rxDBPluginStorage } from '@aiao/rxdb-plugin-storage';
import { FileLarge, FileNode, MenuLarge, MenuSimple, Todo } from '@aiao/rxdb-test/entities';
import { checkOPFSAvailable } from '@aiao/utils';
import { APP_BASE_HREF, isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { DesktopLaunch } from './desktop-launch.entity';
import { selectWaSqliteBackend } from './wa-sqlite-backend';

let rxdb: RxDB | null | undefined;

/**
 * 构建本 app 的 RxDB 单例（纯本地 wa-sqlite，无远端同步）。
 *
 * @returns 已 `init()` 但**尚未 `connect()`** 的 RxDB 实例；连接由 `connectRxDB` 负责
 * @throws 运行在非浏览器运行时（SSR）时抛出
 *
 * @remarks
 * 必须在注入上下文中调用（读 `PLATFORM_ID` 与 `APP_BASE_HREF`）。
 * 实例按模块作用域缓存，重复调用返回同一个。
 */
export default () => {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  if (!isBrowser) throw new Error('dev-rxdb-tauri requires a browser runtime');

  const baseHref = inject(APP_BASE_HREF);

  if (rxdb) return rxdb;
  rxdb = new RxDB({
    dbName: 'test_6',
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
      const backend = selectWaSqliteBackend(await checkOPFSAvailable(), typeof SharedWorker === 'function');
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
          wasmPath: `${baseHref}wa-sqlite/wa-sqlite.wasm`
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
          wasmPath: `${baseHref}wa-sqlite/wa-sqlite-async.wasm`
        };
      } else {
        throw new Error('wa-sqlite requires OPFS or SharedWorker support');
      }
      return new RxDBAdapterWaSqlite(db, options);
    });

  rxdb.init();
  return rxdb;
};
