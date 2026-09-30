import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqliteBase, type SqliteBackupStorage, type SqliteClientLike } from '@aiao/rxdb-adapter-sqlite-core';
import { createSqliteClient } from './create_sqlite_client.js';
import { ADAPTER_NAME, type SqliteaiOptions } from './sqliteai.interface.js';

/**
 * 基于 `@sqliteai/sqlite-wasm` 的 RxDB 本地存储适配器。
 *
 * 与 `rxdb-adapter-sqlite`（官方 sqlite-wasm 绑定）API 对齐，差异：
 * - WASM 二进制来自 SqliteAI 的发行版（OPFS / Worker 配置一致）
 * - 客户端实现继承 `Oo1ClientBase`，复用 sqlite-core 的队列与事件批处理
 */
export class RxDBAdapterSqliteai extends RxDBAdapterSqliteBase {
  readonly #dbName: string;
  override readonly name: string = ADAPTER_NAME;

  constructor(
    rxdb: RxDB,
    readonly options: SqliteaiOptions
  ) {
    super(rxdb, options);
    this.#dbName = rxdb.config.dbName;
  }

  /**
   * 不开 OPFS 时是内存库；开 OPFS 时是持久化库。
   * `opfsFallback: 'memory'` 会在 OPFS 打不开时静默落到内存，恢复目标不确定，报 `unsupported_combination`。
   */
  protected override backupStorage(): SqliteBackupStorage {
    if (!this.options.opfs) return { kind: 'memory', label: 'memory' };
    if (this.options.opfsFallback === 'memory') return { kind: 'unsupported', field: 'opfsFallback', actual: 'memory' };
    return this.persistentBackupStorage('opfs');
  }

  protected override async createClient(): Promise<SqliteClientLike> {
    return createSqliteClient(this.#dbName, this.options);
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterSqliteai;
  }
}
