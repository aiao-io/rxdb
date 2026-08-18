/**
 * 桌面适配器的稳定错误码与错误类型。
 *
 * @module desktop-error
 */

/**
 * 桌面适配器对外承诺的稳定错误码。
 *
 * @remarks
 * 这些码是**契约的一部分**：调用方按 `code` 分支处理，消息文本可能随版本调整。
 * 新增码只能追加，不得复用或改写既有含义。
 *
 * - `unsupported_runtime_engine`：runtime 与 engine 的组合不在能力矩阵内
 * - `invalid_database_name`：逻辑数据库名非法，或试图越出应用作用域
 * - `host_unavailable`：renderer 侧拿不到桌面 host（未注入 transport / preload 未暴露）
 * - `session_closed`：会话已断开后继续使用
 * - `protocol_violation`：请求或响应不符合协议形状
 * - `open_failed`：打开数据库失败，`cause` 保留原始原因
 * - `permission_denied`：路径无权限，或语句被 SQLite 授权器拒绝（`ATTACH` / `VACUUM INTO` 等越出应用作用域的操作）
 * - `database_corrupted`：目标文件不是可用的 SQLite 数据库
 * - `statement_failed`：SQL 本身执行失败（语法、约束等），`cause` 保留原始错误
 * - `host_internal_error`：host 自身出错，属于缺陷而非调用方问题
 * - `database_busy`：另一个连接（通常是另一个窗口）正持有冲突的锁，重试即可，数据无损
 * - `file_not_found`：目标文件或目录不存在；renderer 侧据此还原成 `NotFoundError`
 * - `invalid_file_path`：路径逃出存储根，或指向的类型与操作不符
 * - `disk_full`：磁盘空间或配额耗尽（ENOSPC / EDQUOT）
 * - `write_aborted`：写入令牌已失效（会话关闭、已提交或已丢弃），目标保持写入前的内容
 */
export type RxDBAdapterDesktopErrorCode =
  | 'unsupported_runtime_engine'
  | 'invalid_database_name'
  | 'host_unavailable'
  | 'session_closed'
  | 'protocol_violation'
  | 'open_failed'
  | 'permission_denied'
  | 'database_corrupted'
  | 'statement_failed'
  | 'host_internal_error'
  | 'database_busy'
  | 'file_not_found'
  | 'invalid_file_path'
  | 'disk_full'
  | 'write_aborted';

const ERROR_CODES: readonly RxDBAdapterDesktopErrorCode[] = [
  'unsupported_runtime_engine',
  'invalid_database_name',
  'host_unavailable',
  'session_closed',
  'protocol_violation',
  'open_failed',
  'permission_denied',
  'database_corrupted',
  'statement_failed',
  'host_internal_error',
  'database_busy',
  'file_not_found',
  'invalid_file_path',
  'disk_full',
  'write_aborted'
];

/**
 * 判断一个值是否为已知的桌面错误码。
 *
 * @remarks
 * 错误码要跨 IPC 传回 renderer，而 `RxDBAdapterDesktopError` 这个类本身跨不过结构化克隆。
 * renderer 收到的是裸字符串，必须先确认它确实在契约内，否则会把 host 侧的任意字符串
 * 当成错误码往上抛，调用方的 `switch (error.code)` 就会静默走到 default。
 *
 * @param value - 待判断的值，通常来自 IPC 响应
 * @returns 是已知错误码时为 `true`
 */
export function isRxDBAdapterDesktopErrorCode(value: unknown): value is RxDBAdapterDesktopErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value as RxDBAdapterDesktopErrorCode);
}

/**
 * 桌面适配器错误。
 *
 * @remarks
 * 错误消息以 `[code]` 前缀开头，便于日志检索；程序分支请读 {@link RxDBAdapterDesktopError.code}
 * 而不是匹配文本。原始原因通过 `cause` 原样透传，不做包装或吞并（AC#4）。
 */
export class RxDBAdapterDesktopError extends Error {
  override readonly name = 'RxDBAdapterDesktopError';

  /**
   * 未加 `[code]` 前缀的原始描述。
   *
   * @remarks
   * 跨 IPC 重建错误时传的是它而不是 `message`：传 `message` 会让前缀被再加一遍，
   * renderer 侧读到 `[open_failed] [open_failed] ...`。
   */
  readonly detail: string;

  /**
   * @param code - 稳定错误码
   * @param detail - 面向开发者的描述，不含错误码前缀
   * @param options - 标准 `ErrorOptions`，用 `cause` 携带原始错误
   */
  constructor(
    readonly code: RxDBAdapterDesktopErrorCode,
    detail: string,
    options?: ErrorOptions
  ) {
    super(`[${code}] ${detail}`, options);
    this.detail = detail;
  }
}
