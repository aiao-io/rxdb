import { cardsItem, customItem, numberItem, switchItem, textItem, whenOn, type ItemPlace } from './builders.js';
import type { PreferenceItem } from './types.js';
import { TRANSITIONS } from './values.js';

const shortcuts = (section: string): ItemPlace => ({ tab: 'shortcuts', section });
const general = (section: string): ItemPlace => ({ tab: 'general', section });

/** 「快捷键」页签：总开关、已注册快捷键列表、命令面板。 */
export const SHORTCUT_ITEMS: readonly PreferenceItem[] = [
  switchItem(shortcuts('shortcuts'), 'shortcuts.enable'),
  customItem(shortcuts('shortcuts'), 'shortcuts', { kind: 'shortcuts' }),
  numberItem(shortcuts('palette'), 'palette.maxResults', { min: 3, max: 20 }),
  numberItem(shortcuts('palette'), 'palette.recents', { min: 0, max: 10 })
];

/** 「通用」页签：语言与时区、页面切换、标题、水印、版权、Logo。 */
export const GENERAL_ITEMS: readonly PreferenceItem[] = [
  {
    id: 'app.locale',
    path: 'app.locale',
    ...general('language'),
    control: { kind: 'select', options: { source: 'locales' } }
  },
  {
    id: 'app.timezone',
    path: 'app.timezone',
    ...general('language'),
    control: { kind: 'select', options: { source: 'timezones' } }
  },
  cardsItem(general('transition'), 'transition.name', TRANSITIONS, 'transition', {
    enabledWhen: whenOn('transition.enable')
  }),
  switchItem(general('transition'), 'transition.enable'),
  switchItem(general('transition'), 'transition.progress'),
  switchItem(general('transition'), 'transition.loading'),
  switchItem(general('title'), 'app.dynamicTitle'),
  switchItem(general('watermark'), 'app.watermark'),
  textItem(general('watermark'), 'app.watermarkContent', { enabledWhen: whenOn('app.watermark') }),
  switchItem(general('copyright'), 'copyright.enable'),
  textItem(general('copyright'), 'copyright.companyName', { enabledWhen: whenOn('copyright.enable') }),
  textItem(general('copyright'), 'copyright.companySiteLink', { enabledWhen: whenOn('copyright.enable') }),
  textItem(general('copyright'), 'copyright.date', { enabledWhen: whenOn('copyright.enable') }),
  textItem(general('copyright'), 'copyright.icp', { enabledWhen: whenOn('copyright.enable') }),
  textItem(general('copyright'), 'copyright.icpLink', { enabledWhen: whenOn('copyright.enable') }),
  switchItem(general('logo'), 'logo.enable'),
  textItem(general('logo'), 'logo.source', { enabledWhen: whenOn('logo.enable') }),
  switchItem(general('logo'), 'logo.showText', { enabledWhen: whenOn('logo.enable') })
];
