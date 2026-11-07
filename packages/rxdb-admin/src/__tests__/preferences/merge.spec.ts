import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDGET_ORDER, defaultPreferences } from '../../preferences/defaults.js';
import {
  applyPatch,
  diffPreferences,
  getPath,
  isRecord,
  pathToPatch,
  sanitizePreferences,
  type PreferenceConstraints
} from '../../preferences/merge.js';
import type { AdminPreferences } from '../../preferences/types.js';

const clone = (): AdminPreferences => structuredClone(defaultPreferences);

describe('isRecord', () => {
  it('只认普通对象', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('a')).toBe(false);
  });
});

describe('applyPatch', () => {
  it('对象递归合并，兄弟字段保持', () => {
    const next = applyPatch(defaultPreferences, { content: { padding: { top: 8 } } });
    expect(next.content.padding).toEqual({ top: 8, right: 0, bottom: 0, left: 0 });
    expect(next.content.compact).toBe('off');
  });

  it('数组整体替换', () => {
    const next = applyPatch(defaultPreferences, { widget: { order: ['lock', 'search'] } });
    expect(next.widget.order).toEqual(['lock', 'search']);
  });

  it('null 是有效值，undefined 被忽略', () => {
    const base = applyPatch(defaultPreferences, { theme: { radius: '0.5' } });
    expect(applyPatch(base, { theme: { radius: null } }).theme.radius).toBeNull();
    expect(applyPatch(base, { theme: { radius: undefined } }).theme.radius).toBe('0.5');
  });

  it('不修改入参', () => {
    const base = clone();
    applyPatch(base, { header: { height: 40 } });
    expect(base.header.height).toBe(56);
  });

  it('开放记录可新增键，当前值缺失时直接取补丁', () => {
    const next = applyPatch(defaultPreferences, { extension: { tablePageSize: 50 } });
    expect(next.extension).toEqual({ tablePageSize: 50 });
    expect(applyPatch(undefined, { a: 1 })).toEqual({ a: 1 });
  });
});

describe('diffPreferences', () => {
  it('无差异返回 null', () => {
    expect(diffPreferences(clone(), defaultPreferences)).toBeNull();
  });

  it('只保留变化的叶子', () => {
    const current = applyPatch(defaultPreferences, { theme: { name: 'dark' }, content: { padding: { left: 4 } } });
    expect(diffPreferences(current, defaultPreferences)).toEqual({
      theme: { name: 'dark' },
      content: { padding: { left: 4 } }
    });
  });

  it('数组按序比较，变化时整体保留', () => {
    const reordered = [...DEFAULT_WIDGET_ORDER].reverse();
    const current = applyPatch(defaultPreferences, { widget: { order: reordered } });
    expect(diffPreferences(current, defaultPreferences)).toEqual({ widget: { order: reordered } });
  });

  it('null 叶子与默认 null 相等；改回默认后无差异', () => {
    const changed = applyPatch(defaultPreferences, { theme: { radius: '1' } });
    expect(diffPreferences(changed, defaultPreferences)).toEqual({ theme: { radius: '1' } });
    expect(diffPreferences(applyPatch(changed, { theme: { radius: null } }), defaultPreferences)).toBeNull();
  });

  it('开放记录里新增的键出现在差异里', () => {
    const current = applyPatch(defaultPreferences, { extension: { tablePageSize: 50 } });
    expect(diffPreferences(current, defaultPreferences)).toEqual({ extension: { tablePageSize: 50 } });
  });
});

