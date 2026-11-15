import { RxDB, SyncType, type EntityType, type UUID } from '@aiao/rxdb';
import { RxDBAdapterSqlite, type SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';
import {
  MediaConfigCommit,
  MediaConfigCommitChange,
  MediaPlatformModel,
  MediaPromptTemplate,
  MediaProviderPolicy
} from '@aiao-media/domain';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

/** Admin 配置工作区使用的领域实体；RxDB 内部系统实体不进入 Supabase 业务同步契约。 */
export const ADMIN_CONFIG_ENTITIES: readonly EntityType[] = [
  MediaPromptTemplate,
  MediaProviderPolicy,
  MediaPlatformModel,
  MediaConfigCommit,
  MediaConfigCommitChange
];

/** 管理后台本地数据库名，账号隔离由实体 workspaceId 与用户上下文共同保证。 */
export const ADMIN_CONFIG_DB_NAME = 'aiao-media-admin-config';

/** 规范化本地数据库上下文，避免把账号、邮箱或 token 写入数据库名和日志。 */
export function normalizeAdminUserId(userId: string): UUID {
  const value = userId.trim();
  if (!/^[0-9a-f-]{8,128}$/i.test(value)) throw new Error('Admin 用户标识无效。');
  return value as UUID;
}

/** 创建由 rxdb-model-angular 消费的 Admin 配置数据库。 */
export function createAdminConfigDatabase(userId: string): RxDB {
  const contextUserId = normalizeAdminUserId(userId);
  const database = new RxDB({
    dbName: ADMIN_CONFIG_DB_NAME,
    context: { userId: contextUserId },
    entities: [...ADMIN_CONFIG_ENTITIES],
    sync: { type: SyncType.None, local: { adapter: 'sqlite-wasm' } }
  });
  database
    .use(rxDBPluginHistory)
    .use(rxDBPluginWorkingTree)
    .adapter('sqlite-wasm', db => {
      const options: SqliteOptions = {
        vfs: 'idb',
        wasmUrl: new URL('sqlite-wasm/wa-sqlite-async.wasm', document.baseURI).href
      };
      return new RxDBAdapterSqlite(db, options);
    });
  database.init();
  return database;
}
