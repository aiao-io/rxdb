import type { MenuCommand } from './menu';

/** 菜单里显示用的修饰键字形 → `aria-keyshortcuts` 里的修饰键名。 */
const MODIFIERS: Readonly<Record<string, string>> = { '⌃': 'Control', '⌥': 'Alt', '⇧': 'Shift', '⌘': 'Meta' };

/** 菜单里显示用的功能键字形 → DOM `key` 名称。 */
const NAMED_KEYS: Readonly<Record<string, string>> = {
  '⌫': 'Backspace',
  '⎋': 'Escape',
  '⏎': 'Enter',
  '␣': 'Space',
  '⇥': 'Tab'
};

/** 菜单快捷键里出现的单字符按键：字母、数字与标点。 */
const PLAIN_KEY = /^[A-Za-z0-9`,.?/;'[\]\\=-]$/;

/**
 * 把菜单里显示的快捷键字形（`⇧⌘N`）转成 `aria-keyshortcuts` 的写法（`Shift+Meta+N`），读屏据此报出快捷键，
 * 而不是把「⌘N」当文字念进菜单项的名称。不是快捷键的提示文字（子菜单箭头 `▸`、`1 update`）返回 `null`。
 */
export function ariaShortcut(glyphs: string): string | null {
  const parts: string[] = [];
  let key: string | null = null;
  for (const char of glyphs) {
    if (Object.hasOwn(MODIFIERS, char)) {
      parts.push(MODIFIERS[char]);
      continue;
    }
    if (key !== null) return null;
    if (Object.hasOwn(NAMED_KEYS, char)) key = NAMED_KEYS[char];
    else if (PLAIN_KEY.test(char)) key = char.toUpperCase();
    else return null;
  }
  return key === null ? null : [...parts, key].join('+');
}

/** 一个菜单命令在无障碍树里的角色与状态。 */
export interface MenuItemAria {
  /** 声明了 `checked` 的命令是带勾选状态的 `menuitemcheckbox`，其余是 `menuitem`。 */
  readonly role: 'menuitem' | 'menuitemcheckbox';
  /** 勾选状态；没有勾选语义时为 `null`（不写 `aria-checked`）。 */
  readonly checked: boolean | null;
  /** `aria-keyshortcuts` 的值；没有快捷键时为 `null`。 */
  readonly shortcut: string | null;
}

/** 菜单命令的角色、勾选状态与快捷键（禁用状态由调用方直接读 `command.disabled`）。 */
export function menuItemAria(command: MenuCommand): MenuItemAria {
  return {
    role: command.checked === undefined ? 'menuitem' : 'menuitemcheckbox',
    checked: command.checked ?? null,
    shortcut: command.key ? ariaShortcut(command.key) : null
  };
}

/** 菜单栏右侧的状态图标。 */
export type StatusKey = 'bt' | 'vol' | 'batt' | 'wifi' | 'spot' | 'cc' | 'clock';

/** 状态图标可读名称要用到的系统状态。 */
export interface StatusSnapshot {
  readonly bluetooth: boolean;
  readonly wifi: boolean;
  readonly wifiName: string;
  /** 电量百分比（0～100）。 */
  readonly battery: number;
  readonly charging: boolean;
  /** 音量（0～1）。 */
  readonly volume: number;
  readonly muted: boolean;
}

/**
 * 状态图标的可读名称：图标本身只是个字形，读屏要听到「是什么」和「现在什么状态」。
 * 可见文字（电量的 84%）包含在名称里，语音控制按看到的字说话也叫得到它。时钟的名称就是它的可见文字，不在这里。
 */
export function statusLabel(key: Exclude<StatusKey, 'clock'>, state: StatusSnapshot): string {
  switch (key) {
    case 'bt':
      return `Bluetooth, ${state.bluetooth ? 'on' : 'off'}`;
    case 'wifi':
      return state.wifi ? `Wi-Fi, ${state.wifiName}` : 'Wi-Fi, off';
    case 'batt':
      return `Battery, ${state.battery}%${state.charging ? ', charging' : ''}`;
    case 'vol':
      return state.muted || state.volume === 0 ? 'Sound, muted' : `Sound, ${Math.round(state.volume * 100)}%`;
    case 'spot':
      return 'Spotlight';
    case 'cc':
      return 'Control Centre';
  }
}

/** 窗口对无障碍树可见性的相关状态。 */
export interface WindowVisibility {
  readonly focused: boolean;
  readonly minimized: boolean;
  readonly closing: boolean;
}

/** 窗口要不要对读屏隐藏：只暴露前台窗口的内容；后台、已最小化、正在关闭的窗口都隐藏。 */
export const windowHidden = (state: WindowVisibility): boolean => !state.focused || state.minimized || state.closing;
