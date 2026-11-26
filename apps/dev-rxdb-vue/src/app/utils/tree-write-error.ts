import type { I18n } from '@aiao/rxdb-i18n';

/**
 * 树页面（菜单 / 文件管理器）上的八类写入操作名（含拖放），只作内部身份。
 *
 * @remarks
 * 与 Angular / React 两端的同名函数、同一份联合类型逐字对齐：页内错误提示的文案由它生成，
 * e2e 与单测都按「<操作>失败：<错误消息>」断言。
 */
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
 * 生成页内错误提示的文案：「<操作>失败：<错误消息>」，操作名按当前语言解析。
 *
 * @param operation - 失败的写入操作
 * @param error - 捕获到的抛出值；`Error` 取 `message`，其余用 `String()` 转文本
 * @param t - 当前语言的翻译函数
 */
export function formatTreeWriteError(operation: TreeWriteOperation, error: unknown, t: I18n['t']): string {
  const message = error instanceof Error ? error.message : String(error);
  return t('page.tree.writeFailed', { operation: t(OPERATION_KEYS[operation]), message });
}
