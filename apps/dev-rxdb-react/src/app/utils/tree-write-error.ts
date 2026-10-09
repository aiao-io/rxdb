import { getErrorMessage } from './error';

/** 树页面的写操作名（含拖放），页内错误文案的固定前缀。 */
export type TreeWriteOperation =
  '新建' | '重命名' | '批量添加' | '删除' | '删除全部' | '级联删除' | '删除并提升子节点' | '拖放';

/**
 * 把写入失败格式化成页内提示文案「<操作>失败：<错误消息>」。
 *
 * @param operation - 失败的操作名
 * @param error - 捕获到的抛出值；`Error` 取其 `message`，其余用 `String()` 转换
 */
export function formatTreeWriteError(operation: TreeWriteOperation, error: unknown): string {
  return `${operation}失败：${getErrorMessage(error, String(error))}`;
}
