import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '@aiao/rxdb-adapter-sqlite-core';
import { createSqliteClient } from './create_sqlite_client.js';
import { ADAPTER_NAME, type SqliteOptions } from './sqlite-official.interface.js';

/**
 * 基于官方 `@sqlite.org/sqlite-wasm` 的 RxDB 本地存储适配器。
 *
 * @remarks
 * adapter 按 RxDB 数据库名创建客户端。调用方传入的 worker 实例仍由调用方负责终止。
 */
export class RxDBAdapterSqlite extends RxDBAdapterSqliteBase {
  readonly #dbName: string;
  override readonly name: string = ADAPTER_NAME;

  /**
   * @param rxdb - 绑定的 RxDB 实例
   * @param options - 官方 sqlite-wasm、OPFS、批处理与 worker 选项
   */
  constructor(
    rxdb: RxDB,
    readonly options: SqliteOptions
  ) {
    super(rxdb, options);
    this.#dbName = rxdb.config.dbName;
  }

  protected override async createClient(): Promise<SqliteClientLike> {
    return createSqliteClient(this.#dbName, this.options);
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterSqlite;
  }
}
