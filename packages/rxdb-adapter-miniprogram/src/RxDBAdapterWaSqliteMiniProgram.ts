import type { RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqliteBase, type SqliteClientLike } from '@aiao/rxdb-adapter-sqlite-core';
import { createWaSqliteMiniProgramClient } from './create-client.js';
import { ADAPTER_NAME, type WaSqliteMiniProgramOptions } from './mini-program.interface.js';

/** 微信小程序单连接 wa-sqlite adapter。 */
export class RxDBAdapterWaSqliteMiniProgram extends RxDBAdapterSqliteBase {
  readonly #dbName: string;
  override readonly name: string = ADAPTER_NAME;

  constructor(
    rxdb: RxDB,
    readonly options: WaSqliteMiniProgramOptions
  ) {
    super(rxdb, options);
    this.#dbName = rxdb.config.dbName;
  }

  protected override createClient(): Promise<SqliteClientLike> {
    return createWaSqliteMiniProgramClient(this.#dbName, this.options);
  }
}

declare module '@aiao/rxdb' {
  interface RxDBAdapters {
    [ADAPTER_NAME]: RxDBAdapterWaSqliteMiniProgram;
  }
}
