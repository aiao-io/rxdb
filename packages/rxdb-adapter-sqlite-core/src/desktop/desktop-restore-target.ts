import { RxDBBackupError } from '@aiao/rxdb';
import type { SqliteClientLike } from '../RxDBAdapterSqliteBase.js';
import { RxDBAdapterDesktopError } from './desktop-error.js';
import { DESKTOP_HOST_PROTOCOL_VERSION } from './desktop-host-protocol.js';

/**
 * 让一条连接独占库文件的脚本。
 *
 * @remarks
 * - `locking_mode = EXCLUSIVE` 之后的第一个写事务拿到库文件的 EXCLUSIVE 锁，并一直持有到连接关闭。
 *   WAL 下别的连接只要开着这个库就持有库文件的 SHARED 锁，所以只要还有别的连接（别的窗口、别的进程），
 *   这一步就撞锁；反过来独占拿到之后，别的连接在初始化读库时撞锁，打不开。
 * - `busy_timeout = 0` 让撞锁立刻失败。Tauri host 初始化时设了 5 秒 busy_timeout，独占检查不该陪着等。
 *   第一条语句也因此不是 `BEGIN`：Electron host 只对打头是 `BEGIN` 的脚本做 busy 退避重试。
 * - 空事务 `BEGIN IMMEDIATE; COMMIT;` 只为触发取锁，不写任何东西。
 */
const EXCLUSIVE_LOCK_SQL = 'PRAGMA busy_timeout = 0; PRAGMA locking_mode = EXCLUSIVE; BEGIN IMMEDIATE; COMMIT;';

/** 把建连与取锁时的桌面错误换成备份契约里的错误码；其余错误原样交给恢复流程分类。 */
const restoreTargetError = (error: unknown, storageKey: string): unknown => {
  if (!(error instanceof RxDBAdapterDesktopError)) return error;
  if (error.code === 'database_busy') {
    return new RxDBBackupError('target_busy', `Desktop database "${storageKey}" is open in another connection`, {
      details: { field: 'storage', actual: storageKey },
      cause: error
    });
  }
  if (error.code === 'protocol_violation') {
    return new RxDBBackupError('unsupported_combination', `The desktop host does not speak this renderer's protocol`, {
      details: { field: 'protocolVersion', expected: DESKTOP_HOST_PROTOCOL_VERSION },
      cause: error
    });
  }
  return error;
};

/** 通道本身出了问题（而不是 host 执行语句报错）的桌面错误码。 */
const CHANNEL_FAILURES: ReadonlySet<string> = new Set([
  'host_unavailable',
  'session_closed',
  'protocol_violation',
  'host_internal_error'
]);

/**
 * 让独占连接上的通道失败报 `io_error`。
 *
 * @remarks
 * 恢复流程把执行归档语句时的失败归为 `corrupt_archive`；通道断开时归档本身完好，照那样报会让用户去怀疑归档。
 * 这里在桌面层把通道失败换成备份契约的 `io_error`（主入口的分类不认识桌面错误，也不该认识）；
 * host 报的 SQL 错误与其它错误原样交给恢复流程分类。只换 `execute`，其余成员原样转给原连接。
 */
const reportChannelFailuresAsIo = (client: SqliteClientLike): SqliteClientLike => {
  const execute: SqliteClientLike['execute'] = (sql, bindings) =>
    client.execute(sql, bindings).catch((error: unknown) => {
      if (!(error instanceof RxDBAdapterDesktopError) || !CHANNEL_FAILURES.has(error.code)) throw error;
      throw new RxDBBackupError('io_error', 'The desktop host channel failed during restore', { cause: error });
    });
  return new Proxy(client, {
    get: (target, property) => {
      if (property === 'execute') return execute;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
};

/**
 * 为恢复或清理打开目标库，并让这条连接独占库文件，直到它断开。
 *
 * @remarks
 * 桌面库文件可能同时被别的窗口、别的进程打开，Web Lock 只挡得住同一个浏览器上下文里的连接。
 * 这里在检查目标是否为空之前就拿到 SQLite 的文件级独占锁，并一直持有到恢复完成或失败清理结束
 * （US-217「未连接」的定义），中间没有「检查过后又被别人连上」的窗口。
 *
 * 握手不兼容时 host 连库都没开，目标一个字节都没动（AC#21）。拿到独占之后，这条连接上的通道失败
 * （host 退出、IPC 断开、应答不合协议）报 `io_error`，不会被当成归档损坏。
 *
 * @param connect - 按 adapter 当前配置建一条新连接
 * @param storageKey - 目标的存储键，写进 `target_busy` 的 `details.actual`
 * @returns 已独占库文件的连接
 * @throws RxDBBackupError `target_busy`：库文件正被别的连接打开；
 *   `unsupported_combination`（`field` 为 `protocolVersion`）：host 与 renderer 的线协议不一致；
 *   之后在返回的连接上：`io_error`：通道在语句途中失败
 */
export const connectDesktopRestoreTarget = async (
  connect: () => Promise<SqliteClientLike>,
  storageKey: string
): Promise<SqliteClientLike> => {
  const client = await connect().catch((error: unknown) => {
    throw restoreTargetError(error, storageKey);
  });
  try {
    await client.execute(EXCLUSIVE_LOCK_SQL);
    return reportChannelFailuresAsIo(client);
  } catch (error) {
    // 取锁失败时这条连接没有任何用处，关闭失败不改变结论
    await client.disconnect().catch(() => undefined);
    throw restoreTargetError(error, storageKey);
  }
};
