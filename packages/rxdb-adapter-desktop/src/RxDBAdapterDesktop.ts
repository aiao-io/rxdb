/**
 * 桌面（Electron）本地数据库适配器。
 *
 * @module RxDBAdapterDesktop
 */

import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';
import { ADAPTER_NAME, DEFAULT_DATABASE_SUFFIX, type DesktopOptions } from './desktop-adapter.interface.js';
import { DesktopSqliteClient, resolveDesktopHostTransport } from './desktop-sqlite-client.js';
import { assertValidDesktopDatabaseName } from './desktop-storage.js';

/**
 * 把 RxDB 接到桌面应用私有目录里的真实 SQLite 文件上。
 *
 * @remarks
 * 数据落在特权侧的 `node:sqlite` 连接里，renderer 只通过一条窄传输层发请求，
 * 因此它既拿不到文件系统句柄，也拿不到物理路径（AC#5）。
 *
 * 适配器本身没有自己的查询实现：它复用 {@link RxDBAdapterSqliteBase} 的全套 SQL、事务、
 * 分支切换与 writer lease 逻辑，只把「客户端从哪来」换成了桌面 host。
 */
export class RxDBAdapterDesktop extends RxDBAdapterSqliteBase {
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
    readonly options: DesktopOptions = {}
  ) {
    super(rxdb, options);
    this.#databaseName = options.databaseName ?? `${rxdb.config.dbName}${DEFAULT_DATABASE_SUFFIX}`;
    // 在构造期就校验：名字非法时根本没有能打开的库，等发出 IPC 才报错只会让原因离现场更远。
    assertValidDesktopDatabaseName(this.#databaseName);
  }

  protected override async createClient(): Promise<DesktopSqliteClient> {
    return DesktopSqliteClient.connect(
      this.options.transport ?? resolveDesktopHostTransport(),
      { engine: 'sqlite', databaseName: this.#databaseName },
      { batchTimeout: this.options.batchTimeout }
    );
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterDesktop;
  }
}
