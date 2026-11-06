import {
  cardsItem,
  customItem,
  numberItem,
  segmentedItem,
  selectItem,
  switchItem,
  whenOn,
  type ItemPlace
} from './builders.js';
import type { PreferenceItem } from './types.js';
import {
  BREADCRUMB_STYLES,
  CONTENT_COMPACTS,
  LAYOUT_MODES,
  MENU_ALIGNS,
  NAVIGATION_STYLES,
  TABBAR_PERSISTS,
  TABBAR_STYLES
} from './values.js';

const place = (section: string): ItemPlace => ({ tab: 'layout', section });

const SIDEBAR_RANGE = { min: 160, max: 320, unit: 'px' };
const PADDING_RANGE = { min: 0, max: 48, unit: 'px' };

/** 「布局」页签：布局模式、侧栏、顶栏、部件、面包屑、页签栏、内容区、页脚。 */
export const LAYOUT_ITEMS: readonly PreferenceItem[] = [
  cardsItem(place('layout'), 'app.layout', LAYOUT_MODES, 'layout'),
  switchItem(place('sidebar'), 'sidebar.enable'),
  switchItem(place('sidebar'), 'sidebar.collapsed', { enabledWhen: whenOn('sidebar.enable') }),
  numberItem(place('sidebar'), 'sidebar.width', SIDEBAR_RANGE, { enabledWhen: whenOn('sidebar.enable') }),
  switchItem(place('sidebar'), 'sidebar.expandOnHover', { enabledWhen: whenOn('sidebar.enable') }),
  switchItem(place('sidebar'), 'sidebar.collapsedShowTitle', { enabledWhen: whenOn('sidebar.enable') }),
  switchItem(place('sidebar'), 'sidebar.draggable', { enabledWhen: whenOn('sidebar.enable') }),
  switchItem(place('navigation'), 'navigation.accordion'),
  segmentedItem(place('navigation'), 'navigation.styleType', NAVIGATION_STYLES),
  numberItem(place('header'), 'header.height', { min: 40, max: 72, unit: 'px' }),
  segmentedItem(place('header'), 'header.menuAlign', MENU_ALIGNS),
  customItem(place('widgets'), 'widget', { kind: 'widgets' }),
  switchItem(place('breadcrumb'), 'breadcrumb.enable'),
  switchItem(place('breadcrumb'), 'breadcrumb.hideOnlyOne', { enabledWhen: whenOn('breadcrumb.enable') }),
  switchItem(place('breadcrumb'), 'breadcrumb.showIcon', { enabledWhen: whenOn('breadcrumb.enable') }),
  switchItem(place('breadcrumb'), 'breadcrumb.showHome', { enabledWhen: whenOn('breadcrumb.enable') }),
  segmentedItem(place('breadcrumb'), 'breadcrumb.styleType', BREADCRUMB_STYLES, false, {
    enabledWhen: whenOn('breadcrumb.enable')
  }),
  switchItem(place('tabbar'), 'tabbar.enable'),
  cardsItem(place('tabbar'), 'tabbar.styleType', TABBAR_STYLES, 'tabbar', { enabledWhen: whenOn('tabbar.enable') }),
  selectItem(place('tabbar'), 'tabbar.persist', TABBAR_PERSISTS, { enabledWhen: whenOn('tabbar.enable') }),
  numberItem(place('tabbar'), 'tabbar.maxCount', { min: 0, max: 30 }, { enabledWhen: whenOn('tabbar.enable') }),
  switchItem(place('tabbar'), 'tabbar.draggable', { enabledWhen: whenOn('tabbar.enable') }),
  switchItem(place('tabbar'), 'tabbar.showIcon', { enabledWhen: whenOn('tabbar.enable') }),
  switchItem(place('tabbar'), 'tabbar.showMaximize', { enabledWhen: whenOn('tabbar.enable') }),
  switchItem(place('tabbar'), 'tabbar.wheelable', { enabledWhen: whenOn('tabbar.enable') }),
  switchItem(place('tabbar'), 'tabbar.middleClickToClose', { enabledWhen: whenOn('tabbar.enable') }),
  switchItem(place('tabbar'), 'tabbar.visitHistory', { enabledWhen: whenOn('tabbar.enable') }),
  selectItem(place('content'), 'content.compact', CONTENT_COMPACTS),
  numberItem(
    place('content'),
    'content.compactWidth',
    { min: 640, max: 1920, step: 10, unit: 'px' },
    { enabledWhen: prefs => prefs.content.compact === 'wide' }
  ),
  numberItem(place('content'), 'content.padding.top', PADDING_RANGE),
  numberItem(place('content'), 'content.padding.right', PADDING_RANGE),
  numberItem(place('content'), 'content.padding.bottom', PADDING_RANGE),
  numberItem(place('content'), 'content.padding.left', PADDING_RANGE),
  switchItem(place('footer'), 'footer.enable'),
  switchItem(place('footer'), 'footer.fixed', { enabledWhen: whenOn('footer.enable') }),
  numberItem(
    place('footer'),
    'footer.height',
    { min: 32, max: 96, unit: 'px' },
    { enabledWhen: whenOn('footer.enable') }
  )
];
