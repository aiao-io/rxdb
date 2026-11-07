import { customItem, numberItem, segmentedItem, switchItem, type ItemPlace } from './builders.js';
import type { PreferenceItem } from './types.js';
import { COLOR_PRESETS, RADII } from './values.js';

const place = (section: string): ItemPlace => ({ tab: 'appearance', section });

/** 「外观」页签：主题、主色、圆角、字号、半深色、灰/弱色模式、紧凑密度。 */
export const APPEARANCE_ITEMS: readonly PreferenceItem[] = [
  customItem(place('theme'), 'theme.name', { kind: 'themes' }),
  customItem(place('primaryColor'), 'theme.colorPrimary', { kind: 'color', presets: COLOR_PRESETS }),
  segmentedItem(place('radius'), 'theme.radius', RADII, true),
  numberItem(place('fontSize'), 'theme.fontSize', { min: 12, max: 22, unit: 'px', nullable: true }),
  switchItem(place('chrome'), 'theme.semiDarkSidebar'),
  switchItem(place('chrome'), 'theme.semiDarkHeader'),
  switchItem(place('colorMode'), 'app.colorGrayMode'),
  switchItem(place('colorMode'), 'app.colorWeakMode'),
  switchItem(place('density'), 'app.compact')
];
