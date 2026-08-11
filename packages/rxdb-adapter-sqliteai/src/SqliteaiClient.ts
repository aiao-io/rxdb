import { BATCH_TIMEOUT, Oo1ClientBase, type Oo1Static } from '@aiao/rxdb-adapter-sqlite-core';
import { sqliteaiLoad } from './sqliteai-load.utils.js';
import type { SqliteaiLoadOptions } from './sqliteai.interface.js';

export { BATCH_TIMEOUT };

/**
 * SqliteAI 的 oo1 客户端实现。
 *
 * 仅声明 `clientName` 与 `loadModule`，其余生命周期（init / disconnect / 事件批处理 /
 * 队列 / 自定义函数注册 / OPFS fallback）全部由 `Oo1ClientBase` 提供。
 */
export class SqliteaiClient extends Oo1ClientBase<SqliteaiLoadOptions> {
  protected get clientName(): string {
    return 'sqliteai';
  }

  protected loadModule(options?: SqliteaiLoadOptions): Promise<Oo1Static> {
    return sqliteaiLoad(options);
  }
}
