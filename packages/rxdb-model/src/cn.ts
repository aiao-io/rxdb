import { clsx, type ClassValue } from 'clsx';

/**
 * 拼接 CSS 类名（clsx 的薄封装）。
 *
 * 过滤 falsy 值并支持对象 / 数组形式的条件类名，用于替代模板字符串拼接：
 * 模板字符串中条件类名前的分隔空格若位于行尾，会被格式化工具的尾随空白
 * 裁剪吃掉，产生 `flex-coloverflow-auto` 这类拼接错误；本函数不存在该问题。
 *
 * @param inputs - 字符串类名、条件对象或数组，falsy 值会被自动忽略
 * @returns 以单个空格连接后的类名字符串
 *
 * @example
 * ```ts
 * cn('tab-content flex-col', isForm ? 'overflow-auto p-4' : 'overflow-hidden')
 * // 'tab-content flex-col overflow-auto p-4'
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
