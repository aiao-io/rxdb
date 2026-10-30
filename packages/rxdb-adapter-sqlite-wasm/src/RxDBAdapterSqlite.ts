import type { RxDB } from '@aiao/rxdb';
import {
  deleteIndexedDatabase,
  removeOpfsFiles,
  RxDBAdapterSqliteBase,
  RxDBAdapterSqliteError,
  type SqliteBackupStorage,
  type SqliteClientLike
} from '@aiao/rxdb-adapter-sqlite-core';
import { createSqliteClient } from './create_sqlite_client.js';
import { ADAPTER_NAME, type SqliteOptions } from './sqlite.interface.js';
import { resolveSqliteWasmTransport, type SqliteWasmTransport } from './transport.js';

/**
 * 浏览器 @subframe7536/sqlite-wasm 适配器。
 *
 * 复用 {@link RxDBAdapterSqliteBase} 提供的能力（DDL / 仓库代理 / 改动分发），
 * 仅在 {@link RxDBAdapterSqlite.createClient} 处注入 sqlite-wasm 的
 * {@link createSqliteClient} 与 VFS 加载逻辑。
 */
export class RxDBAdapterSqlite extends RxDBAdapterSqliteBase {
  /** 数据库名直接从 RxDB 配置读取，避免与多个 RxDB 实例串号。 */
  readonly #dbName: string;
  /** 连接实际走的 transport：锁名、交还持有者、备份拒绝都按它判，与 `createSqliteClient` 同一个判据。 */
  readonly #transport: SqliteWasmTransport;
  override readonly name: string = ADAPTER_NAME;

  constructor(
    rxdb: RxDB,
    readonly options: SqliteOptions
  ) {
    super(rxdb, options);
    this.#dbName = rxdb.config.dbName;
    this.#transport = resolveSqliteWasmTransport(options);
  }

  /**
   * 按当前 VFS，`dropStorage()` 删不删得掉本库（只读检出位建快照库之前问一次，US-313）。
   *
   * @returns `fs-handle` 为 `false`，其余 VFS 为 `true`
   */
  override canDropStorage(): boolean {
    return this.#storageDrop() !== undefined;
  }

  /**
   * 删掉本库的持久存储（只读检出位回收快照库，US-313）。
   *
   * @throws {@link RxDBAdapterSqliteError} 还连着；IndexedDB 库被别处挡住、OPFS 文件仍被占用；VFS 不支持删除
   *
   * @remarks
   * 位置与连接时同一套推导（库文件 `<库名>.sqlite`）：`idb` / `idb-memory` 是独立的 IndexedDB 库
   * `<库名>.sqlite.db`，`opfs` 是 OPFS 根目录下的库文件与 `-journal` / `-wal`；`memory` 断开即无。
   * `fs-handle` 的根目录由调用方给，不知道删哪里。
   */
  override async dropStorage(): Promise<void> {
    this.assertDisconnectedForDrop();
    const drop = this.#storageDrop();
    if (!drop) throw new RxDBAdapterSqliteError(`dropStorage: vfs ${this.options.vfs} 不支持删除存储`);
    await drop();
  }

  /**
   * 备份 / 恢复支持的 VFS：`memory`（内存）与 `idb`（IndexedDB）。
   * 其余 VFS 报 `unsupported_combination`。
   *
   * @remarks
   * 只交付了主线程连接：dedicated Worker / SharedWorker 传输下的备份与恢复还没有实测，
   * 设置了其中任一选项都报 `unsupported_combination`（`field` 为 `transport`）。
   */
  protected override backupStorage(): SqliteBackupStorage {
    if (this.#transport.worker) return { kind: 'unsupported', field: 'transport', actual: 'worker' };
    if (this.#transport.sharedWorker) return { kind: 'unsupported', field: 'transport', actual: 'sharedWorker' };
    const vfs = this.options.vfs ?? 'idb';
    if (vfs === 'memory') return { kind: 'memory', label: 'memory' };
    if (vfs === 'idb') return this.persistentBackupStorage('idb');
    return { kind: 'unsupported', field: 'vfs', actual: vfs };
  }

  protected override async createClient(): Promise<SqliteClientLike> {
    return createSqliteClient(this.#dbName, this.options, this.clientOwner);
  }

  /**
   * SharedWorker 传输下多个标签页共用 worker 里那一个客户端：给出跨标签页串行事务的锁名（US-314 B2.3b）。
   *
   * @returns 按库名区分的锁名；不走 SharedWorker 时为 `undefined`
   *
   * @remarks
   * 判据与连接时实际走的 transport 同一份：只给 `sharedWorkerInstance`、没写 `sharedWorker: true` 也是共用连接。
   */
  protected override sharedClientLockName(): string | undefined {
    return this.#transport.sharedWorker ? `rxdb-sqlite-shared-client:${ADAPTER_NAME}:${this.#dbName}` : undefined;
  }

  /** 本库存储的删法；`canDropStorage()` 与 `dropStorage()` 共用这一份，删不掉的 VFS 交回 `undefined`。 */
  #storageDrop(): (() => Promise<void>) | undefined {
    const vfs = this.options.vfs ?? 'idb';
    const file = `${this.#dbName}.sqlite`;
    switch (vfs) {
      case 'memory':
        return async () => undefined;
      case 'idb':
      case 'idb-memory':
        return () => deleteIndexedDatabase(`${file}.db`);
      case 'opfs': {
        const path = new URL(file, 'file://').pathname.slice(1);
        return () => removeOpfsFiles([path, `${path}-journal`, `${path}-wal`]);
      }
      case 'fs-handle':
        return undefined;
    }
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterSqlite;
  }
}
