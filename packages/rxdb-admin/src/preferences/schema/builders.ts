import { getPath } from '../merge.js';
import type { AdminPreferences } from '../types.js';
import type { PreferenceControl, PreferenceItem, PreferenceOption, PreferenceTab } from './types.js';

/** 条目所在位置。 */
export interface ItemPlace {
  readonly tab: PreferenceTab;
  readonly section: string;
}

type ItemExtras = Pick<PreferenceItem, 'enabledWhen' | 'hintKey'>;

const item = (place: ItemPlace, path: string, control: PreferenceControl, extras: ItemExtras = {}): PreferenceItem => ({
  id: path,
  path,
  tab: place.tab,
  section: place.section,
  control,
  ...extras
});

/**
 * 开关项。
 * @param place - 页签与分组。
 * @param path - 偏好路径。
 * @param extras - 禁用条件等。
 * @returns 偏好项。
 */
export const switchItem = (place: ItemPlace, path: string, extras?: ItemExtras): PreferenceItem =>
  item(place, path, { kind: 'switch' }, extras);

/**
 * 数字项。
 * @param place - 页签与分组。
 * @param path - 偏好路径。
 * @param range - 取值范围。
 * @param extras - 禁用条件等。
 * @returns 偏好项。
 */
export const numberItem = (
  place: ItemPlace,
  path: string,
  range: { min: number; max: number; step?: number; unit?: string; nullable?: boolean },
  extras?: ItemExtras
): PreferenceItem => item(place, path, { kind: 'number', step: 1, ...range }, extras);

/**
 * 文本项。
 * @param place - 页签与分组。
 * @param path - 偏好路径。
 * @param extras - 禁用条件等。
 * @returns 偏好项。
 */
export const textItem = (place: ItemPlace, path: string, extras?: ItemExtras): PreferenceItem =>
  item(place, path, { kind: 'text', placeholderKey: `prefs.item.${path}.placeholder` }, extras);

/**
 * 以 `prefs.option.<path>.<value>` 为翻译键生成选项。
 * @param path - 偏好路径。
 * @param values - 选项值。
 * @returns 选项列表。
 */
export const optionsFor = (path: string, values: readonly string[]): PreferenceOption[] =>
  values.map(value => ({ value, labelKey: `prefs.option.${path}.${value}` }));

/**
 * 下拉项（静态选项）。
 * @param place - 页签与分组。
 * @param path - 偏好路径。
 * @param values - 选项值。
 * @param extras - 禁用条件等。
 * @returns 偏好项。
 */
export const selectItem = (
  place: ItemPlace,
  path: string,
  values: readonly string[],
  extras?: ItemExtras
): PreferenceItem => item(place, path, { kind: 'select', options: optionsFor(path, values) }, extras);

/**
 * 分段按钮项。
 * @param place - 页签与分组。
 * @param path - 偏好路径。
 * @param values - 选项值。
 * @param nullable - 是否允许「跟随主题」（存储为 `null`）。
 * @param extras - 禁用条件等。
 * @returns 偏好项。
 */
export const segmentedItem = (
  place: ItemPlace,
  path: string,
  values: readonly string[],
  nullable = false,
  extras?: ItemExtras
): PreferenceItem => item(place, path, { kind: 'segmented', options: optionsFor(path, values), nullable }, extras);

/**
 * 带预览的卡片项。
 * @param place - 页签与分组。
 * @param path - 偏好路径。
 * @param values - 选项值。
 * @param preview - 预览样式。
 * @param extras - 禁用条件等。
 * @returns 偏好项。
 */
export const cardsItem = (
  place: ItemPlace,
  path: string,
  values: readonly string[],
  preview: 'layout' | 'transition' | 'tabbar',
  extras?: ItemExtras
): PreferenceItem => item(place, path, { kind: 'cards', options: optionsFor(path, values), preview }, extras);

/**
 * 专用控件项（主题网格、部件排序、快捷键列表、取色器）。
 * @param place - 页签与分组。
 * @param path - 偏好路径。
 * @param control - 控件。
 * @returns 偏好项。
 */
export const customItem = (place: ItemPlace, path: string, control: PreferenceControl): PreferenceItem =>
  item(place, path, control);

/**
 * 依赖另一个开关的禁用条件。
 * @param path - 开关的点分路径。
 * @returns 开关关闭时返回 `false` 的条件。
 */
export const whenOn =
  (path: string): ((prefs: AdminPreferences) => boolean) =>
  prefs =>
    getPath(prefs, path) === true;
