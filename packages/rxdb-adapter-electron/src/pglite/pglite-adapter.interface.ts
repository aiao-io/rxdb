/**
 * Electron PGlite 适配器在本包内的身份与选项。
 *
 * @module pglite/pglite-adapter.interface
 */

import type { DesktopHostTransport } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';

/**
 * 适配器在 `RxDBAdapters` 注册表中的名字。
 *
 * @remarks
 * 与 `sqlite-electron` 并列，同一个 Electron 运行时上两个适配器可以同时注册
 * （US-207 已为此把 SQLite 侧的名字从 `electron` 改成了 `sqlite-electron`）。
 *
 * 这里**刻意不写** `satisfies DesktopHostAdapterName`：那份登记表是「走 SQLite host
 * 协议的适配器」的清单，PGlite 走的是另一族协议（`pg.*`）。硬套上去会让共享层的
 * 存储联合把 `pglite-electron` 也当成能接受 `DesktopSqliteFileStorage` 的适配器。
 */
export const ADAPTER_NAME = 'pglite-electron' as const;

/**
 * 逻辑数据目录名的默认后缀。
 *
 * @remarks
 * 与 SQLite 侧的 `DEFAULT_DATABASE_SUFFIX` 同构，但后缀不同：PGlite 落盘的是一棵
 * initdb 生成的**目录树**而不是单个文件，用 `.db` 之类的文件后缀命名只会误导运维。
 */
export const DEFAULT_DATA_DIRECTORY_SUFFIX = '-pgdata';

/** {@link RxDBAdapterElectronPGlite} 的构造选项。 */
export interface ElectronPGliteOptions {
  /**
   * 传输层；省略时从 `globalThis` 上读取 preload 注入的那一份。
   *
   * @remarks
   * 显式传入主要供测试与非 Electron 宿主使用，见
   * {@link @aiao/rxdb-adapter-sqlite-core/desktop-host#resolveDesktopHostTransport}。
   */
  readonly transport?: DesktopHostTransport;
  /**
   * 应用作用域内的逻辑数据目录名；省略时为 `<dbName>-pgdata`。
   *
   * @remarks
   * 只能是名字，不能是路径：物理根目录由主进程决定，renderer 既拿不到也不需要
   * （AC#5）。含路径分隔符时在构造期就抛 `invalid_database_name`。
   */
  readonly dataDirectoryName?: string;
  /**
   * `pg.begin` 等待主进程那条唯一连接的上限（毫秒）。
   *
   * @remarks
   * 省略时用协议默认值 `DESKTOP_PGLITE_DEFAULT_BEGIN_TIMEOUT_MS`。它约束的是**跨窗口**
   * 的竞争：同一个客户端内部的事务由本地互斥串行化，根本不会互相超时。
   */
  readonly beginTimeout?: number;
  /**
   * NOTIFY 批量窗口（毫秒）；省略时用 `DEFAULT_NOTIFY_BATCH_TIMEOUT_MS`。
   *
   * @remarks
   * 与浏览器路径同义、同实现——批量发生在渲染进程，主进程只转发裸 NOTIFY。
   */
  readonly batchTimeout?: number;
}
