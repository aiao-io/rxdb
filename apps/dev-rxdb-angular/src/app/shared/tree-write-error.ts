import type { I18n } from '@aiao/rxdb-i18n';

/** 树页面页内提示承接的写入操作名；固定八个（含拖放与删除全部），三端同名。 */
export type TreeWriteOperation =
  '新建' | '重命名' | '批量添加' | '删除' | '级联删除' | '删除并提升子节点' | '拖放' | '删除全部';

/** 操作名 → 共享目录文案键；操作名只作内部身份，用户可见文案全部走目录。 */
const OPERATION_KEYS: Readonly<Record<TreeWriteOperation, string>> = {
  新建: 'page.tree.writeOp.create',
  重命名: 'page.tree.writeOp.rename',
  批量添加: 'page.tree.writeOp.batchAdd',
  删除: 'page.tree.writeOp.delete',
  删除全部: 'page.tree.writeOp.deleteAll',
  级联删除: 'page.tree.writeOp.cascadeDelete',
  删除并提升子节点: 'page.tree.writeOp.deletePromote',
  拖放: 'page.tree.writeOp.drag'
};

/**
 * 树页面写入失败的页内提示文案：`<操作>失败：<错误消息>`，操作名按当前语言解析。
 *
 * @param operation - 失败的写入操作
 * @param error - 捕获到的错误；`Error` 取 `message`，其余值取 `String(error)`
 * @param t - 当前语言的翻译函数
 */
export function formatTreeWriteError(operation: TreeWriteOperation, error: unknown, t: I18n['t']): string {
  const message = error instanceof Error ? error.message : String(error);
  return t('page.tree.writeFailed', { operation: t(OPERATION_KEYS[operation]), message });
}
