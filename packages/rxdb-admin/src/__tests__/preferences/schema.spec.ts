import { describe, expect, it } from 'vitest';
import { defaultPreferences } from '../../preferences/defaults.js';
import { getPath, isRecord, sanitizePreferences } from '../../preferences/merge.js';
import type { PreferenceExtension } from '../../preferences/schema/index.js';
import {
  BUILTIN_PREFERENCE_ITEMS,
  PREFERENCE_TABS,
  assertValidExtension,
  deriveConstraints,
  extensionDefaults,
  extensionToItem,
  sanitizeExtensions,
  validateExtensionValue
} from '../../preferences/schema/index.js';

const leafPaths = (node: unknown, prefix = ''): string[] => {
  if (!isRecord(node)) return [prefix];
  return Object.entries(node).flatMap(([key, value]) => leafPaths(value, prefix ? `${prefix}.${key}` : key));
};

/** 没有界面入口的叶子：折叠宽度是主题尺寸令牌，不作为用户偏好。 */
const NO_UI_LEAVES = new Set(['sidebar.collapseWidth']);
/** 由专用控件整棵子树管理的叶子。 */
const MANAGED_BY_CUSTOM_CONTROLS = new Set(['widget.order', 'widget.hidden', 'shortcuts.disabled']);

describe('内置偏好项与默认树保持一致', () => {
  it('每个偏好项的路径都存在于默认树', () => {
    for (const item of BUILTIN_PREFERENCE_ITEMS) {
      expect(getPath(defaultPreferences, item.path), item.path).not.toBeUndefined();
    }
  });

  it('默认树的每个叶子要么有偏好项，要么属于已声明的例外', () => {
    const covered = new Set(BUILTIN_PREFERENCE_ITEMS.map(item => item.path));
    const missing = leafPaths(defaultPreferences)
      .filter(path => path !== 'extension' && !path.startsWith('extension.'))
      .filter(path => !covered.has(path) && !NO_UI_LEAVES.has(path) && !MANAGED_BY_CUSTOM_CONTROLS.has(path))
      .filter(path => !covered.has(path.split('.').slice(0, -1).join('.')));
    expect(missing).toEqual([]);
  });

  it('偏好项 id 唯一，页签属于固定集合', () => {
    const ids = BUILTIN_PREFERENCE_ITEMS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of BUILTIN_PREFERENCE_ITEMS) expect(PREFERENCE_TABS).toContain(item.tab);
  });

  it('默认树经约束清洗后保持不变（默认值自身合法）', () => {
    const constraints = deriveConstraints(BUILTIN_PREFERENCE_ITEMS, ['light', 'dark']);
    expect(sanitizePreferences(defaultPreferences, defaultPreferences, constraints)).toEqual(defaultPreferences);
  });
});

describe('deriveConstraints', () => {
  const constraints = deriveConstraints(BUILTIN_PREFERENCE_ITEMS, ['light', 'dark']);

  it('数字项带范围，可空项标记 nullable', () => {
    expect(constraints['sidebar.width']).toEqual({ kind: 'number', min: 160, max: 320, nullable: false });
    expect(constraints['theme.fontSize']).toMatchObject({ kind: 'number', nullable: true });
  });

  it('分段 / 卡片 / 静态下拉派生枚举', () => {
    expect(constraints['theme.radius']).toMatchObject({ kind: 'enum', nullable: true });
    expect(constraints['app.layout']).toEqual({
      kind: 'enum',
      values: ['sidebar-nav', 'header-sidebar-nav', 'header-nav', 'full-content']
    });
    expect(constraints['tabbar.persist']).toMatchObject({ kind: 'enum', values: ['off', 'session', 'local'] });
  });

  it('主题项的枚举包含 system 与外壳提供的主题', () => {
    expect(constraints['theme.name']).toEqual({ kind: 'enum', values: ['system', 'light', 'dark'] });
  });

  it('颜色、语言、时区使用正则；开关与文本不加约束', () => {
    expect(constraints['theme.colorPrimary']).toMatchObject({ kind: 'pattern' });
    expect(constraints['app.locale']).toMatchObject({ kind: 'pattern' });
    expect(constraints['app.timezone']).toMatchObject({ kind: 'pattern' });
    expect(constraints['app.compact']).toBeUndefined();
    expect(constraints['copyright.companyName']).toBeUndefined();
  });

  it('清洗时越界的主题名与布局回到默认', () => {
    const result = sanitizePreferences(
      { theme: { name: 'bogus' }, app: { layout: 'diagonal' }, sidebar: { width: 5000 } },
      defaultPreferences,
      constraints
    );
    expect(result.theme.name).toBe('system');
    expect(result.app.layout).toBe('sidebar-nav');
    expect(result.sidebar.width).toBe(320);
  });

  it.each([
    ['', ''],
    ['en', 'en'],
    ['zh-Hans', 'zh-Hans'],
    ['EN-us', 'en-US'],
    ['zh-hant-tw', 'zh-Hant-TW'],
    ['iw', 'he'],
    ['en-US-u-ca-gregory', 'en-US-u-ca-gregory'],
    ['en-x-workshop', 'en-x-workshop']
  ])('语言标签 %j 按运行时相同的 BCP 47 规则规范化', (locale, expected) => {
    expect(sanitizePreferences({ app: { locale } }, defaultPreferences, constraints).app.locale).toBe(expected);
  });

  it.each(['en_US', 'en-US-US', 'en-u-ca-gregory-u-nu-latn', ' en ', ' ', null, 1])(
    '非法语言标签 %j 在写入运行时前清洗为默认值',
    locale => {
      expect(sanitizePreferences({ app: { locale } }, defaultPreferences, constraints).app.locale).toBe('');
    }
  );
});

