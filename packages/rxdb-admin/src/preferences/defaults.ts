import type { AdminPreferences, WidgetKey } from './types.js';

/** 顶栏部件的默认顺序。 */
export const DEFAULT_WIDGET_ORDER: readonly WidgetKey[] = [
  'search',
  'language',
  'timezone',
  'theme',
  'fullscreen',
  'refresh',
  'lock',
  'preferences'
];

/** 不允许被隐藏的部件：隐藏后设置入口只剩快捷键，关闭快捷键将无法再打开设置。 */
export const PINNED_WIDGETS: readonly WidgetKey[] = ['preferences'];

/** 默认偏好。 */
export const defaultPreferences: AdminPreferences = {
  app: {
    layout: 'sidebar-nav',
    dynamicTitle: true,
    compact: false,
    locale: '',
    timezone: '',
    colorGrayMode: false,
    colorWeakMode: false,
    watermark: false,
    watermarkContent: ''
  },
  content: {
    compact: 'off',
    compactWidth: 1200,
    padding: { top: 0, right: 0, bottom: 0, left: 0 }
  },
  theme: {
    name: 'system',
    colorPrimary: '',
    radius: null,
    fontSize: null,
    semiDarkSidebar: false,
    semiDarkHeader: false
  },
  sidebar: {
    enable: true,
    collapsed: false,
    width: 240,
    collapseWidth: 48,
    expandOnHover: true,
    collapsedShowTitle: false,
    draggable: true
  },
  navigation: { styleType: 'rounded', accordion: true },
  header: { height: 56, menuAlign: 'start' },
  breadcrumb: { enable: true, hideOnlyOne: false, showIcon: true, showHome: false, styleType: 'normal' },
  tabbar: {
    enable: true,
    persist: 'session',
    draggable: true,
    showIcon: true,
    showMaximize: true,
    styleType: 'chrome',
    maxCount: 0,
    wheelable: true,
    middleClickToClose: true,
    visitHistory: true
  },
  footer: { enable: false, fixed: false, height: 48 },
  copyright: {
    enable: true,
    companyName: '',
    companySiteLink: '',
    date: String(new Date().getFullYear()),
    icp: '',
    icpLink: ''
  },
  logo: { enable: true, source: '', showText: true },
  transition: { enable: true, name: 'fade-slide', progress: true, loading: false },
  palette: { maxResults: 8, recents: 5 },
  shortcuts: { enable: true, disabled: [] },
  widget: { order: [...DEFAULT_WIDGET_ORDER], hidden: [] },
  extension: {}
};
