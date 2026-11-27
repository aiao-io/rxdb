import type { I18n } from '@aiao/rxdb-i18n';
import { getErrorMessage } from './error';

/** 树页面的写操作名（含拖放），只作内部身份；页内错误文案的固定前缀。 */
export type TreeWriteOperation =
  '新建' | '重命名' | '批量添加' | '删除' | '删除全部' | '级联删除' | '删除并提升子节点' | '拖放';

/** 操作名 → 共享目录文案键；用户可见文案全部走目录。 */
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
 * 把写入失败格式化成页内提示文案「<操作>失败：<错误消息>」，操作名按当前语言解析。
 *
 * @param operation - 失败的操作名
 * @param error - 捕获到的抛出值；`Error` 取其 `message`，其余用 `String()` 转换
 * @param t - 当前语言的翻译函数
 */
export function formatTreeWriteError(operation: TreeWriteOperation, error: unknown, t: I18n['t']): string {
  const message = getErrorMessage(error, String(error));
  return t('page.tree.writeFailed', { operation: t(OPERATION_KEYS[operation]), message });
}
