import { describe, expect, it } from 'vitest';
import { detectPlatform, formatCombo, matchesCombo, parseCombo, type KeyEventLike } from '../../shortcuts/combo.js';

const event = (overrides: Partial<KeyEventLike>): KeyEventLike => ({
  key: '',
  code: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides
});

describe('parseCombo', () => {
  it('解析修饰键与主键，大小写与空白不敏感', () => {
    expect(parseCombo('Mod+K')).toEqual({ key: 'k', mod: true, ctrl: false, meta: false, alt: false, shift: false });
    expect(parseCombo(' alt + shift + L ')).toMatchObject({ key: 'l', alt: true, shift: true, mod: false });
    expect(parseCombo('Ctrl+Meta+,')).toMatchObject({ key: ',', ctrl: true, meta: true });
  });

  it('主键为加号时用 Plus 表示', () => {
    expect(parseCombo('Mod+Plus')).toMatchObject({ key: '+', mod: true });
  });

  it('特殊键名统一为 event.key 的小写形式', () => {
    expect(parseCombo('Escape').key).toBe('escape');
    expect(parseCombo('Esc').key).toBe('escape');
    expect(parseCombo('Space').key).toBe(' ');
    expect(parseCombo('Alt+ArrowLeft').key).toBe('arrowleft');
  });

  it('缺少主键、多个主键或空串立即报错', () => {
    expect(() => parseCombo('')).toThrow(/Invalid shortcut combo/);
    expect(() => parseCombo('Mod+')).toThrow(/Invalid shortcut combo/);
    expect(() => parseCombo('Mod+Alt')).toThrow(/Invalid shortcut combo/);
    expect(() => parseCombo('K+L')).toThrow(/Invalid shortcut combo/);
  });
});

describe('matchesCombo', () => {
  it('Mod 在 mac 上是 Command，在其他平台是 Ctrl', () => {
    const combo = parseCombo('Mod+K');
    expect(matchesCombo(event({ key: 'k', metaKey: true }), combo, 'mac')).toBe(true);
    expect(matchesCombo(event({ key: 'k', ctrlKey: true }), combo, 'mac')).toBe(false);
    expect(matchesCombo(event({ key: 'k', ctrlKey: true }), combo, 'other')).toBe(true);
    expect(matchesCombo(event({ key: 'k', metaKey: true }), combo, 'other')).toBe(false);
  });

  it('键名大小写不敏感（Caps Lock / Shift 下 event.key 为大写）', () => {
    expect(matchesCombo(event({ key: 'K', ctrlKey: true }), parseCombo('Mod+K'), 'other')).toBe(true);
  });

  it('多余的修饰键不匹配', () => {
    const combo = parseCombo('Mod+K');
    expect(matchesCombo(event({ key: 'k', ctrlKey: true, shiftKey: true }), combo, 'other')).toBe(false);
    expect(matchesCombo(event({ key: 'k', ctrlKey: true, altKey: true }), combo, 'other')).toBe(false);
  });

  it('缺少修饰键不匹配', () => {
    expect(matchesCombo(event({ key: 'k' }), parseCombo('Mod+K'), 'other')).toBe(false);
  });

  it('逗号等符号键', () => {
    expect(matchesCombo(event({ key: ',', metaKey: true }), parseCombo('Mod+,'), 'mac')).toBe(true);
  });

  it('含 Alt 的组合按物理键位匹配：macOS 上 Option+L 的 event.key 是 ¬', () => {
    const combo = parseCombo('Alt+L');
    expect(matchesCombo(event({ key: '¬', code: 'KeyL', altKey: true }), combo, 'mac')).toBe(true);
    expect(matchesCombo(event({ key: 'l', code: 'KeyL', altKey: true }), combo, 'other')).toBe(true);
  });

  it('不含 Alt 时不使用物理键位（避免非 QWERTY 布局误触）', () => {
    expect(matchesCombo(event({ key: 'z', code: 'KeyW', ctrlKey: true }), parseCombo('Mod+K'), 'other')).toBe(false);
    expect(matchesCombo(event({ key: 'x', code: 'KeyK', ctrlKey: true }), parseCombo('Mod+K'), 'other')).toBe(false);
  });

  it('物理键位覆盖字母、数字与常见符号', () => {
    const alt = (code: string, key: string) =>
      matchesCombo(event({ key: '?', code, altKey: true }), parseCombo(`Alt+${key}`), 'mac');
    expect(alt('Digit1', '1')).toBe(true);
    expect(alt('Comma', ',')).toBe(true);
    expect(alt('Period', '.')).toBe(true);
    expect(alt('Slash', '/')).toBe(true);
    expect(alt('BracketLeft', '[')).toBe(true);
    expect(alt('BracketRight', ']')).toBe(true);
    expect(alt('Minus', '-')).toBe(true);
    expect(alt('Equal', '=')).toBe(true);
    expect(alt('KeyA', 'B')).toBe(false);
  });

  it('显式 Ctrl / Meta 与 Shift', () => {
    expect(matchesCombo(event({ key: 'p', ctrlKey: true, shiftKey: true }), parseCombo('Ctrl+Shift+P'), 'mac')).toBe(
      true
    );
    expect(matchesCombo(event({ key: 'p', metaKey: true }), parseCombo('Meta+P'), 'other')).toBe(true);
  });

  it('Escape 无修饰键', () => {
    expect(matchesCombo(event({ key: 'Escape' }), parseCombo('Escape'), 'other')).toBe(true);
  });
});

describe('formatCombo', () => {
  it('mac 使用符号并以空格连接', () => {
    expect(formatCombo(parseCombo('Mod+K'), 'mac')).toEqual({ keys: ['⌘', 'K'], text: '⌘ K' });
    expect(formatCombo(parseCombo('Alt+Shift+L'), 'mac')).toEqual({ keys: ['⌥', '⇧', 'L'], text: '⌥ ⇧ L' });
    expect(formatCombo(parseCombo('Ctrl+Meta+,'), 'mac').keys).toEqual(['⌃', '⌘', ',']);
  });

  it('其他平台使用文字并以加号连接', () => {
    expect(formatCombo(parseCombo('Mod+K'), 'other')).toEqual({ keys: ['Ctrl', 'K'], text: 'Ctrl+K' });
    expect(formatCombo(parseCombo('Alt+Shift+L'), 'other').text).toBe('Alt+Shift+L');
    expect(formatCombo(parseCombo('Meta+K'), 'other').keys).toEqual(['Win', 'K']);
  });

  it('特殊键用可读名称', () => {
    expect(formatCombo(parseCombo('Escape'), 'other').text).toBe('Esc');
    expect(formatCombo(parseCombo('Alt+ArrowLeft'), 'mac').text).toBe('⌥ ←');
    expect(formatCombo(parseCombo('Alt+ArrowRight'), 'other').text).toBe('Alt+→');
    expect(formatCombo(parseCombo('Space'), 'other').text).toBe('Space');
    expect(formatCombo(parseCombo('Mod+Plus'), 'other').text).toBe('Ctrl++');
  });
});

describe('detectPlatform', () => {
  it('从 navigator 判断 mac / other', () => {
    expect(detectPlatform({ platform: 'MacIntel' })).toBe('mac');
    expect(detectPlatform({ platform: 'iPhone' })).toBe('mac');
    expect(detectPlatform({ platform: 'Win32' })).toBe('other');
    expect(detectPlatform({ userAgentData: { platform: 'macOS' }, platform: '' })).toBe('mac');
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' })).toBe('mac');
    expect(detectPlatform(undefined)).toBe('other');
  });
});