describe('sanitizePreferences', () => {
  const constraints: PreferenceConstraints = {
    'header.height': { kind: 'number', min: 40, max: 64 },
    'theme.radius': { kind: 'enum', values: ['0', '0.25', '0.5'], nullable: true },
    'theme.fontSize': { kind: 'number', min: 12, max: 22, nullable: true },
    'theme.colorPrimary': { kind: 'pattern', pattern: /^(#[0-9a-fA-F]{6})?$/ },
    'tabbar.styleType': { kind: 'enum', values: ['chrome', 'plain'] }
  };

  it('非对象输入回到默认树', () => {
    expect(sanitizePreferences(null, defaultPreferences)).toEqual(defaultPreferences);
    expect(sanitizePreferences('x', defaultPreferences)).toEqual(defaultPreferences);
  });

  it('丢弃未知键，保留合法值', () => {
    const result = sanitizePreferences(
      { unknown: 1, header: { height: 60, bogus: true } },
      defaultPreferences,
      constraints
    );
    expect(result).not.toHaveProperty('unknown');
    expect(result.header).toEqual({ ...defaultPreferences.header, height: 60 });
  });

  it('类型不符的叶子回到默认值', () => {
    const result = sanitizePreferences(
      { app: { layout: 3, compact: 'yes' }, sidebar: { width: 'wide' } },
      defaultPreferences
    );
    expect(result.app.layout).toBe(defaultPreferences.app.layout);
    expect(result.app.compact).toBe(false);
    expect(result.sidebar.width).toBe(240);
  });

  it('数值按约束夹取，非有限数回到默认', () => {
    expect(sanitizePreferences({ header: { height: 999 } }, defaultPreferences, constraints).header.height).toBe(64);
    expect(sanitizePreferences({ header: { height: 1 } }, defaultPreferences, constraints).header.height).toBe(40);
    expect(sanitizePreferences({ header: { height: Number.NaN } }, defaultPreferences, constraints).header.height).toBe(
      56
    );
    expect(sanitizePreferences({ sidebar: { width: Infinity } }, defaultPreferences).sidebar.width).toBe(240);
  });

  it('枚举越界回到默认；可空枚举接受 null', () => {
    expect(
      sanitizePreferences({ tabbar: { styleType: 'neon' } }, defaultPreferences, constraints).tabbar.styleType
    ).toBe('chrome');
    const radius = (value: unknown) =>
      sanitizePreferences({ theme: { radius: value } }, defaultPreferences, constraints).theme.radius;
    expect(radius('0.25')).toBe('0.25');
    expect(radius('9')).toBeNull();
    expect(radius(null)).toBeNull();
  });

  it('可空数值：null 与范围内数值合法', () => {
    const fontSize = (value: unknown) =>
      sanitizePreferences({ theme: { fontSize: value } }, defaultPreferences, constraints).theme.fontSize;
    expect(fontSize(18)).toBe(18);
    expect(fontSize(40)).toBe(22);
    expect(fontSize(null)).toBeNull();
    expect(fontSize('big')).toBeNull();
  });

  it('非空枚举/数值收到 null 回到默认', () => {
    expect(sanitizePreferences({ tabbar: { styleType: null } }, defaultPreferences, constraints).tabbar.styleType).toBe(
      'chrome'
    );
    expect(sanitizePreferences({ header: { height: null } }, defaultPreferences, constraints).header.height).toBe(56);
  });

  it('正则约束：不匹配回到默认', () => {
    const color = (value: unknown) =>
      sanitizePreferences({ theme: { colorPrimary: value } }, defaultPreferences, constraints).theme.colorPrimary;
    expect(color('#167bff')).toBe('#167bff');
    expect(color('red')).toBe('');
    expect(color(7)).toBe('');
  });

  it('部件顺序：去重、过滤未知键、补全缺失项', () => {
    const order = sanitizePreferences({ widget: { order: ['lock', 'lock', 'bogus', 'search'] } }, defaultPreferences)
      .widget.order;
    expect(order.slice(0, 2)).toEqual(['lock', 'search']);
    expect([...order].sort()).toEqual([...DEFAULT_WIDGET_ORDER].sort());
  });

  it('部件顺序不是字符串数组时回到默认顺序', () => {
    expect(sanitizePreferences({ widget: { order: 'x' } }, defaultPreferences).widget.order).toEqual([
      ...DEFAULT_WIDGET_ORDER
    ]);
    expect(sanitizePreferences({ widget: { order: [1, 2] } }, defaultPreferences).widget.order).toEqual([
      ...DEFAULT_WIDGET_ORDER
    ]);
  });

  it('隐藏部件：过滤未知键与不可隐藏的设置入口', () => {
    const hidden = sanitizePreferences(
      { widget: { hidden: ['lock', 'preferences', 'bogus', 'lock'] } },
      defaultPreferences
    ).widget.hidden;
    expect(hidden).toEqual(['lock']);
  });

  it('快捷键关闭列表去重，非字符串数组回到默认', () => {
    expect(
      sanitizePreferences({ shortcuts: { disabled: ['a', 'a', 'b'] } }, defaultPreferences).shortcuts.disabled
    ).toEqual(['a', 'b']);
    expect(sanitizePreferences({ shortcuts: { disabled: [1] } }, defaultPreferences).shortcuts.disabled).toEqual([]);
  });

  it('开放记录原样保留键值，不是对象时回到默认', () => {
    expect(sanitizePreferences({ extension: { a: 1, b: 'x' } }, defaultPreferences).extension).toEqual({
      a: 1,
      b: 'x'
    });
    expect(sanitizePreferences({ extension: [1] }, defaultPreferences).extension).toEqual({});
  });

  it('JSON 里的 __proto__ 不会污染原型', () => {
    const raw = JSON.parse('{"__proto__":{"polluted":true},"extension":{"__proto__":{"polluted":true}}}');
    const result = sanitizePreferences(raw, defaultPreferences);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.getPrototypeOf(result.extension)).toBe(Object.prototype);
  });
});

describe('getPath / pathToPatch', () => {
  it('按点分路径读取，缺失返回 undefined', () => {
    expect(getPath(defaultPreferences, 'content.padding.top')).toBe(0);
    expect(getPath(defaultPreferences, 'content.nope.top')).toBeUndefined();
  });

  it('路径转补丁并可回写', () => {
    const patch = pathToPatch('content.padding.left', 12);
    expect(patch).toEqual({ content: { padding: { left: 12 } } });
    expect(applyPatch(defaultPreferences, patch).content.padding.left).toBe(12);
  });
});
