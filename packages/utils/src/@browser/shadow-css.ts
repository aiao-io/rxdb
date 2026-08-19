/**
 * 无界 Shadow DOM 的 daisyUI 样式改写。
 *
 * 子应用在 Shadow DOM 里跑时有两个错位：
 *
 * 1. `:root` 只匹配文档根元素，Shadow 树里匹配不到任何东西 —— daisyUI 画页面底色的
 *    `:root{background-color:var(--root-bg)}` 直接失效。改写成 `:host` 打到宿主元素上。
 * 2. daisyUI 的具名主题选择器 `[data-theme=X]` 是硬编码的，不受 `root` 配置影响。
 *    子应用把 `data-theme` 写在 Shadow 内的 `<html>` 上，够不到宿主元素 —— 于是宿主只能
 *    命中 `:is(:host,:root):not([data-theme])` 的默认分支，底色被钉死在默认主题上。
 *    这里给每条具名主题规则补一份 `:host([data-theme=X])`，由宿主给自己打 `data-theme`
 *    把主题从外往内推。
 *
 * 原选择器一律保留，独立打开子应用（非无界）时的 `:root` / `<html>` 路径不受影响。
 */

/** 宿主元素上承载主题的属性名，与 daisyUI 具名主题选择器一致。 */
export const HOST_THEME_ATTRIBUTE = 'data-theme';

/** 选择器开头的 `[data-theme=X]`，捕获属性值（允许带引号）。 */
const THEME_PREFIX = /^\s*\[data-theme=("[^"]*"|'[^']*'|[^\]]*)\]/;

/** 每个规则块的 prelude（`{` 之前的部分）。`[^{}]` 保证不跨越相邻规则。 */
const RULE_PRELUDE = /([^{}]*)\{/g;

/**
 * 按顶层逗号切分选择器列表。
 *
 * 括号与引号内的逗号不切 —— daisyUI 会生成 `:is(:host,:root):has(...)` 这种嵌套逗号，
 * 直接 `split(',')` 会把它撕成非法选择器。
 */
function splitSelectorList(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let quote: string | undefined;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quote) {
      if (char === quote && input[i - 1] !== '\\') quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(' || char === '[') {
      depth++;
    } else if (char === ')' || char === ']') {
      depth--;
    } else if (char === ',' && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(input.slice(start));
  return parts;
}

/**
 * 把 `[data-theme=X]<rest>` 扩展成 `:host([data-theme=X])<rest>` + 原选择器。
 *
 * 只在**前缀**位置扩展：`.wrap [data-theme=dark]` 的主题属性在后代上，提升到 `:host`
 * 会让规则错误地作用于整个宿主。
 */
function expandThemeSelector(selector: string): string[] {
  const matched = THEME_PREFIX.exec(selector);
  if (!matched) return [selector];
  const rest = selector.slice(matched[0].length);
  return [`:host([${HOST_THEME_ATTRIBUTE}=${matched[1]}])${rest}`, selector];
}

/** 扩展整个选择器列表并去重，保证重复改写是幂等的。 */
function expandSelectorList(selectorList: string): string {
  const expanded = splitSelectorList(selectorList)
    .flatMap(expandThemeSelector)
    .map(selector => selector.trim());
  return [...new Set(expanded)].join(',');
}

/**
 * 改写子应用 CSS，使其在无界 Shadow DOM 中正确响应宿主下发的主题。
 *
 * 作为无界 `plugins[].cssLoader` 使用。函数是幂等的。
 *
 * @param code - 子应用原始 CSS
 * @returns 改写后的 CSS；`@media` / `@property` / `@keyframes` 等 at-rule 的 prelude 保持原样
 */
export function rewriteShadowCss(code: string): string {
  return code.replaceAll(':root', ':host').replace(RULE_PRELUDE, (full, prelude: string) => {
    // prelude 可能粘着上一条以 `;` 结尾的语句（如 `@charset "utf-8";.a`），只取最后一段当选择器
    const cut = prelude.lastIndexOf(';');
    const head = cut === -1 ? '' : prelude.slice(0, cut + 1);
    const selectorList = cut === -1 ? prelude : prelude.slice(cut + 1);
    if (!selectorList.trim() || selectorList.includes('@')) return full;
    return `${head}${expandSelectorList(selectorList)}{`;
  });
}
