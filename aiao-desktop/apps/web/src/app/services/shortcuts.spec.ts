import { describe, expect, it } from 'vitest';

import { MenuCommand } from './menu';
import {
  eventShortcuts,
  hasPrimaryModifier,
  isBrowserShortcut,
  isPlainSpace,
  isTextEditingShortcut,
  matchesShortcut,
  shortcutKey
} from './shortcuts';

const at = (init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent =>
  ({
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...init
  }) as KeyboardEvent;

const command = (key: string): MenuCommand => ({ id: 'x', label: 'X', key });

describe('shortcutKey 按键名对齐菜单写法', () => {
  it('字母转大写，空格与方向键用具名写法', () => {
    expect(shortcutKey(at({ key: 'k' }))).toBe('K');
    expect(shortcutKey(at({ key: ' ' }))).toBe('Space');
    expect(shortcutKey(at({ key: 'ArrowRight' }))).toBe('ArrowRight');
    expect(shortcutKey(at({ key: 'Backspace' }))).toBe('Backspace');
  });

  it('Shift 把句点变成 > 时按物理键算回句点', () => {
    expect(shortcutKey(at({ key: '>', code: 'Period', shiftKey: true }))).toBe('.');
  });

  it('⌘= 与 ⌘+ 是同一个组合', () => {
    expect(shortcutKey(at({ key: '=', metaKey: true }))).toBe('+');
    expect(shortcutKey(at({ key: '+' }))).toBe('+');
  });

  it('只按修饰键本身不算快捷键', () => {
    expect(shortcutKey(at({ key: 'Shift', shiftKey: true }))).toBeNull();
    expect(shortcutKey(at({ key: 'Meta', metaKey: true }))).toBeNull();
  });
});

describe('eventShortcuts 生成与 aria-keyshortcuts 一致的组合', () => {
  it('单个主修饰键', () => {
    expect(eventShortcuts(at({ key: 'k', metaKey: true }))).toEqual(['Meta+K']);
    expect(eventShortcuts(at({ key: 'k', ctrlKey: true }))).toEqual(['Control+K']);
  });

  it('组合修饰键按 Control、Alt、Shift、Meta 排序', () => {
    expect(eventShortcuts(at({ key: 'z', metaKey: true, shiftKey: true }))).toEqual(['Shift+Meta+Z']);
    expect(eventShortcuts(at({ key: 'Escape', metaKey: true, altKey: true }))).toEqual(['Alt+Meta+Escape']);
    expect(eventShortcuts(at({ key: 'Enter', metaKey: true, ctrlKey: true, altKey: true }))).toEqual([
      'Control+Alt+Meta+Enter'
    ]);
  });

  it('方向键与 + / ? 都能表达', () => {
    expect(eventShortcuts(at({ key: 'ArrowRight', metaKey: true }))).toEqual(['Meta+ArrowRight']);
    expect(eventShortcuts(at({ key: '+', metaKey: true, shiftKey: true }))).toEqual(['Shift+Meta++', 'Meta++']);
    expect(eventShortcuts(at({ key: '?', metaKey: true, shiftKey: true }))).toEqual(['Shift+Meta+?', 'Meta+?']);
  });
});

describe('matchesShortcut 菜单声明什么就能按什么', () => {
  it('字母、方向键、加号、问号都匹配', () => {
    expect(matchesShortcut(command('⌘K'), at({ key: 'k', metaKey: true }))).toBe(true);
    expect(matchesShortcut(command('⌘→'), at({ key: 'ArrowRight', metaKey: true }))).toBe(true);
    expect(matchesShortcut(command('⌘+'), at({ key: '=', metaKey: true }))).toBe(true);
    expect(matchesShortcut(command('⌘+'), at({ key: '+', metaKey: true, shiftKey: true }))).toBe(true);
    expect(matchesShortcut(command('⌘?'), at({ key: '?', metaKey: true, shiftKey: true }))).toBe(true);
    expect(matchesShortcut(command('⇧⌘N'), at({ key: 'n', metaKey: true, shiftKey: true }))).toBe(true);
  });

  it('修饰键或按键不同就不匹配', () => {
    expect(matchesShortcut(command('⌘K'), at({ key: 'k', metaKey: true, shiftKey: true }))).toBe(false);
    expect(matchesShortcut(command('⌘Z'), at({ key: 'z', ctrlKey: true, metaKey: true }))).toBe(false);
    expect(matchesShortcut(command('▸'), at({ key: 'n', metaKey: true }))).toBe(false);
  });
});

describe('输入态与浏览器快捷键的判定', () => {
  it('文本编辑快捷键只认主修饰键，且不接受 Alt', () => {
    for (const key of ['a', 'c', 'x', 'v', 'y', 'z']) {
      expect(isTextEditingShortcut(at({ key, metaKey: true })), key).toBe(true);
      expect(isTextEditingShortcut(at({ key, ctrlKey: true })), key).toBe(true);
      expect(isTextEditingShortcut(at({ key, metaKey: true, altKey: true })), key).toBe(false);
      expect(isTextEditingShortcut(at({ key, metaKey: true, ctrlKey: true })), key).toBe(false);
    }
    expect(isTextEditingShortcut(at({ key: 'b', metaKey: true }))).toBe(false);
  });

  it('⌘⇧Z 仍算文本编辑', () => {
    expect(isTextEditingShortcut(at({ key: 'z', metaKey: true, shiftKey: true }))).toBe(true);
  });

  it('hasPrimaryModifier 要求 ⌘ 与 Ctrl 二选一', () => {
    expect(hasPrimaryModifier(at({ key: 'a', metaKey: true }))).toBe(true);
    expect(hasPrimaryModifier(at({ key: 'a', ctrlKey: true }))).toBe(true);
    expect(hasPrimaryModifier(at({ key: 'a', metaKey: true, ctrlKey: true }))).toBe(false);
    expect(hasPrimaryModifier(at({ key: 'a' }))).toBe(false);
  });

  it('单独的 Space 只认没有修饰键的空格', () => {
    expect(isPlainSpace(at({ key: ' ' }))).toBe(true);
    expect(isPlainSpace(at({ key: ' ', shiftKey: true }))).toBe(false);
    expect(isPlainSpace(at({ key: ' ', metaKey: true }))).toBe(false);
  });

  it('浏览器快捷键：查找、刷新、地址栏、标签、缩放与标签切换都拦；应用自己的组合不拦', () => {
    for (const key of ['f', 'r', 'l', 't', 'o', 'p', 's', 'd', 'g', 'j', '1', '9', '0', '-', '[', ']']) {
      expect(isBrowserShortcut(at({ key, metaKey: true })), key).toBe(true);
    }
    expect(isBrowserShortcut(at({ key: '=', metaKey: true }))).toBe(true);
    expect(isBrowserShortcut(at({ key: 'n', metaKey: true, shiftKey: true }))).toBe(true);
    expect(isBrowserShortcut(at({ key: 'q', metaKey: true }))).toBe(false);
    expect(isBrowserShortcut(at({ key: 'k', metaKey: true }))).toBe(false);
    expect(isBrowserShortcut(at({ key: 'h', metaKey: true }))).toBe(false);
    expect(isBrowserShortcut(at({ key: 'f', altKey: true, metaKey: true }))).toBe(false);
  });
});
