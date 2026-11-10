import { effectiveModifiers } from './modifiers.js';

/** 运行平台：决定 `Mod` 对应的修饰键与键帽写法。 */
export type ShortcutPlatform = 'mac' | 'other';

/** 键盘事件的最小契约，`KeyboardEvent` 天然满足。 */
export interface KeyEventLike {
  /** 产生的字符值。 */
  readonly key: string;
  /** 物理键位。 */
  readonly code: string;
  /** Ctrl 是否按下。 */
  readonly ctrlKey: boolean;
  /** Meta（Command / Windows）是否按下。 */
  readonly metaKey: boolean;
  /** Alt（Option）是否按下。 */
  readonly altKey: boolean;
  /** Shift 是否按下。 */
  readonly shiftKey: boolean;
}

/** 解析后的组合键。 */
export interface ParsedCombo {
  /** 主键，小写的 `event.key` 形式。 */
  readonly key: string;
  /** `Mod`：mac 为 Command，其他平台为 Ctrl。 */
  readonly mod: boolean;
  /** 显式 Ctrl。 */
  readonly ctrl: boolean;
  /** 显式 Meta。 */
  readonly meta: boolean;
  /** Alt / Option。 */
  readonly alt: boolean;
  /** Shift。 */
  readonly shift: boolean;
}

const MODIFIERS = new Set(['mod', 'ctrl', 'control', 'meta', 'cmd', 'command', 'alt', 'option', 'shift']);

const KEY_ALIASES: Readonly<Record<string, string>> = {
  esc: 'escape',
  space: ' ',
  plus: '+',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown'
};

const PHYSICAL_CODES: Readonly<Record<string, string>> = {
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '-': 'Minus',
  '=': 'Equal'
};

const physicalCode = (key: string): string | undefined => {
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return PHYSICAL_CODES[key];
};

/**
 * 解析组合键文本，如 `Mod+K`、`Alt+Shift+L`、`Mod+,`。
 * @param combo - 以 `+` 连接的修饰键与主键；主键为加号时写 `Plus`。
 * @returns 解析结果。
 * @throws 缺少主键、主键不唯一或文本为空时抛错。
 */
export function parseCombo(combo: string): ParsedCombo {
  const parts = combo.split('+').map(part => part.trim().toLowerCase());
  const keys = parts.filter(part => !MODIFIERS.has(part));
  if (keys.length !== 1 || keys[0] === '') throw new Error(`Invalid shortcut combo "${combo}"`);
  const has = (...names: string[]): boolean => parts.some(part => names.includes(part));
  return {
    key: KEY_ALIASES[keys[0]] ?? keys[0],
    mod: has('mod'),
    ctrl: has('ctrl', 'control'),
    meta: has('meta', 'cmd', 'command'),
    alt: has('alt', 'option'),
    shift: has('shift')
  };
}

const keyMatches = (event: KeyEventLike, combo: ParsedCombo): boolean => {
  if (event.key.toLowerCase() === combo.key) return true;
  // Alt 会改变 event.key（macOS 的 Option+L 是 ¬），含 Alt 的组合改按物理键位匹配
  return combo.alt && event.code !== '' && event.code === physicalCode(combo.key);
};

/**
 * 判断键盘事件是否命中组合键；修饰键必须完全一致，多余的修饰键不匹配。
 * @param event - 键盘事件。
 * @param combo - 解析后的组合键。
 * @param platform - 运行平台。
 * @returns 命中返回 `true`。
 */
export function matchesCombo(event: KeyEventLike, combo: ParsedCombo, platform: ShortcutPlatform): boolean {
  const want = effectiveModifiers(combo, platform);
  return (
    event.metaKey === want.meta &&
    event.ctrlKey === want.ctrl &&
    event.altKey === combo.alt &&
    event.shiftKey === combo.shift &&
    keyMatches(event, combo)
  );
}

const MAC_SYMBOLS = { mod: '⌘', ctrl: '⌃', meta: '⌘', alt: '⌥', shift: '⇧' } as const;
const OTHER_NAMES = { mod: 'Ctrl', ctrl: 'Ctrl', meta: 'Win', alt: 'Alt', shift: 'Shift' } as const;
const KEY_LABELS: Readonly<Record<string, { mac: string; other: string }>> = {
  escape: { mac: 'Esc', other: 'Esc' },
  ' ': { mac: 'Space', other: 'Space' },
  arrowleft: { mac: '←', other: '←' },
  arrowright: { mac: '→', other: '→' },
  arrowup: { mac: '↑', other: '↑' },
  arrowdown: { mac: '↓', other: '↓' }
};

/** 格式化后的键帽。 */
export interface FormattedCombo {
  /** 逐个键帽，供界面逐个渲染。 */
  readonly keys: string[];
  /** 连成一行的文本：mac 以空格连接，其他平台以加号连接。 */
  readonly text: string;
}

/**
 * 把组合键格式化成键帽。
 * @param combo - 解析后的组合键。
 * @param platform - 运行平台。
 * @returns 键帽列表与连接后的文本。
 */
export function formatCombo(combo: ParsedCombo, platform: ShortcutPlatform): FormattedCombo {
  const names = platform === 'mac' ? MAC_SYMBOLS : OTHER_NAMES;
  const modifiers: string[] = [];
  if (combo.mod) modifiers.push(names.mod);
  if (combo.ctrl) modifiers.push(names.ctrl);
  if (combo.meta) modifiers.push(names.meta);
  if (combo.alt) modifiers.push(names.alt);
  if (combo.shift) modifiers.push(names.shift);
  const label = KEY_LABELS[combo.key]?.[platform] ?? combo.key.toUpperCase();
  const keys = [...modifiers, label];
  return { keys, text: keys.join(platform === 'mac' ? ' ' : '+') };
}

/** `navigator` 里与平台判断相关的字段。 */
export interface PlatformSource {
  /** 已废弃但普遍可用的平台名。 */
  readonly platform?: string;
  /** UA 字符串。 */
  readonly userAgent?: string;
  /** UA Client Hints。 */
  readonly userAgentData?: { readonly platform?: string };
}

/**
 * 判断运行平台。
 * @param source - `navigator`；缺省（SSR / 测试）视为 `other`。
 * @returns `mac`（含 iOS）或 `other`。
 */
export function detectPlatform(source: PlatformSource | undefined): ShortcutPlatform {
  const text = `${source?.userAgentData?.platform ?? ''} ${source?.platform ?? ''} ${source?.userAgent ?? ''}`;
  return /Mac|iPhone|iPad|iPod/i.test(text) ? 'mac' : 'other';
}
