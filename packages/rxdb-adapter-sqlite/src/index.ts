export {
  BATCH_TIMEOUT,
  ROWID,
  RxDBAdapterSqliteError,
  SqliteRepository,
  buildRuleGroup,
  get_table_name as sqliteGetTableName,
  get_table_name_by_metadata as sqliteGetTableNameByMetadata
} from '@aiao/rxdb-adapter-sqlite-core';
export type { GenerateSqlResult, RxDBAdapterSqliteBase } from '@aiao/rxdb-adapter-sqlite-core';

export { createSqliteClient } from './create_sqlite_client.js';
export { RxDBAdapterSqlite, RxDBAdapterSqlite as RxDBAdapterSqliteOfficial } from './RxDBAdapterSqliteOfficial.js';
export {
  resetSqliteLoadCache,
  resetSqliteLoadCache as resetSqliteOfficialLoadCache,
  sqliteLoad,
  sqliteLoad as sqliteOfficialLoad
} from './sqlite-official-load.utils.js';
export type {
  SqliteLoadOptions,
  SqliteLoadOptions as SqliteOfficialLoadOptions,
  SqliteOptions as SqliteOfficialOptions,
  SqliteRepositoryConstructor as SqliteOfficialRepositoryConstructor,
  SqliteOptions,
  SqliteRepositoryConstructor
} from './sqlite-official.interface.js';
export { SqliteClient, SqliteClient as SqliteOfficialClient } from './SqliteOfficialClient.js';
