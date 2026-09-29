/**
 * Electron 本地 SQLite 适配器。
 *
 * @module RxDBAdapterElectron
 */

import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqliteBase, type SqliteBackupStorage, type SqliteClientLike } from '@aiao/rxdb-adapter-sqlite-core';
import {
  DEFAULT_DATABASE_SUFFIX,
  DesktopSqliteClient,
  assertValidDesktopDatabaseName,
  connectDesktopRestoreTarget,
  resolveDesktopHostTransport,
  type DesktopOptions
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { ADAPTER_NAME } from './electron-adapter.interface.js';

/**
 * 把 RxDB 接到 Electron 应用私有目录里的真实 SQLite 文件上。
 *
 * @remarks
 * 数据落在主进程的 `node:sqlite` 连接里，renderer 只通过一条窄传输层发请求，
 * 因此它既拿不到文件系统句柄，也拿不到物理路径（AC#3）。
 *
 * 适配器本身没有自己的查询实现：它复用 {@link RxDBAdapterSqliteBase} 的全套 SQL、事务
 * 与分支切换逻辑，只把「客户端从哪来」换成了桌面 host。Tauri 侧是同构的另一个类
 * （`@aiao/rxdb-adapter-tauri` 的 `RxDBAdapterTauri`），两者共用同一份线协议与 renderer client。
 */
export class RxDBAdapterElectron extends RxDBAdapterSqliteBase {
  readonly #databaseName: string;
  /** 备份与恢复争用的锁名，按库文件而不是 `dbName` 区分（见 {@link backupStorage}）。 */
  readonly #storageKey: string;
  override readonly name: string = ADAPTER_NAME;

  /** 解析出的逻辑数据库名，与 host 侧的物理文件一一对应。 */
  get databaseName(): string {
    return this.#databaseName;
  }

  /**
   * @param rxdb - 绑定的 RxDB 实例
   * @param options - 传输层与逻辑数据库名
   * @throws {@link RxDBAdapterDesktopError} 逻辑数据库名越出应用作用域时抛 `invalid_database_name`
   */
  constructor(
    rxdb: RxDB,
    readonly options: DesktopOptions = {}
  ) {
    super(rxdb, options);
    this.#databaseName = options.databaseName ?? `${rxdb.config.dbName}${DEFAULT_DATABASE_SUFFIX}`;
    // 在构造期就校验：名字非法时根本没有能打开的库，等发出 IPC 才报错只会让原因离现场更远。
    assertValidDesktopDatabaseName(this.#databaseName);
    this.#storageKey = `${this.name}:file:${this.#databaseName}`;
  }

  protected override async createClient(): Promise<DesktopSqliteClient> {
    return DesktopSqliteClient.connect(
      this.options.transport ?? resolveDesktopHostTransport(),
      { engine: 'sqlite', databaseName: this.#databaseName },
      { batchTimeout: this.options.batchTimeout }
    );
  }

  /**
   * 桌面库是应用数据目录里的一个库文件，备份与恢复都按它支持。
   *
   * @remarks
   * `storageKey` 用库文件名而不是 `dbName`：配了同一个 `databaseName` 的两个实例打开的是同一个文件，
   * 必须争同一把锁；同名实例恢复到另一个 `databaseName`（新的数据位置）则与原库互不相干。
   *
   * @returns 持久化存储后端，`label` 为 `file`
   */
  protected override backupStorage(): SqliteBackupStorage {
    return { kind: 'persistent', label: 'file', storageKey: this.#storageKey };
  }

  /**
   * Electron host 以 defensive 模式运行 SQLite，改不了影子表。
   *
   * @remarks
   * host 在特权主进程里执行 renderer 透传的 SQL；defensive 挡住直接改写影子表、`writable_schema` 这类
   * 能把库文件改坏的操作，不能为了恢复而关掉。含 FTS5 等虚表的库因此不在 Electron 的备份矩阵里。
   *
   * @returns 恒为 `false`
   */
  protected override shadowTablesWritable(): boolean {
    return false;
  }

  /**
   * 别的窗口、别的进程可能开着同一个库文件，Web Lock 挡不住它们：恢复与清理前先让这条连接独占库文件。
   *
   * @returns 独占库文件的连接
   */
  protected override createRestoreTargetClient(): Promise<SqliteClientLike> {
    return connectDesktopRestoreTarget(() => this.createClient(), this.#storageKey);
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterElectron;
  }
}
