/**
 * Electron PGlite 适配器（renderer 侧）。
 *
 * @module pglite/RxDBAdapterElectronPGlite
 */

import type { RxDB, RxDBBackupOptions, RxDBBackupResult } from '@aiao/rxdb';
import { RxDBAdapterPGlite, type IPGliteClient } from '@aiao/rxdb-adapter-pglite';
import {
  assertDesktopPgliteResponse,
  assertValidDesktopDatabaseName,
  parseDesktopPgliteEngineResult,
  resolveDesktopHostTransport,
  type DesktopHostTransport
} from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { DesktopPGliteClient } from './desktop-pglite-client.js';
import { toElectronPGliteBackupError } from './electron-pglite-backup-error.js';
import { ADAPTER_NAME, resolveDataDirectoryName, type ElectronPGliteOptions } from './pglite-adapter.interface.js';

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
    this.#dataDirectoryName = resolveDataDirectoryName(rxdb.config.dbName, options);
    // 在构造期就校验：名字非法时根本没有能打开的目录，等发出 IPC 才报错只会让原因离现场更远。
    assertValidDesktopDatabaseName(this.#dataDirectoryName);
  }

  /**
   * 把 host 上的整个数据目录写成一份可恢复的归档（US-217）。
   *
   * @remarks
   * 快照由 host 取：它在本会话那条唯一的连接上挂起一个空事务并 `CHECKPOINT`，写出期间别的窗口、
   * 别的会话都改不动文件，归档因此对应一个已提交事务边界，快照边界前 WAL 里已提交的数据也都
   * 已落进数据文件。数据块按 renderer 的读取节奏逐块过 IPC，host 不预读，内存占用与库大小无关。
   *
   * 与浏览器端的差异：
   * - 等连接空闲的上限是构造参数里的 `beginTimeout`，不是 `options.lockTimeoutMs`（后者只管本
   *   adapter 内部队列的排队）。另一个窗口长期占着事务时报 `lock_timeout`。
   * - manifest 的元数据（引擎版本、系统表版本）在快照开始之前读取，这两次读取与普通语句一样排在
   *   别的窗口的事务后面。
   * - 主进程创建 host 时没有传 `backup` 选项（未接入 US-217）时报 `unsupported_combination`，
   *   此时不获取输出流的 writer，也不 abort 它。
   *
   * 任何失败都归一成 {@link RxDBBackupError}：桌面错误码按
   * {@link toElectronPGliteBackupError} 的映射表转换，host 不可达等其余失败报 `io_error`，
   * 原始错误留在 `cause` 上。
   *
   * @param sink - 输出流；成功时被 close，快照开始后的失败会 abort 它
   * @param options - 取消信号与排队时限
   * @returns 结束标记（条目数、字节数、SHA-256）、manifest 与范围；输出流 close 已完成
   * @throws RxDBBackupError `unsupported_combination` / `lock_timeout` / `aborted` / `invalid_state` /
   * `io_error` / `storage_full`
   *
   * @example
   * ```typescript
   * // sink 由宿主应用提供：沙箱里的 renderer 没有 node:fs，常见做法是 preload 暴露一条
   * // 只能写进应用备份目录的 WritableStream
   * const result = await adapter.backup(sink);
   * console.log(result.sha256);
   * ```
   */
  override async backup(sink: WritableStream<Uint8Array>, options: RxDBBackupOptions = {}): Promise<RxDBBackupResult> {
    try {
      return await super.backup(sink, options);
    } catch (error) {
      throw toElectronPGliteBackupError(error, this.#dataDirectoryName, 'backup');
    }
  }

  /**
   * 建出转发到主进程的客户端。
   *
   * @returns 尚未 `init()` 的桌面客户端；基类随后用 `rxdb.config.dbName` 初始化它
   */
  protected override createClient(): IPGliteClient {
    return new DesktopPGliteClient({
      transport: this.#transport(),
      dataDirectoryName: this.#dataDirectoryName,
      ...(this.#options.beginTimeout === undefined ? {} : { beginTimeout: this.#options.beginTimeout }),
      ...(this.#options.batchTimeout === undefined ? {} : { batchTimeout: this.#options.batchTimeout })
    });
  }

  /**
   * 备份 manifest 记录的存储后端：host 上的一棵数据目录。
   *
   * @returns 固定为 `directory`
   */
  protected override backupStorage(): string {
    return 'directory';
  }

  /**
   * 备份 manifest 记录的扩展名：host 运行时实际加载的那一组（已去重、排序）。
   *
   * @remarks
   * renderer 侧的 PGlite 选项全部为空，只有 host 知道每个实例装了哪些扩展；恢复时目标 host 必须
   * 全部提供。host 未启用备份时 `pg.engine` 报 `unsupported_operation`，于是在排队、取 writer 之前
   * 就拒绝。
   *
   * @returns 扩展名
   */
  protected override async backupExtensions(): Promise<readonly string[]> {
    const response = assertDesktopPgliteResponse('pg.engine', await this.#transport().request({ kind: 'pg.engine' }));
    return parseDesktopPgliteEngineResult(response.result).extensions;
  }

  /** 构造参数里的传输层，缺省时取 preload 暴露的那条。 */
  #transport(): DesktopHostTransport {
    return this.#options.transport ?? resolveDesktopHostTransport();
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterElectronPGlite;
  }
}
