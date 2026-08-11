/**
 * 判断给定对象是否处于 Tauri 运行时。
 *
 * @param value - 待检测对象，实际调用时传 `window`
 * @returns 对象上存在 `__TAURI_INTERNALS__` 时为 `true`
 *
 * @remarks
 * 参数化而非直接读全局 `window`，是为了让判定逻辑在测试里可覆盖 ——
 * 浏览器预览与桌面窗口的分支都要能跑到。
 */
export function isTauriRuntime(value: unknown): boolean {
  return typeof value === 'object' && value !== null && '__TAURI_INTERNALS__' in value;
}
