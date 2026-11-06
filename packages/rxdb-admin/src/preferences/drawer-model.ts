import { getPath } from './merge.js';
import {
  PREFERENCE_TABS,
  type PreferenceControl,
  type PreferenceItem,
  type PreferenceOption,
  type PreferenceOptionSource,
  type PreferencePreview,
  type PreferenceTab
} from './schema/index.js';
import type { AdminPreferences } from './types.js';

/** 已翻译的选项。 */
export interface ResolvedOption {
  /** 选项值。 */
  readonly value: string;
  /** 显示文本。 */
  readonly label: string;
}

/** 已解析选项文案的控件，三端按 `kind` 渲染。 */
export type ResolvedControl =
  | { readonly kind: 'switch' }
  | { readonly kind: 'select'; readonly options: ResolvedOption[] }
  | { readonly kind: 'segmented'; readonly options: ResolvedOption[] }
  | { readonly kind: 'cards'; readonly options: ResolvedOption[]; readonly preview: PreferencePreview }
  | {
      readonly kind: 'number';
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly unit?: string;
      readonly nullable: boolean;
    }
  | { readonly kind: 'text'; readonly placeholder?: string }
  | { readonly kind: 'color'; readonly presets: readonly string[] }
  | { readonly kind: 'themes' }
  | { readonly kind: 'widgets' }
  | { readonly kind: 'shortcuts' };

/** 抽屉里的一行设置。 */
export interface DrawerRow {
  /** 偏好项标识。 */
  readonly id: string;
  /** 偏好路径。 */
  readonly path: string;
  /** 标题。 */
  readonly label: string;
  /** 说明。 */
  readonly hint?: string;
  /** 控件。 */
  readonly control: ResolvedControl;
  /** 当前值；可空分段控件的「默认」用空串表示。 */
  readonly value: unknown;
  /** 是否可操作。 */
  readonly enabled: boolean;
  /** 标题与所在分组标题重复（分组只有这一行）时为 `true`：视觉上隐藏标题，仍保留给辅助技术。 */
  readonly labelHidden: boolean;
  /** 写入新值；可空分段控件的空串写为 `null`。 */
  set(value: unknown): void;
}

/** 抽屉里的一个分组。 */
export interface DrawerSection {
  /** 分组标识。 */
  readonly id: string;
  /** 分组标题。 */
  readonly title: string;
  /** 分组内的设置行。 */
  readonly rows: DrawerRow[];
}

/** 抽屉里的一个页签。 */
export interface DrawerTab {
  /** 页签标识。 */
  readonly id: PreferenceTab;
  /** 页签标题。 */
  readonly label: string;
  /** 分组。 */
  readonly sections: DrawerSection[];
}

/** {@link buildDrawerModel} 的输入。 */
export interface DrawerModelInput {
  /** 当前偏好。 */
  readonly prefs: AdminPreferences;
  /** 偏好项（内置 + 扩展）。 */
  readonly items: readonly PreferenceItem[];
  /** 翻译函数。 */
  readonly translate: (key: string) => string;
  /** 运行时才能确定的选项来源。 */
  readonly sources: Readonly<Record<PreferenceOptionSource, readonly PreferenceOption[]>>;
  /** 写入偏好。 */
  readonly write: (path: string, value: unknown) => void;
}

type Translate = DrawerModelInput['translate'];

const resolveOption = (option: PreferenceOption, translate: Translate): ResolvedOption => ({
  value: option.value,
  label: option.labelKey ? translate(option.labelKey) : (option.label ?? option.value)
});

const resolveControl = (control: PreferenceControl, input: DrawerModelInput): ResolvedControl => {
  const { translate, sources } = input;
  switch (control.kind) {
    case 'select': {
      const options = 'source' in control.options ? sources[control.options.source] : control.options;
      return { kind: 'select', options: options.map(option => resolveOption(option, translate)) };
    }
    case 'segmented': {
      const base = control.options.map(option => resolveOption(option, translate));
      const withDefault = control.nullable ? [{ value: '', label: translate('prefs.option.default') }, ...base] : base;
      return { kind: 'segmented', options: withDefault };
    }
    case 'cards':
      return {
        kind: 'cards',
        options: control.options.map(option => resolveOption(option, translate)),
        preview: control.preview
      };
    case 'number':
      return { ...control, nullable: control.nullable ?? false };
    case 'text':
      return { kind: 'text', ...(control.placeholderKey ? { placeholder: translate(control.placeholderKey) } : {}) };
    default:
      return control;
  }
};

const labelOf = (item: PreferenceItem, translate: Translate): string =>
  item.labelKey ? translate(item.labelKey) : (item.label ?? translate(`prefs.item.${item.path}`));

const hintOf = (item: PreferenceItem, translate: Translate): string | undefined =>
  item.hintKey ? translate(item.hintKey) : item.hint;

const toRow = (item: PreferenceItem, input: DrawerModelInput): Omit<DrawerRow, 'labelHidden'> => {
  const control = resolveControl(item.control, input);
  const raw = getPath(input.prefs, item.path);
  const nullableSegment = item.control.kind === 'segmented' && item.control.nullable === true;
  const hint = hintOf(item, input.translate);
  return {
    id: item.id,
    path: item.path,
    label: labelOf(item, input.translate),
    ...(hint ? { hint } : {}),
    control,
    value: nullableSegment ? (raw ?? '') : raw,
    enabled: item.enabledWhen?.(input.prefs) ?? true,
    set: value => input.write(item.path, nullableSegment && value === '' ? null : value)
  };
};

const sectionTitle = (item: PreferenceItem, translate: Translate): string =>
  item.sectionLabel ?? translate(`prefs.section.${item.section}`);

/**
 * 由偏好项构建抽屉的页签 / 分组 / 设置行视图模型：文案已翻译、选项已解析、当前值与可操作状态已计算，
 * 三端只需按 `control.kind` 渲染，不再各自判断。
 * @param input - 偏好、偏好项、翻译与写入函数。
 * @returns 固定顺序的页签；没有内容的页签 `sections` 为空。
 */
export function buildDrawerModel(input: DrawerModelInput): DrawerTab[] {
  return PREFERENCE_TABS.map(tab => {
    const sections: DrawerSection[] = [];
    for (const item of input.items.filter(candidate => candidate.tab === tab)) {
      const id = item.sectionLabel ?? item.section;
      let section = sections.find(candidate => candidate.id === id);
      if (!section) {
        section = { id, title: sectionTitle(item, input.translate), rows: [] };
        sections.push(section);
      }
      section.rows.push({ ...toRow(item, input), labelHidden: false });
    }
    for (const section of sections) {
      const [only] = section.rows;
      if (section.rows.length === 1 && only.label === section.title) section.rows[0] = { ...only, labelHidden: true };
    }
    return { id: tab, label: input.translate(`prefs.tab.${tab}`), sections };
  });
}
