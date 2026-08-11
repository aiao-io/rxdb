/**
 * @fileoverview 宿主向编辑器回写文档时的最小差量计算。
 *
 * @remarks
 * 三个框架绑定（Angular / React / Vue）都要在 `value` 变化时把新内容同步进 CodeMirror。
 * 早先它们各写一份，且其中两份直接用 `{ from: 0, to: doc.length }` **全文替换**——
 * CodeMirror 会把替换区内的光标映射到 0，用户保存 / 格式化 / 协同同步一次就被送回文档开头
 * （CEA-001 / CER-001 / CEV-001）。
 *
 * 逻辑放在核心包、且刻意只处理**字符串**：这样既不需要给核心包引入
 * `@codemirror/state` / `@codemirror/view` 依赖，也让三端不可能再分叉出不同的差量算法
 * ——「同一份逻辑在多个绑定间分叉」是本仓最高产的缺陷来源。
 *
 * @module document-sync
 */

/**
 * 一次文档替换的范围与内容，字段与 CodeMirror 的 `ChangeSpec` 兼容。
 */
export interface DocumentChangeSpec {
  /** 替换起点（含）。 */
  readonly from: number;
  /** 替换终点（不含），基于**替换前**的文档坐标。 */
  readonly to: number;
  /** 替换进去的文本。 */
  readonly insert: string;
}

/**
 * 计算把 `current` 变成 `next` 所需的最小替换区间。
 *
 * 跳过公共前缀与公共后缀，只替换真正变化的那一段；两者相同时返回 `null`，
 * 调用方据此完全跳过事务。
 *
 * @param current 编辑器当前文档内容
 * @param next 宿主希望写入的新内容
 * @returns 最小替换区间；无变化时为 `null`
 *
 * @remarks
 * 只做前后缀比对，不做逐行 diff：宿主回写的典型形态是「追加一段」「改中间一小块」
 * 「整体格式化」，前后缀已经能把前两种收敛到极小区间；而整体格式化本就没有可保留的区间。
 * 复杂 diff 会带来更大的实现与性能风险，收益却只在极少数场景。
 *
 * 调用方还须给事务加上 `Transaction.addToHistory.of(false)` ——
 * 最小差量只解决光标问题，**不会**阻止程序写入进入 undo 栈。
 *
 * @example
 * ```ts
 * computeMinimalDocumentChange('hello world', 'hello brave world');
 * // { from: 6, to: 6, insert: 'brave ' }
 * computeMinimalDocumentChange('same', 'same'); // null
 * ```
 */
export const computeMinimalDocumentChange = (current: string, next: string): DocumentChangeSpec | null => {
  if (current === next) return null;

  let start = 0;
  while (start < current.length && start < next.length && current[start] === next[start]) start += 1;

  let end = 0;
  const maxEnd = Math.min(current.length - start, next.length - start);
  while (end < maxEnd && current[current.length - 1 - end] === next[next.length - 1 - end]) end += 1;

  return {
    from: start,
    to: current.length - end,
    insert: next.slice(start, next.length - end)
  };
};
