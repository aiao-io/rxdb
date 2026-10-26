/**
 * @fileoverview IME 组字判定（Angular 端 `working-tree.ime.ts` 的同名移植）。
 *
 * @remarks
 * 回车提交与 Escape 关闭在组字期间都要让给输入法：中文 / 日文输入法用回车确认候选词、
 * 用 Escape 取消组字，这两下不该顺手把表单提交出去或把弹层关掉。
 */

/**
 * 这次按键是否落在 IME 组字过程中。
 *
 * @param event - 原生键盘事件；React 端传 `event.nativeEvent`（合成事件上没有 `isComposing`）
 * @returns 组字中返回 `true`，调用方应当忽略这次按键
 *
 * @remarks
 * 只看 `isComposing` 不够：Safari 提交组字的那一下回车报 `isComposing=false`、`keyCode` 229，
 * 不认 229 的话，选完词按的那一下回车照样会提交。
 */
export const isImeComposing = (event: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean =>
  event.isComposing || event.keyCode === 229;
