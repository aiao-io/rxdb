import type { PreferenceConstraint, PreferenceConstraints } from '../merge.js';
import { APPEARANCE_ITEMS } from './items-appearance.js';
import { GENERAL_ITEMS, SHORTCUT_ITEMS } from './items-general.js';
import { LAYOUT_ITEMS } from './items-layout.js';
import type { PreferenceControl, PreferenceItem } from './types.js';
import { HEX_COLOR_PATTERN, LOCALE_PATTERN, TIMEZONE_PATTERN } from './values.js';

export {
  assertValidExtension,
  extensionDefaults,
  extensionToItem,
  sanitizeExtensions,
  validateExtensionValue
} from './extension.js';
export { PREFERENCE_TABS } from './types.js';
export type {
  PreferenceControl,
  PreferenceExtension,
  PreferenceItem,
  PreferenceOption,
  PreferenceOptions,
  PreferenceOptionSource,
  PreferencePreview,
  PreferenceTab
} from './types.js';
export * from './values.js';

/** 内置偏好项，按页签与分组的出现顺序排列。 */
export const BUILTIN_PREFERENCE_ITEMS: readonly PreferenceItem[] = [
  ...APPEARANCE_ITEMS,
  ...LAYOUT_ITEMS,
  ...SHORTCUT_ITEMS,
  ...GENERAL_ITEMS
];

const normalizeLocale = (value: string): string | undefined => {
  if (value === '') return '';
  try {
    return new Intl.Locale(value).toString();
  } catch {
    return undefined;
  }
};

const normalizeTimezone = (value: string): string | undefined => {
  if (value === '') return '';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
};

const dynamicSelectConstraint = (source: 'themes' | 'locales' | 'timezones'): PreferenceConstraint | undefined => {
  if (source === 'locales') return { kind: 'pattern', pattern: LOCALE_PATTERN, normalize: normalizeLocale };
  if (source === 'timezones') return { kind: 'pattern', pattern: TIMEZONE_PATTERN, normalize: normalizeTimezone };
  return undefined;
};

const constraintOf = (control: PreferenceControl, themeNames: readonly string[]): PreferenceConstraint | undefined => {
  switch (control.kind) {
    case 'number':
      return { kind: 'number', min: control.min, max: control.max, nullable: control.nullable ?? false };
    case 'segmented':
      return { kind: 'enum', values: control.options.map(o => o.value), nullable: control.nullable ?? false };
    case 'cards':
      return { kind: 'enum', values: control.options.map(o => o.value) };
    case 'color':
      return { kind: 'pattern', pattern: HEX_COLOR_PATTERN };
    case 'themes':
      return { kind: 'enum', values: ['system', ...themeNames] };
    case 'select':
      return 'source' in control.options ?
          dynamicSelectConstraint(control.options.source)
        : { kind: 'enum', values: control.options.map(o => o.value) };
    default:
      return undefined;
  }
};

/**
 * 由偏好项派生清洗约束，让抽屉输入、导入文件与本地存储共用同一套取值规则。
 * @param items - 偏好项（不含扩展，扩展由 {@link sanitizeExtensions} 处理）。
 * @param themeNames - 外壳可选的主题名（不含 `system`）。
 * @returns 路径到约束的映射。
 */
export function deriveConstraints(
  items: readonly PreferenceItem[],
  themeNames: readonly string[]
): PreferenceConstraints {
  const entries = items.flatMap(item => {
    const constraint = constraintOf(item.control, themeNames);
    return constraint ? [[item.path, constraint] as const] : [];
  });
  return Object.fromEntries(entries);
}
