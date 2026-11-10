import type { ParsedCombo, ShortcutPlatform } from './combo.js';

/**
 * 组合键在给定平台上实际要求按下的 Meta 与 Ctrl：`Mod` 在 mac 是 Command（Meta），其他平台是 Ctrl。
 * 事件匹配与注册时的冲突判定共用这一份解析，两者不会对同一组合键得出不同结论。
 * @param combo - 解析后的组合键。
 * @param platform - 运行平台。
 * @returns 实际要求的 Meta 与 Ctrl。
 */
export function effectiveModifiers(
  combo: ParsedCombo,
  platform: ShortcutPlatform
): { readonly meta: boolean; readonly ctrl: boolean } {
  return {
    meta: combo.meta || (combo.mod && platform === 'mac'),
    ctrl: combo.ctrl || (combo.mod && platform === 'other')
  };
}
