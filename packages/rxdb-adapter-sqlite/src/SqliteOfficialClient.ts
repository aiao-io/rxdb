import { BATCH_TIMEOUT, Oo1ClientBase, type Oo1Static } from '@aiao/rxdb-adapter-sqlite-core';
import { sqliteLoad } from './sqlite-official-load.utils.js';
import type { SqliteLoadOptions } from './sqlite-official.interface.js';

export { BATCH_TIMEOUT };

/**
 * 官方 sqlite-wasm 的 oo1 客户端。
 *
 * @remarks
 * 生命周期、事务队列、变更事件批处理与 OPFS fallback 由 `Oo1ClientBase` 统一实现。
 */
export class SqliteClient extends Oo1ClientBase<SqliteLoadOptions> {
  protected get clientName(): string {
    return 'sqlite';
  }

  protected loadModule(options?: SqliteLoadOptions): Promise<Oo1Static> {
    return sqliteLoad(options);
  }
}
