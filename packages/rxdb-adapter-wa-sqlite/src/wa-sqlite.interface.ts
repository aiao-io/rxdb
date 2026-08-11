import type { Factory } from 'wa-sqlite';

/** wa-sqlite 工厂创建的 SQLite API。 */
export type SQLiteAPI = ReturnType<typeof Factory>;

/** wa-sqlite 可注册的 VFS 实例。 */
export type SQLiteVFS = Parameters<SQLiteAPI['vfs_register']>[0];
