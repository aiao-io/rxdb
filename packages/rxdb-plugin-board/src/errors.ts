/**
 * @fileoverview 看板领域错误（US-534）
 *
 * 领域服务入口统一抛 {@link BoardDomainError}，`code` 是稳定错误码——
 * UI 据此展示可操作提示，测试据此断言拒绝语义，不解析 message 文本。
 */

/** 领域错误码。 */
export type BoardErrorCode =
  | 'restore_in_progress'
  | 'empty_title'
  | 'board_not_found'
  | 'column_not_found'
  | 'task_not_found'
  | 'label_not_found'
  | 'label_cross_board'
  | 'cross_board'
  | 'invalid_due_date'
  | 'invalid_color'
  | 'duplicate_label'
  | 'confirm_stale'
  | 'task_stale'
  | 'labels_changed'
  | 'unsupported_primary';

/** 看板领域错误：稳定错误码 + 可读消息。 */
export class BoardDomainError extends Error {
  constructor(
    readonly code: BoardErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'BoardDomainError';
  }
}
