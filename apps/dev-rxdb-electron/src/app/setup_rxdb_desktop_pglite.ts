import { RxDB, SyncType } from '@aiao/rxdb';
import { ELECTRON_PGLITE_ADAPTER_NAME, RxDBAdapterElectronPGlite } from '@aiao/rxdb-adapter-electron/pglite';
import { rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
import { FileLarge, FileNode, MenuLarge, MenuSimple, Todo } from '@aiao/rxdb-test/entities';
import { DesktopLaunch } from './desktop-launch.entity';

/**
 * PGlite 数据目录名。
 *
 * @remarks
 * 物理位置是 `userData/rxdb-pglite/<此值>/`：外层由主进程的 `DESKTOP_PGLITE_DIRECTORY`
 * 决定，内层就是这个值。显式写出而不吃默认值 —— e2e 要按这个路径去磁盘上核对数据目录，
 * 默认值一旦变动，那边只会看到「目录不见了」。
 *
 * 与 SQLite 那份 demo 刻意**不同名**：它们是两份永不互通的物理存储，同名会让
 * 「换个后端再打开」看起来像是数据丢了。
 */
export const DESKTOP_PGLITE_DATA_DIRECTORY = 'desktop_demo_pg';

/**
 * 构建一个走主进程 PGlite 的 RxDB 单例（US-208）。
 *
 * @returns 已 `init()` 但**尚未 `connect()`** 的 RxDB 实例
 *
 * @remarks
 * 与 `setup_rxdb_desktop.ts` 同构，唯一的差别是本地适配器：那份把 SQL 交给主进程的
 * `node:sqlite`，这份交给活在 worker 线程里的 PGlite 单实例。渲染进程这边**没有**
 * PostgreSQL 运行时，只有一层协议代理（见 `@aiao/rxdb-adapter-electron/pglite` 的模块说明）。
 *
 * **本模块没有接进 `setup_rxdb.ts` 的候选表**，是有意的：候选表的顺序即优先级，往里加一个
 * 桌面候选就会悄悄改变 demo 到底写进哪一份物理存储 —— 而 SQLite 与 PGlite 是两棵互不相通
 * 的数据树，既有 e2e 到磁盘上核对字节的那些断言会当场失效，表征却是「数据没了」。
 * 它在这里的作用是**可运行的接线范例**：宿主应用照抄这一份，把 `ELECTRON_ADAPTER_NAME`
 * 换成 `ELECTRON_PGLITE_ADAPTER_NAME` 即可。
 *
 * 也没有 `rxDBPluginStorage`：文件存储那条线与本地 SQL 引擎正交，桌面文件后端已经在
 * SQLite 那份 demo 里验过，这里再挂一遍只会把两件事绑在一起。
 *
 * **本模块不调用 `inject()`**，理由与 `setup_rxdb_desktop.ts` 一致：它经由动态 `import()`
 * 加载，调用点已经在至少一个 `await` 之后，注入上下文那时已经离开。
 */
export default () => {
  const rxdb = new RxDB({
    dbName: DESKTOP_PGLITE_DATA_DIRECTORY,
    context: { userId: 'userId' },
    entities: [Todo, MenuLarge, MenuSimple, FileNode, FileLarge, DesktopLaunch],
    sync: {
      local: {
        adapter: ELECTRON_PGLITE_ADAPTER_NAME
      },
      type: SyncType.None
    }
  });

  // 不传 transport：适配器自己去全局键上找 preload 暴露的桥接，渲染进程因此拿不到、
  // 也不需要知道数据目录的物理路径（AC#5）。
  rxdb
    .use(rxDBPluginGraph)
    .adapter(
      ELECTRON_PGLITE_ADAPTER_NAME,
      async db => new RxDBAdapterElectronPGlite(db, { dataDirectoryName: DESKTOP_PGLITE_DATA_DIRECTORY })
    );

  rxdb.init();
  return rxdb;
};
