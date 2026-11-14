/**
 * 应用上下文用的系统剪贴板（ADESK-US-206 阶段 D，`clipboard` 能力）：浏览器的异步剪贴板加用户手势的判断。
 * 影响范围是用户机器的系统剪贴板，不是虚拟磁盘。权限怎么问、用户拒不拒绝由浏览器决定，这里不替它兜底：
 * 浏览器拒绝时抛出的就是浏览器的 `NotAllowedError` / `SecurityError`，由应用上下文归成 `BROWSER_PERMISSION_DENIED`。
 */
export interface AppContextClipboard {
  /** 读取剪贴板文本（浏览器的权限提示决定能不能读）。 */
  readText(): Promise<string>;
  /** 写入剪贴板文本。 */
  writeText(text: string): Promise<void>;
  /**
   * 宿主页面此刻有没有有效的用户手势（`navigator.userActivation.isActive`）：跨源 iframe 里的点击会把激活传给祖先文档，
   * 所以应用 iframe 里的点击之后短时间内它为 true。浏览器不提供这个接口时为 false——宿主不替用户在没有手势时写剪贴板。
   */
  userActive(): boolean;
}

/** 浏览器没有提供异步剪贴板（非安全上下文）：按浏览器拒绝处理，应用拿到 `BROWSER_PERMISSION_DENIED`。 */
function unavailable(): DOMException {
  return new DOMException('这个浏览器环境没有提供异步剪贴板', 'NotAllowedError');
}

/** 用浏览器的 `navigator` 实现 {@link AppContextClipboard}。 */
export function browserClipboard(nav: Navigator = navigator): AppContextClipboard {
  const clipboard = (): Clipboard => {
    if (!nav.clipboard) throw unavailable();
    return nav.clipboard;
  };
  return {
    readText: async () => clipboard().readText(),
    writeText: async text => clipboard().writeText(text),
    userActive: () => nav.userActivation?.isActive === true
  };
}