const tablePageSize: PreferenceExtension = {
  key: 'tablePageSize',
  type: 'number',
  defaultValue: 20,
  min: 10,
  max: 200,
  step: 10,
  label: '表格每页行数'
};
const density: PreferenceExtension = {
  key: 'density',
  type: 'select',
  defaultValue: 'cozy',
  options: [
    { value: 'cozy', label: '舒适' },
    { value: 'tight', label: '紧凑' }
  ]
};

describe('扩展偏好', () => {
  it('validateExtensionValue 逐类型校验', () => {
    expect(validateExtensionValue({ key: 'a', type: 'switch', defaultValue: true }, false)).toBe(true);
    expect(validateExtensionValue({ key: 'a', type: 'switch', defaultValue: true }, 'x')).toBe(false);
    expect(validateExtensionValue({ key: 'a', type: 'text', defaultValue: '' }, 'x')).toBe(true);
    expect(validateExtensionValue({ key: 'a', type: 'text', defaultValue: '' }, 1)).toBe(false);
    expect(validateExtensionValue(density, 'tight')).toBe(true);
    expect(validateExtensionValue(density, 'loose')).toBe(false);
    expect(validateExtensionValue(tablePageSize, 50)).toBe(true);
    expect(validateExtensionValue(tablePageSize, 5)).toBe(false);
    expect(validateExtensionValue(tablePageSize, 250)).toBe(false);
    expect(validateExtensionValue(tablePageSize, 25)).toBe(false);
    expect(validateExtensionValue(tablePageSize, Number.NaN)).toBe(false);
    expect(validateExtensionValue(tablePageSize, '50')).toBe(false);
  });

  it('数字无步长约束时任意范围内数值合法', () => {
    const free: PreferenceExtension = { key: 'ratio', type: 'number', defaultValue: 1, min: 0, max: 2 };
    expect(validateExtensionValue(free, 1.37)).toBe(true);
  });

  it('assertValidExtension 拒绝非法声明', () => {
    expect(() => assertValidExtension(tablePageSize)).not.toThrow();
    expect(() => assertValidExtension({ ...tablePageSize, key: 'a.b' })).toThrow(/Invalid preference extension key/);
    expect(() => assertValidExtension({ ...tablePageSize, key: '' })).toThrow(/Invalid preference extension key/);
    expect(() => assertValidExtension({ key: 's', type: 'select', defaultValue: 'a' })).toThrow(/requires options/);
    expect(() => assertValidExtension({ ...tablePageSize, min: 300 })).toThrow(/min greater than max/);
    expect(() => assertValidExtension({ ...tablePageSize, defaultValue: 15 })).toThrow(/invalid default value/);
  });

  it('extensionToItem 生成「拓展」页签的偏好项', () => {
    expect(extensionToItem(tablePageSize)).toMatchObject({
      id: 'extension.tablePageSize',
      path: 'extension.tablePageSize',
      tab: 'extension',
      label: '表格每页行数',
      control: { kind: 'number', min: 10, max: 200, step: 10 }
    });
    expect(extensionToItem(density).control).toMatchObject({ kind: 'select' });
    expect(extensionToItem({ key: 'on', type: 'switch', defaultValue: false }).control).toEqual({ kind: 'switch' });
    expect(extensionToItem({ key: 't', type: 'text', defaultValue: '' }).control).toEqual({ kind: 'text' });
  });

  it('自定义分组、翻译键与说明会带到偏好项', () => {
    const item = extensionToItem({
      key: 'k',
      type: 'switch',
      defaultValue: true,
      labelKey: 'app.k',
      hint: '说明',
      hintKey: 'app.k.hint',
      section: '我的分组'
    });
    expect(item).toMatchObject({
      section: '我的分组',
      sectionLabel: '我的分组',
      labelKey: 'app.k',
      hint: '说明',
      hintKey: 'app.k.hint'
    });
  });

  it('未声明范围的数字扩展不设界限', () => {
    const item = extensionToItem({ key: 'n', type: 'number', defaultValue: 3 });
    expect(item.control).toMatchObject({ kind: 'number', step: 1 });
  });

  it('extensionDefaults 汇总默认值', () => {
    expect(extensionDefaults([tablePageSize, density])).toEqual({ tablePageSize: 20, density: 'cozy' });
  });

  it('sanitizeExtensions：已注册项非法回默认，未注册键原样保留', () => {
    const result = sanitizeExtensions({ tablePageSize: 7, density: 'tight', orphan: { a: 1 } }, [
      tablePageSize,
      density
    ]);
    expect(result).toEqual({ tablePageSize: 20, density: 'tight', orphan: { a: 1 } });
    expect(sanitizeExtensions({}, [tablePageSize])).toEqual({ tablePageSize: 20 });
    expect(sanitizeExtensions(null as unknown as Record<string, unknown>, [density])).toEqual({ density: 'cozy' });
  });
});
