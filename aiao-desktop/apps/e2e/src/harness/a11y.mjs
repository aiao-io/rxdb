import { passes } from './helpers.mjs';

/**
 * 页面里当前键盘焦点元素的描述（在页面内执行，不能引用外部变量）；焦点落在 `body` 上、或已经离开文档时为 `null`。
 * `region` 是它所在的桌面区域：弹出层、启动台、聚焦搜索、通知中心、菜单栏、窗口、Dock、桌面、锁屏、开机画面。
 */
const DESCRIBE_FOCUS = () => {
  const element = document.activeElement;
  if (!element || element === document.body || element === document.documentElement) return null;
  const regions = [
    ['popover', '#layer-menu'],
    ['launchpad', '#lpad'],
    ['spotlight', '#spot'],
    ['notifications', '#nc'],
    ['menubar', '#menubar'],
    ['window', '.win'],
    ['dock', '#dockwrap'],
    ['desktop', '#desktop'],
    ['lock', '#lock'],
    ['boot', '#boot']
  ];
  const region = regions.find(([, selector]) => element.closest(selector))?.[0] ?? 'other';
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const label = element.getAttribute('aria-label');
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  const win = element.closest('.win');
  return {
    region,
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    role: element.getAttribute('role'),
    name: label ?? text,
    text,
    app: element.dataset.app ?? win?.dataset.app ?? null,
    windowName: win?.getAttribute('aria-label') ?? null,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    visible:
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < innerWidth &&
      rect.top < innerHeight,
    hiddenByAria: element.closest('[aria-hidden="true"]') !== null,
    focusVisible: element.matches(':focus-visible'),
    outline: `${style.outlineStyle} ${style.outlineWidth}`
  };
};

/** 当前键盘焦点元素的描述（见 {@link DESCRIBE_FOCUS}）。 */
export const focusInfo = page => page.evaluate(DESCRIBE_FOCUS);

/** 反复检查，直到 `check` 返回 true 或超时；返回有没有等到。条件等待，不用固定延时。 */
export async function eventually(check, { timeout = 10_000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return true;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}

/** 等页面里的条件成立（在页面内求值）。 */
export const until = (page, condition, argument, timeout = 10_000) =>
  passes(page.waitForFunction(condition, argument, { timeout, polling: 100 }));

/** 等键盘焦点到达满足 `predicate` 的元素（`predicate` 收到 {@link focusInfo} 的结果）。 */
export const focusReaches = (page, predicate, timeout = 8_000) =>
  eventually(
    async () => {
      const info = await focusInfo(page);
      return info !== null && predicate(info);
    },
    { timeout }
  );

/**
 * 反复按 `key`（默认 Tab），直到焦点落在满足 `predicate` 的元素上；最多按 `max` 次。
 * 返回途中经过的每一个停靠点（不含 `null`），最后一个满足条件（没找到时最后一个不满足）。纯键盘到达，不用脚本聚焦。
 */
export async function pressUntil(page, predicate, { key = 'Tab', max = 140 } = {}) {
  const stops = [];
  for (let step = 0; step < max; step++) {
    await page.keyboard.press(key);
    const info = await focusInfo(page);
    if (info) stops.push(info);
    if (info && predicate(info)) return { found: true, stops };
  }
  return { found: false, stops };
}

/**
 * 从当前位置一路按 Tab，记录每个停靠点，直到焦点离开文档（`body`）、绕回第一个停靠点，或达到 `max`。
 * `ended` 说明为什么停：`left`（焦点离开了文档）、`wrapped`（绕回了起点）、`max`。
 */
export async function tabWalk(page, { key = 'Tab', max = 160 } = {}) {
  const stops = [];
  for (let step = 0; step < max; step++) {
    await page.keyboard.press(key);
    const info = await focusInfo(page);
    if (info === null) return { stops, ended: 'left' };
    const first = stops[0];
    if (first && info.region === first.region && info.name === first.name && info.x === first.x && info.y === first.y)
      return { stops, ended: 'wrapped' };
    stops.push(info);
  }
  return { stops, ended: 'max' };
}

/** 停靠点的简短写法，失败时贴在输出里。 */
export const brief = info => (info ? `${info.region}:${info.role ?? info.tag}:${info.name}` : 'BODY');

/** `text`（无障碍树快照）里依次出现 `fragments`；返回缺少的片段（空数组表示都在、顺序也对）。 */
export function missingInOrder(text, fragments) {
  const missing = [];
  let from = 0;
  for (const fragment of fragments) {
    const at = text.indexOf(fragment, from);
    if (at < 0) missing.push(fragment);
    else from = at + fragment.length;
  }
  return missing;
}

/** `names` 里依次出现 `expected`（逐项完全相等，中间可以夹别的）；返回缺少的名称（空数组表示都在、顺序也对）。 */
export function missingNamesInOrder(names, expected) {
  const missing = [];
  let from = 0;
  for (const name of expected) {
    const at = names.indexOf(name, from);
    if (at < 0) missing.push(name);
    else from = at + 1;
  }
  return missing;
}

/** 无障碍树快照里没有名称的交互元素（`- button` 后面没有引号里的名称）。 */
export function unnamedControls(snapshot) {
  const roles = 'button|menuitem|menuitemcheckbox|checkbox|switch|slider|combobox|textbox|option|tab|link|radio';
  return snapshot
    .split('\n')
    .filter(line => new RegExp(`^\\s*- (${roles})( \\[[^\\]]+\\])*(:.*)?$`).test(line))
    .map(line => line.trim());
}

/**
 * 在页面里统计没有隐藏的 SVG：屏幕上的每个 SVG 都应当 `aria-hidden="true"`（或在 `aria-hidden` 的祖先里），
 * 带图的控件靠 `aria-label` 命名，图本身是装饰。返回不合格的 SVG 的位置描述。
 */
export const exposedSvgs = (page, rootSelector) =>
  page.evaluate(selector => {
    const root = document.querySelector(selector);
    if (!root) return [`找不到 ${selector}`];
    return [...root.querySelectorAll('svg')]
      .filter(svg => !svg.closest('[aria-hidden="true"]') && svg.getAttribute('aria-hidden') !== 'true')
      .filter(svg => svg.getClientRects().length > 0)
      .map(svg => `${svg.parentElement?.tagName.toLowerCase()}.${svg.parentElement?.className ?? ''}`.slice(0, 80));
  }, rootSelector);
