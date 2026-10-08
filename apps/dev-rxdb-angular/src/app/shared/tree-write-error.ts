/** 树页面页内提示承接的写入操作名；固定六个，三端同名。 */
export type TreeWriteOperation = '新建' | '重命名' | '批量添加' | '删除' | '级联删除' | '删除并提升子节点';

/**
 * 树页面写入失败的页内提示文案：`<操作>失败：<错误消息>`。
 *
 * @param operation - 失败的写入操作
 * @param error - 捕获到的错误；`Error` 取 `message`，其余值取 `String(error)`
 */
export function formatTreeWriteError(operation: TreeWriteOperation, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${operation}失败：${message}`;
}
