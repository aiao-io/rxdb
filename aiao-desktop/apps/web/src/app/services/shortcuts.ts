import { menuShortcuts } from './aria';
import { MenuCommand } from './menu';

/** 键盘事件里与快捷键匹配相关的字段（便于单测直接构造）。 */
export interface ShortcutEvent {
  readonly key: string;
  readonly code?: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** 只按下修饰键本身时不当作快捷键。 */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/**
 * 桌面对「浏览器自己的快捷键」的统一处理：菜单没有认领时拦下它们，不让 Chrome 的查找、刷新、
 * 地址栏、新标签、打印、保存网页、页面缩放、切换标签与前进后退出现在桌面里。
 * 只列确实会打断桌面语义的组合；⌘C / ⌘V 等编辑键在输入态由浏览器处理。
 */
const BROWSER_KEYS: ReadonlySet<string> = new Set([
  'f',
  'r',
  'l',
  't',
  'o',
  'p',
  's',
  'e',
  'y',
  'n',
  'w',
  'd',
  'g',
  'j',
  ...Array.from({ length: 10 }, (_, index) => String(index)),
  '+',
  '-',
  '[',
  ']'
]);

/** 有且只有一个「主修饰键」：macOS 的 ⌘，或 Windows / Linux 上的 Ctrl。 */
export function hasPrimaryModifier(event: ShortcutEvent): boolean {
  return event.metaKey !== event.ctrlKey;
}

/**
 * 事件里的按键名，与菜单字形解析后的写法对齐：空格写成 `Space`，字母转大写，
 * 句点按物理键判定（Shift 会把 `event.key` 变成 `>`），`⌘=` 与 `⌘+` 视为同一个组合。
 */
export function shortcutKey(event: ShortcutEvent): string | null {
  if (event.code === 'Period') return '.';
  if (event.code === 'Space' || event.key === ' ') return 'Space';
  if (event.key.length === 1) {
    if (event.key === '=' && (event.metaKey || event.ctrlKey)) return '+';
    return event.key.toUpperCase();
  }
  return MODIFIER_KEYS.has(event.key) ? null : event.key;
}

/**
 * 这次按键对应的组合写法（与 `aria-keyshortcuts` 的修饰键顺序一致）。
 * `+` 与 `?` 本身要靠 Shift 打出，所以同时接受「带 Shift」与「不带 Shift」两种写法。
 */
export function eventShortcuts(event: ShortcutEvent): readonly string[] {
  const key = shortcutKey(event);
  if (key === null) return [];
  const combo = (shift: boolean): string =>
    [
      event.ctrlKey ? 'Control' : null,
      event.altKey ? 'Alt' : null,
      shift ? 'Shift' : null,
      event.metaKey ? 'Meta' : null,
      key
    ]
      .filter((part): part is string => part !== null)
      .join('+');
  const needsShift = key === '+' || key === '?';
  return needsShift ? [combo(event.shiftKey), combo(false)] : [combo(event.shiftKey)];
}

/** 这个事件是否命中菜单项声明的快捷键。 */
export function matchesShortcut(command: MenuCommand, event: ShortcutEvent): boolean {
  const pressed = eventShortcuts(event);
  return menuShortcuts(command).some(shortcut => pressed.includes(shortcut));
}

/** 输入框 / 可编辑区里交给浏览器处理的文本编辑快捷键：撤销、重做、剪切、复制、粘贴、全选。 */
export function isTextEditingShortcut(event: ShortcutEvent): boolean {
  if (event.altKey || !hasPrimaryModifier(event)) return false;
  return ['a', 'c', 'x', 'v', 'y', 'z'].includes(event.key.toLowerCase());
}

/** 单独的 Space（没有修饰键）：音乐播放这类菜单命令会用到。 */
export function isPlainSpace(event: ShortcutEvent): boolean {
  return event.key === ' ' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
}

/** 菜单没认领时应该拦下的浏览器快捷键。 */
export function isBrowserShortcut(event: ShortcutEvent): boolean {
  if (!hasPrimaryModifier(event) || event.altKey) return false;
  const key = shortcutKey(event);
  return key !== null && BROWSER_KEYS.has(key.toLowerCase());
}
