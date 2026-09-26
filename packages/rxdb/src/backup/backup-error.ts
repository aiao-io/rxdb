import { RxDBError } from '../RxDBError.js';

/**
 * 备份 / 恢复的稳定错误分类（US-217 公共契约）。
 *
 * @remarks
 * 调用方只应按 `code` 分支，`message` 仅供人读，随时可能改写。
 *
 * | code | 含义 |
 * | --- | --- |
 * | `unsupported_combination` | adapter / 存储组合不在支持矩阵内，或 adapter 未实现该能力 |
 * | `incompatible_archive` | 归档元数据缺失或与目标配置不兼容（`details.field` 指出哪一项） |
 * | `auth_domain_mismatch` | 加密归档的认证域与目标不同 |
 * | `corrupt_archive` | 格式损坏、摘要不符或声明与载荷不一致 |
 * | `truncated_archive` | 输入在归档结束标记之前就结束了 |
 * | `target_not_empty` | 目标已含任何数据库内容（包括仅初始化过的引擎目录） |
 * | `target_busy` | 目标正被其他连接或恢复操作占用 |
 * | `restore_in_progress` | 普通连接撞上正在进行的恢复 |
 * | `restore_incomplete` | 目标留有未完成恢复的标记，须先清理再恢复 |
 * | `cleanup_pending` | 失败后的清理本身失败；目标保持未完成状态，拒绝连接 |
 * | `aborted` | 调用方在成功提交边界之前取消 |
 * | `io_error` | 输入 / 输出流或底层存储读写失败 |
 * | `storage_full` | 磁盘空间或存储配额不足 |
 * | `lock_timeout` | 等待一致性锁超时（例如在事务回调内调用备份） |
 * | `invalid_state` | adapter 未连接、正在关闭等无法执行操作的状态 |
 */
export type RxDBBackupErrorCode =
  | 'unsupported_combination'
  | 'incompatible_archive'
  | 'auth_domain_mismatch'
  | 'corrupt_archive'
  | 'truncated_archive'
  | 'target_not_empty'
  | 'target_busy'
  | 'restore_in_progress'
  | 'restore_incomplete'
  | 'cleanup_pending'
  | 'aborted'
  | 'io_error'
  | 'storage_full'
  | 'lock_timeout'
  | 'invalid_state';

/**
 * 备份错误的结构化细节。
 */
export interface RxDBBackupErrorDetails {
  /** 出问题的元数据字段或格式位置，例如 `rxdb.systemSchemaVersion`、`sha256`。 */
  readonly field?: string;
  /** 目标期望的值。 */
  readonly expected?: unknown;
  /** 归档或现场的实际值。 */
  readonly actual?: unknown;
}

/**
 * 备份 / 恢复失败。
 *
 * @example
 * ```typescript
 * try {
 *   await restorePGliteDatabase(source, target);
 * } catch (error) {
 *   if (error instanceof RxDBBackupError && error.code === 'restore_incomplete') {
 *     await cleanupIncompletePGliteRestore(target);
 *   }
 * }
 * ```
 */
export class RxDBBackupError extends RxDBError {
  /** 结构化细节，可能为空对象。 */
  readonly details: RxDBBackupErrorDetails;

  constructor(
    /** 稳定错误分类。 */
    readonly code: RxDBBackupErrorCode,
    message: string,
    options: { details?: RxDBBackupErrorDetails; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'RxDBBackupError';
    this.details = options.details ?? {};
    if (options.cause !== undefined) this.cause = options.cause;
    Object.setPrototypeOf(this, RxDBBackupError.prototype);
  }
}

/**
 * 判断一个值是否为指定 code 的 {@link RxDBBackupError}。
 *
 * @param error - 任意捕获值
 * @param code - 期望的分类；省略时只判断类型
 * @returns 类型守卫
 */
export const isRxDBBackupError = (error: unknown, code?: RxDBBackupErrorCode): error is RxDBBackupError =>
  error instanceof RxDBBackupError && (code === undefined || error.code === code);
