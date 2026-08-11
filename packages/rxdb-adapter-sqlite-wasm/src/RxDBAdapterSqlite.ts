import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '@aiao/rxdb-adapter-sqlite-core';
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

  protected override async createClient(): Promise<SqliteClientLike> {
    return createSqliteClient(this.#dbName, this.options);
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterSqlite;
  }
}
