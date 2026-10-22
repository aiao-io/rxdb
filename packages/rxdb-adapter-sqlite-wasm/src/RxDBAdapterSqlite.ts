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
  override readonly name: string = ADAPTER_NAME;

  constructor(
    rxdb: RxDB,
    readonly options: SqliteOptions
  ) {
    super(rxdb, options);
    this.#dbName = rxdb.config.dbName;
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
    const { worker, workerInstance, sharedWorker, sharedWorkerInstance } = this.options;
    if (worker === true || workerInstance !== undefined)
      return { kind: 'unsupported', field: 'transport', actual: 'worker' };
    if (sharedWorker === true || sharedWorkerInstance !== undefined) {
      return { kind: 'unsupported', field: 'transport', actual: 'sharedWorker' };
    }
    const vfs = this.options.vfs ?? 'idb';
    if (vfs === 'memory') return { kind: 'memory', label: 'memory' };
    if (vfs === 'idb') return this.persistentBackupStorage('idb');
    return { kind: 'unsupported', field: 'vfs', actual: vfs };
  }

  protected override async createClient(): Promise<SqliteClientLike> {
    return createSqliteClient(this.#dbName, this.options);
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
