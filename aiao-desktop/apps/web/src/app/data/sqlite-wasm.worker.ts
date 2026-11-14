import { SqliteClient } from '@aiao/rxdb-adapter-sqlite-wasm';
import { expose } from 'comlink';

import { retryOnLockContention } from './lock-retry';

/**
 * 桌面的 SQLite 客户端：每条语句碰上「库文件暂时被别的标签页的连接占着」（SQLITE_BUSY、同步访问句柄建不出来）
 * 就退避重试，见 {@link retryOnLockContention}。客户端自己已把语句排成一条队，所以重试不会让语句交错。
 */
class DesktopSqliteClient extends SqliteClient {
  override execute(...args: Parameters<SqliteClient['execute']>): ReturnType<SqliteClient['execute']> {
    return retryOnLockContention(() => super.execute(...args));
  }
}

/** OPFS 上的 SQLite 只能在专用 Worker 里打开（OPFSCoopSyncVFS），主线程经 Comlink 调它。 */
expose(new DesktopSqliteClient());
