/** 选择菜单项后让焦点离开，DaisyUI 的 `:focus-within` 下拉随之收起。 */
export function blurActive(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

/**
 * 语言的自称显示名，如 `zh-Hans` → `简体中文`。
 * @param locale - 语言标签。
 * @returns 显示名；运行时不认识该语言标签时回到标签本身。
 */
export function localeLabel(locale: string): string {
  return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
}
