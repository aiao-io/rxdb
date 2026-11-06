import type { AdminPreferences } from '../types.js';

/** 偏好抽屉的页签。 */
export type PreferenceTab = 'appearance' | 'layout' | 'shortcuts' | 'general' | 'extension';

/** 抽屉里页签的固定顺序。 */
export const PREFERENCE_TABS: readonly PreferenceTab[] = ['appearance', 'layout', 'shortcuts', 'general', 'extension'];

/** 选项。`labelKey` 走翻译，`label` 是字面量（动态选项如时区、语言）。 */
export interface PreferenceOption {
  /** 选项值。 */
  readonly value: string;
  /** 翻译键。 */
  readonly labelKey?: string;
  /** 字面量文案，无 `labelKey` 时使用。 */
  readonly label?: string;
}

/** 运行时才能确定的选项来源，由外壳按配置解析。 */
export type PreferenceOptionSource = 'themes' | 'locales' | 'timezones';

/** 选项：静态列表，或指向运行时来源。 */
export type PreferenceOptions = readonly PreferenceOption[] | { readonly source: PreferenceOptionSource };

/** 卡片选项的预览样式，由三端各自渲染。 */
export type PreferencePreview = 'layout' | 'transition' | 'tabbar';

/** 控件。通用控件按种类渲染；`themes` / `widgets` / `shortcuts` 是由外壳数据驱动的专用控件。 */
export type PreferenceControl =
  | { readonly kind: 'switch' }
  | { readonly kind: 'select'; readonly options: PreferenceOptions }
  | { readonly kind: 'segmented'; readonly options: readonly PreferenceOption[]; readonly nullable?: boolean }
  | { readonly kind: 'cards'; readonly options: readonly PreferenceOption[]; readonly preview: PreferencePreview }
  | {
      readonly kind: 'number';
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly unit?: string;
      readonly nullable?: boolean;
    }
  | { readonly kind: 'text'; readonly placeholderKey?: string }
  | { readonly kind: 'color'; readonly presets: readonly string[] }
  | { readonly kind: 'themes' }
  | { readonly kind: 'widgets' }
  | { readonly kind: 'shortcuts' };

/** 一条偏好：对应偏好树里的一个叶子（专用控件对应其所属子树）。 */
export interface PreferenceItem {
  /** 唯一标识，内置项等于 `path`。 */
  readonly id: string;
  /** 偏好树点分路径。 */
  readonly path: string;
  /** 所在页签。 */
  readonly tab: PreferenceTab;
  /** 分组标识；翻译键为 `prefs.section.<section>`，扩展可改用 `sectionLabel`。 */
  readonly section: string;
  /** 分组字面量标题（扩展用）。 */
  readonly sectionLabel?: string;
  /** 分组标题翻译键，优先于字面量标题。 */
  readonly sectionKey?: string;
  /** 翻译键，缺省为 `prefs.item.<path>`。 */
  readonly labelKey?: string;
  /** 字面量标题，无 `labelKey` 时使用。 */
  readonly label?: string;
  /** 说明翻译键。 */
  readonly hintKey?: string;
  /** 字面量说明。 */
  readonly hint?: string;
  /** 控件。 */
  readonly control: PreferenceControl;
  /** 返回 `false` 时控件禁用。 */
  readonly enabledWhen?: (prefs: AdminPreferences) => boolean;
}

/** 业务自定义偏好：值存放在 `extension.<key>`。 */
export interface PreferenceExtension {
  /** 扩展键，唯一。 */
  readonly key: string;
  /** 控件类型。 */
  readonly type: 'switch' | 'select' | 'number' | 'text';
  /** 默认值，类型必须与 `type` 匹配。 */
  readonly defaultValue: boolean | string | number;
  /** 字面量标题。 */
  readonly label?: string;
  /** 标题翻译键。 */
  readonly labelKey?: string;
  /** 字面量说明。 */
  readonly hint?: string;
  /** 说明翻译键。 */
  readonly hintKey?: string;
  /** 分组标题，缺省归入「通用」分组。 */
  readonly section?: string;
  /** 分组标题翻译键，优先于字面量标题。 */
  readonly sectionKey?: string;
  /** `select` 的选项。 */
  readonly options?: readonly PreferenceOption[];
  /** `number` 的下限。 */
  readonly min?: number;
  /** `number` 的上限。 */
  readonly max?: number;
  /** `number` 的步长。 */
  readonly step?: number;
}
