import { RxDB, SyncType } from '@aiao/rxdb';
import { createTauriHostTransport, DESKTOP_ADAPTER_NAME, RxDBAdapterDesktop } from '@aiao/rxdb-adapter-desktop';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { FileLarge, FileNode, MenuLarge, MenuSimple, Todo } from '@aiao/rxdb-test/entities';
import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

let rxdb: RxDB | null | undefined;

/**
 * 构建本 app 的 RxDB 单例（Tauri 宿主持有的应用作用域 SQLite 文件，无远端同步）。
 *
 * @returns 已 `init()` 但**尚未 `connect()`** 的 RxDB 实例；连接由 `connectRxDB` 负责
 * @throws 运行在非浏览器运行时（SSR）时抛出
 *
 * @remarks
 * US-210：与 `setup_rxdb_wa-sqlite.ts` 同构 —— 相同实体集、相同 `dbName`、同样纯本地。
 * 唯一的差别是数据落在哪：wa-sqlite 落在 WebView 的 OPFS/IDB 里，这里落在
 * `<AppData>/rxdb-data/test_6.sqlite3`，一个可备份、可迁移的真实文件（AC#1）。
 *
 * 选路由 `local-backend.ts` 负责，本模块只在 Tauri 窗口里被调用。
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
    entities: [Todo, MenuLarge, MenuSimple, FileNode, FileLarge],
    sync: {
      local: {
        adapter: DESKTOP_ADAPTER_NAME
      },
      type: SyncType.None
    }
  });
  rxdb.use(rxDBPluginGraph).adapter(
    DESKTOP_ADAPTER_NAME,
    async db =>
      new RxDBAdapterDesktop(db, {
        // Electron 侧的 transport 由 preload 挂在全局键上，适配器自己去取；Tauri 没有
        // preload 这一层，`invoke` / `listen` 是 renderer 直接 import 的模块，所以这里显式注入。
        // 包本身不依赖 `@tauri-apps/api`：注入点在应用里，包保持运行时无关。
        transport: createTauriHostTransport({
          invoke,
          listen,
          // 事件通道注册失败意味着响应式查询永远不刷新，在 UI 上表现为「数据没变」
          // ——所有故障形态里最难查的一种。默认行为是抛到全局，这里补一条明确的日志。
          onListenError: error => console.error('rxdb desktop change channel failed to register', error)
        }),
        runtime: 'tauri'
      })
  );

  rxdb.init();
  return rxdb;
};
