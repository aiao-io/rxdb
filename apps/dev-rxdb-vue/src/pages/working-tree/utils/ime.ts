/**
 * @fileoverview IME 组字判定（分支下拉的 Escape 与创建弹层的 Enter 共用）。
 *
 * @remarks
 * 中文 / 日文输入法组字期间，Enter 是「上屏」、Escape 是「取消组字」——这两个键都属于输入法，
 * 不能被当成「提交」或「关菜单」吃掉。
 */

/**
 * 这次按键是否发生在 IME 组字期间。
 *
 * @param event - 键盘事件；只读 `isComposing` 与 `keyCode` 两位（单测传普通对象即可）
 * @returns 组字中为 `true`
 *
 * @remarks
 * 只看 `isComposing` 不够：Safari 上「上屏」的那一下 Enter 报 `isComposing=false`、`keyCode` 229。
 * `keyCode` 已废弃，但 229 是各浏览器标记「输入法正在处理的按键」的共同口径。
 */
export const isImeComposing = (event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean =>
  event.isComposing || event.keyCode === 229;
