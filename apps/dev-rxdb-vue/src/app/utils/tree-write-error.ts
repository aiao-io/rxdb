/**
 * 树页面（菜单 / 文件管理器）上的七类写入操作名（含拖放）。
 *
 * @remarks
 * 与 Angular / React 两端的同名函数、同一份联合类型逐字对齐：页内错误提示的文案由它生成，
 * e2e 与单测都按「<操作>失败：<错误消息>」断言。
 */
export type TreeWriteOperation = '新建' | '重命名' | '批量添加' | '删除' | '级联删除' | '删除并提升子节点' | '拖放';

/**
 * 生成页内错误提示的文案：「<操作>失败：<错误消息>」。
 *
 * @param operation - 失败的写入操作
 * @param error - 捕获到的抛出值；`Error` 取 `message`，其余用 `String()` 转文本
 */
export function formatTreeWriteError(operation: TreeWriteOperation, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${operation}失败：${message}`;
}
