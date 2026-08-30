/**
 * Electron PGlite 适配器（renderer 侧）。
 *
 * @module pglite/RxDBAdapterElectronPGlite
 */

import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterPGlite, type IPGliteClient } from '@aiao/rxdb-adapter-pglite';
import {
  assertValidDesktopDatabaseName,
  resolveDesktopHostTransport
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { DesktopPGliteClient } from './desktop-pglite-client.js';
import { ADAPTER_NAME, DEFAULT_DATA_DIRECTORY_SUFFIX, type ElectronPGliteOptions } from './pglite-adapter.interface.js';

/**
 * 把 RxDB 接到 Electron 主进程持有的那个唯一 PGlite 实例上。
 *
 * @remarks
 * 数据落在主进程的应用数据目录里，renderer 只通过一条窄传输层发 `pg.*` 请求，
 * 因此它既拿不到 OPFS 句柄，也拿不到物理路径（AC#5）。
 *
 * 适配器本身没有自己的查询实现：SQL 生成、迁移、变更管线、加密全部复用
 * {@link RxDBAdapterPGlite}，只把 {@link RxDBAdapterPGlite.createClient} 这一个接缝
 * 换成了 {@link DesktopPGliteClient}。这是刻意的——桌面与浏览器共用一份行为，
 * 分叉出去的每一行都会变成「只在 Electron 下复现」的 bug。
 *
 * @example
 * ```ts
 * rxdb.registerAdapter(new RxDBAdapterElectronPGlite(rxdb));
 * ```
 */
export class RxDBAdapterElectronPGlite extends RxDBAdapterPGlite {
  readonly #dataDirectoryName: string;
  readonly #options: ElectronPGliteOptions;
  override name: string = ADAPTER_NAME;

  /** 解析出的逻辑数据目录名，与 host 侧的物理目录一一对应。 */
  get dataDirectoryName(): string {
    return this.#dataDirectoryName;
  }

  /**
   * @param rxdb - 绑定的 RxDB 实例
   * @param options - 传输层、逻辑数据目录名与两个超时窗口
   * @throws {@link RxDBAdapterDesktopError} 逻辑数据目录名越出应用作用域时抛 `invalid_database_name`
   */
  constructor(rxdb: RxDB, options: ElectronPGliteOptions = {}) {
    // 落盘位置归主进程，renderer 一侧的 PGlite 选项全部为空——把 dbName 之外的东西
    // 传下去只会让 `RxDBAdapterPGlite` 以为自己还管着存储。
    super(rxdb, {});
    this.#options = options;
    this.#dataDirectoryName = options.dataDirectoryName ?? `${rxdb.config.dbName}${DEFAULT_DATA_DIRECTORY_SUFFIX}`;
    // 在构造期就校验：名字非法时根本没有能打开的目录，等发出 IPC 才报错只会让原因离现场更远。
    assertValidDesktopDatabaseName(this.#dataDirectoryName);
  }

  /**
   * 建出转发到主进程的客户端。
   *
   * @returns 尚未 `init()` 的桌面客户端；基类随后用 `rxdb.config.dbName` 初始化它
   */
  protected override createClient(): IPGliteClient {
    return new DesktopPGliteClient({
      transport: this.#options.transport ?? resolveDesktopHostTransport(),
      dataDirectoryName: this.#dataDirectoryName,
      ...(this.#options.beginTimeout === undefined ? {} : { beginTimeout: this.#options.beginTimeout }),
      ...(this.#options.batchTimeout === undefined ? {} : { batchTimeout: this.#options.batchTimeout })
    });
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterElectronPGlite;
  }
}
