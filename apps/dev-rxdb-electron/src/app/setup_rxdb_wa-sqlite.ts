import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { FileLarge, FileNode, MenuLarge, MenuSimple, Todo } from '@aiao/rxdb-test/entities';
import { checkOPFSAvailable } from '@aiao/utils';
import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, inject, PLATFORM_ID, signal } from '@angular/core';
import { connectWithOpfsFallback } from './connect-wa-sqlite-adapter';
import { connectLocalAdapter, RxDBConnectionStatus, shutdownDatabase } from './rxdb-connection';

let rxdb: RxDB | null | undefined;

const connectionStatus = signal<RxDBConnectionStatus>('connecting');
const connectionError = signal<unknown>(undefined);

/**
 * ELEC-11：本地适配器（wa-sqlite）的连接状态。
 *
 * 启动连接原先是 `void rxdb.connect(...).catch(console.error)`，失败只进控制台。
 * 现在把状态暴露出来，UI 能显示「连接失败」而不是一个空列表。
 */
export const $rxdbConnectionStatus = connectionStatus.asReadonly();

/** 连接失败时的错误对象；`$rxdbConnectionStatus` 不是 `'failed'` 时为 `undefined`。 */
export const $rxdbConnectionError = connectionError.asReadonly();

/**
 * 创建（或复用）渲染进程的 RxDB 实例。
 *
 * 供 `provideRxDB()` 作为工厂调用，因此运行在注入上下文中。
 *
 * @returns 模块级单例；同一次应用启动内多次调用返回同一实例
 * @throws 当运行时不是浏览器环境（渲染进程之外）时抛出
 */
export default () => {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  if (!isBrowser) throw new Error('dev-rxdb-electron requires a browser runtime');

  // ELEC-10：wasm 路径不能再从 APP_BASE_HREF 拼。该 token 现在固定是空串
  // （hash 路由的要求，见 app.config.ts），拼出来会变成裸相对路径，
  // 在 worker 里按 worker 脚本位置解析 —— 恰好能用，但纯属巧合。
  // 这里改为显式相对 `document.baseURI` 解析：dev 下是 dev server 根，
  // 生产 file: 下是 index.html 所在目录，两者都指向真正的产物位置。
  const wasmBase = new URL('wa-sqlite/', document.baseURI).href;

  // ELEC-11：单例此前没有任何销毁路径 —— injector 销毁后 wa-sqlite 的 worker、
  // OPFS 句柄、SharedWorker 全部继续挂着。注册必须在下面的早退之前，
  // 否则复用单例的那次调用不会带上拆卸。
  // 前提：本应用单次 bootstrap，不存在两个 injector 共享同一实例的情况。
  inject(DestroyRef).onDestroy(() => {
    const instance = rxdb;
    rxdb = undefined;
    connectionStatus.set('connecting');
    connectionError.set(undefined);
    if (!instance) return;
    void shutdownDatabase(instance, error => {
      console.error('rxdb shutdown failed', error);
    });
  });

  if (rxdb) return rxdb;
  rxdb = new RxDB({
    dbName: 'test_6',
    context: { userId: 'userId' },
    entities: [Todo, MenuLarge, MenuSimple, FileNode, FileLarge],
    sync: {
      local: {
        adapter: 'wa-sqlite'
      },
      remote: {
        adapter: 'supabase'
      },
      type: SyncType.None
    }
  });
  rxdb.use(rxDBPluginGraph).adapter('wa-sqlite', async db => {
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
  void connectLocalAdapter(rxdb, 'wa-sqlite', (status, error) => {
    connectionStatus.set(status);
    connectionError.set(error);
    if (status === 'failed') console.error('wa-sqlite startup connection failed', error);
  });
  return rxdb;
};
