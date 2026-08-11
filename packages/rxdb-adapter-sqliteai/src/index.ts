// 从 core 重新导出共享类型和函数。
export {
  BATCH_TIMEOUT,
  ROWID,
  RxDBAdapterSqliteError,
  SqliteRepository,
  buildRuleGroup,
  get_table_name as sqliteGetTableName,
  get_table_name_by_metadata as sqliteGetTableNameByMetadata
} from '@aiao/rxdb-adapter-sqlite-core';
export type { GenerateSqlResult } from '@aiao/rxdb-adapter-sqlite-core';

// sqliteai 专用导出。
export { createSqliteClient } from './create_sqlite_client.js';
export { RxDBAdapterSqliteai } from './RxDBAdapterSqliteai.js';
export { sqliteaiLoad } from './sqliteai-load.utils.js';
export type { SqliteaiLoadOptions, SqliteaiOptions, SqliteaiRepositoryConstructor } from './sqliteai.interface.js';
export { SqliteaiClient } from './SqliteaiClient.js';
