import { describe, expect, it } from 'vitest';

import { StatusSnapshot, ariaShortcut, menuItemAria, statusLabel, windowHidden } from './aria';

const SNAPSHOT: StatusSnapshot = {
  bluetooth: true,
  wifi: true,
  wifiName: 'Home',
  battery: 84,
  charging: false,
  volume: 0.63,
  muted: false
};

describe('ariaShortcut 菜单快捷键字形转 aria-keyshortcuts', () => {
  it('修饰键与按键各取 ARIA 的写法，顺序保持菜单里显示的顺序', () => {
    expect(ariaShortcut('⌘N')).toBe('Meta+N');
    expect(ariaShortcut('⇧⌘N')).toBe('Shift+Meta+N');
    expect(ariaShortcut('⌥⌘S')).toBe('Alt+Meta+S');
    expect(ariaShortcut('⌃⌘F')).toBe('Control+Meta+F');
    expect(ariaShortcut('⌃⌘Q')).toBe('Control+Meta+Q');
  });

  it('标点与数字按键原样给出，字母统一大写', () => {
    expect(ariaShortcut('⌘`')).toBe('Meta+`');
    expect(ariaShortcut('⌘,')).toBe('Meta+,');
    expect(ariaShortcut('⌘?')).toBe('Meta+?');
    expect(ariaShortcut('⌘1')).toBe('Meta+1');
    expect(ariaShortcut('⌘n')).toBe('Meta+N');
  });

  it('功能键与编辑键的字形换成 DOM key 名称', () => {
    expect(ariaShortcut('⌘⌫')).toBe('Meta+Backspace');
    expect(ariaShortcut('⌥⌘⎋')).toBe('Alt+Meta+Escape');
    expect(ariaShortcut('⌃⌥⏎')).toBe('Control+Alt+Enter');
    expect(ariaShortcut('␣')).toBe('Space');
  });

  it('不是快捷键的提示文字（子菜单箭头、更新计数）返回 null，不编一个出来', () => {
    expect(ariaShortcut('▸')).toBeNull();
    expect(ariaShortcut('1 update')).toBeNull();
    expect(ariaShortcut('')).toBeNull();
  });

  it('只有修饰键没有按键，或者有两个按键，都不是合法快捷键', () => {
    expect(ariaShortcut('⌘⇧')).toBeNull();
    expect(ariaShortcut('⌘NM')).toBeNull();
  });
});

describe('menuItemAria 菜单项的角色与状态', () => {
  it('普通命令是 menuitem，没有勾选状态', () => {
    expect(menuItemAria({ id: 'a', label: 'New Window', key: '⌘N' })).toEqual({
      role: 'menuitem',
      checked: null,
      shortcut: 'Meta+N'
    });
  });

  it('声明了 checked 的命令是 menuitemcheckbox，勾选与否都要报出来', () => {
    expect(menuItemAria({ id: 'a', label: 'Show Toolbar', checked: true }).role).toBe('menuitemcheckbox');
    expect(menuItemAria({ id: 'a', label: 'Show Toolbar', checked: true }).checked).toBe(true);
    expect(menuItemAria({ id: 'b', label: 'Hide Toolbar', checked: false }).checked).toBe(false);
  });

  it('没有快捷键的命令 shortcut 为 null；有「▸」之类的提示也不当作快捷键', () => {
    expect(menuItemAria({ id: 'a', label: 'Open With', key: '▸' }).shortcut).toBeNull();
    expect(menuItemAria({ id: 'b', label: 'Sleep' }).shortcut).toBeNull();
  });
});

describe('statusLabel 菜单栏状态图标的可读名称', () => {
  it('蓝牙与 Wi-Fi 报出开关状态，Wi-Fi 开着时带网络名', () => {
    expect(statusLabel('bt', SNAPSHOT)).toBe('Bluetooth, on');
    expect(statusLabel('bt', { ...SNAPSHOT, bluetooth: false })).toBe('Bluetooth, off');
    expect(statusLabel('wifi', SNAPSHOT)).toBe('Wi-Fi, Home');
    expect(statusLabel('wifi', { ...SNAPSHOT, wifi: false })).toBe('Wi-Fi, off');
  });

  it('电量带百分比，充电时多一句 charging（可见文字里的 84% 包含在名称里）', () => {
    expect(statusLabel('batt', SNAPSHOT)).toBe('Battery, 84%');
    expect(statusLabel('batt', { ...SNAPSHOT, charging: true })).toBe('Battery, 84%, charging');
  });

  it('音量取整成百分比；静音或音量为 0 报 muted', () => {
    expect(statusLabel('vol', SNAPSHOT)).toBe('Sound, 63%');
    expect(statusLabel('vol', { ...SNAPSHOT, muted: true })).toBe('Sound, muted');
    expect(statusLabel('vol', { ...SNAPSHOT, volume: 0 })).toBe('Sound, muted');
  });

  it('聚焦搜索与控制中心的名称固定', () => {
    expect(statusLabel('spot', SNAPSHOT)).toBe('Spotlight');
    expect(statusLabel('cc', SNAPSHOT)).toBe('Control Centre');
  });
});

describe('windowHidden 后台窗口对读屏隐藏', () => {
  it('只有前台、没有最小化、没有关闭中的窗口才暴露给读屏', () => {
    expect(windowHidden({ focused: true, minimized: false, closing: false })).toBe(false);
    expect(windowHidden({ focused: false, minimized: false, closing: false })).toBe(true);
    expect(windowHidden({ focused: true, minimized: true, closing: false })).toBe(true);
    expect(windowHidden({ focused: true, minimized: false, closing: true })).toBe(true);
  });
});
