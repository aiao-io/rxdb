/**
 * 这次 `click` 是键盘（Enter、空格）或读屏的「按下」触发的，不是鼠标：它们的 `detail`（连击次数）是 0，鼠标点击至少是 1。
 * 鼠标点击在 `mousedown` 上已经处理过，这里只处理没有鼠标按下过的那一类，两条路径各管各的，不会重复触发。
 */
export const isKeyboardClick = (event: { readonly detail: number }): boolean => event.detail === 0;

/**
 * 焦点陷阱里 Tab 的去向。`items` 是陷阱内可以 Tab 到的元素（文档顺序），`active` 是当前焦点。
 * 到了两端就绕回另一端；中间的元素返回 `null`，让浏览器按文档顺序自己移动。
 * 焦点不在 `items` 里（陷阱容器自己、没有焦点）时，向前去第一个、向后去最后一个。
 * `items` 为空时也返回 `null`：调用方要拦下按键，把焦点留在容器上，不能让它漏到陷阱外面。
 */
export function tabTarget<T>(items: readonly T[], active: T | null, backwards: boolean): T | null {
  if (items.length === 0) return null;
  const at = active === null ? -1 : items.indexOf(active);
  const first = items[0];
  const last = items[items.length - 1];
  if (backwards) return at <= 0 ? last : null;
  return at === -1 || at === items.length - 1 ? first : null;
}

/**
 * 菜单栏里左右方向键、Home、End 在 `count` 个条目里要去的下标；不是这几个键时为 `null`
 * （上下方向键是展开菜单，不归它）。焦点不在任何条目上（`at` 为 -1）时，向右去第一项，向左去最后一项。
 */
export function barIndex(key: string, at: number, count: number): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowRight') return (at + 1) % count;
  if (key === 'ArrowLeft') return at < 0 ? count - 1 : (at - 1 + count) % count;
  return null;
}

/**
 * 菜单里按首字母跳转：从 `at` 之后找第一个以 `typed` 开头的标签（不区分大小写），找到末尾绕回开头。
 * `typed` 不是单个可打印字符（修饰键、功能键、空格）或没有匹配时为 `null`；`at` 为 -1 时从第一项找起。
 */
export function typeaheadIndex(labels: readonly string[], at: number, typed: string): number | null {
  if (typed.length !== 1 || typed.trim() === '') return null;
  const wanted = typed.toLowerCase();
  for (let step = 1; step <= labels.length; step++) {
    const index = (at + step + labels.length) % labels.length;
    if (labels[index].toLowerCase().startsWith(wanted)) return index;
  }
  return null;
}

/** 滑块方向键每次移动的比例。 */
const SLIDER_STEP = 0.05;
/** 滑块 PageUp / PageDown 每次移动的比例。 */
const SLIDER_PAGE = 0.1;

/**
 * 滑块（0～1）收到按键后的新值：方向键 5%，翻页键 10%，Home / End 到两端，结果夹在 0～1 并取整到百分位
 * （免得 0.05 反复相加累积出浮点误差）。不是滑块的按键返回 `null`；已在边界上时返回原值，调用方据此知道没有变化。
 */
export function sliderValue(key: string, value: number): number | null {
  const moves: Readonly<Record<string, number>> = {
    ArrowRight: SLIDER_STEP,
    ArrowUp: SLIDER_STEP,
    ArrowLeft: -SLIDER_STEP,
    ArrowDown: -SLIDER_STEP,
    PageUp: SLIDER_PAGE,
    PageDown: -SLIDER_PAGE
  };
  if (key === 'Home') return 0;
  if (key === 'End') return 1;
  if (!Object.hasOwn(moves, key)) return null;
  return Math.min(1, Math.max(0, Math.round((value + moves[key]) * 100) / 100));
}
