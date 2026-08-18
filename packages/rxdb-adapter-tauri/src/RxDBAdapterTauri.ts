/**
 * Tauri 本地 SQLite 适配器。
 *
 * @module RxDBAdapterTauri
 */

import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import {
  DEFAULT_DATABASE_SUFFIX,
  DesktopSqliteClient,
  assertValidDesktopDatabaseName
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { ADAPTER_NAME } from './tauri-adapter.interface.js';
import type { TauriOptions } from './tauri-options.interface.js';

/**
 * 把 RxDB 接到 Tauri 应用私有目录里的真实 SQLite 文件上。
 *
 * @remarks
 * 数据落在 Rust 宿主的 `rusqlite` 连接里，WebView 只通过一条窄传输层发 command，
 * 因此它既拿不到文件系统句柄，也拿不到物理路径（AC#3）。
 *
 * 适配器本身没有自己的查询实现：它复用 {@link RxDBAdapterSqliteBase} 的全套 SQL、事务
 * 与分支切换逻辑，只把「客户端从哪来」换成了桌面 host。Electron 侧是同构的另一个类
 * （`@aiao/rxdb-adapter-electron` 的 `RxDBAdapterElectron`），两者共用同一份线协议与
 * renderer client——差别只在宿主用什么语言实现，以及 transport 怎么建。
 */
export class RxDBAdapterTauri extends RxDBAdapterSqliteBase {
  readonly #databaseName: string;
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
    readonly options: TauriOptions
  ) {
    super(rxdb, options);
    this.#databaseName = options.databaseName ?? `${rxdb.config.dbName}${DEFAULT_DATABASE_SUFFIX}`;
    // 在构造期就校验：名字非法时根本没有能打开的库，等发出 command 才报错只会让原因离现场更远。
    assertValidDesktopDatabaseName(this.#databaseName);
  }

  protected override async createClient(): Promise<DesktopSqliteClient> {
    return DesktopSqliteClient.connect(
      this.options.transport,
      { engine: 'sqlite', databaseName: this.#databaseName },
      { batchTimeout: this.options.batchTimeout }
    );
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterTauri;
  }
}
