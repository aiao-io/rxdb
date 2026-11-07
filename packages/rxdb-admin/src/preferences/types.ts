/** 布局模式：侧栏 / 顶栏+侧栏 / 顶部导航 / 全屏内容。 */
export type LayoutMode = 'sidebar-nav' | 'header-sidebar-nav' | 'header-nav' | 'full-content';

/** 主题圆角档位（rem）。 */
export type Radius = '0' | '0.25' | '0.5' | '0.75' | '1';

/** 导航菜单风格。 */
export type NavigationStyle = 'rounded' | 'plain';

/** 面包屑风格。 */
export type BreadcrumbStyle = 'normal' | 'background';

/** 页签风格。 */
export type TabbarStyle = 'chrome' | 'plain' | 'card' | 'brisk';

/** 页签持久化位置：关闭 / 当前会话 / 本机长期。 */
export type TabbarPersist = 'off' | 'session' | 'local';

/** 页面切换动画。 */
export type TransitionName = 'fade' | 'fade-slide' | 'fade-up' | 'fade-down';

/** 内容区宽度约束。 */
export type ContentCompact = 'off' | 'wide';

/** 顶部导航菜单对齐方式。 */
export type MenuAlign = 'start' | 'center';

/** 顶栏部件键。 */
export type WidgetKey =
  'search' | 'theme' | 'language' | 'timezone' | 'fullscreen' | 'refresh' | 'lock' | 'preferences';

/** 全局偏好状态树的版本号，结构不兼容变更时递增。 */
export const PREFERENCES_VERSION = 1;

/**
 * 后台外壳的全局偏好树。
 *
 * @remarks
 * 持久化只保存相对默认值的差异，因此后续版本调整默认值时未改动过的用户会跟随新默认。
 */
export interface AdminPreferences {
  /** 应用级行为。 */
  app: {
    /** 布局模式。 */
    layout: LayoutMode;
    /** 标题随当前页面变化。 */
    dynamicTitle: boolean;
    /** 紧凑密度：收紧控件尺寸。 */
    compact: boolean;
    /** 界面语言，空串表示跟随运行时当前语言。 */
    locale: string;
    /** IANA 时区，空串表示浏览器时区。 */
    timezone: string;
    /** 灰色模式。 */
    colorGrayMode: boolean;
    /** 色弱模式。 */
    colorWeakMode: boolean;
    /** 显示水印。 */
    watermark: boolean;
    /** 水印文案，空串使用宿主提供的默认文案。 */
    watermarkContent: string;
  };
  /** 内容区。 */
  content: {
    /** 宽度约束。 */
    compact: ContentCompact;
    /** `wide` 时的最大宽度（px）。 */
    compactWidth: number;
    /** 四向内边距（px）。 */
    padding: { top: number; right: number; bottom: number; left: number };
  };
  /** 主题装饰层。 */
  theme: {
    /** 主题名；`system` 跟随系统明暗。 */
    name: string;
    /** 主色（`#rrggbb`），空串跟随主题自带。 */
    colorPrimary: string;
    /** 圆角档位，`null` 跟随主题自带。 */
    radius: Radius | null;
    /** 基础字号（px），`null` 跟随主题自带。 */
    fontSize: number | null;
    /** 半深色侧栏。 */
    semiDarkSidebar: boolean;
    /** 半深色顶栏。 */
    semiDarkHeader: boolean;
  };
  /** 侧栏。 */
  sidebar: {
    /** 是否渲染侧栏。 */
    enable: boolean;
    /** 折叠为图标轨。 */
    collapsed: boolean;
    /** 展开宽度（px）。 */
    width: number;
    /** 折叠宽度（px）。 */
    collapseWidth: number;
    /** 折叠时悬停临时展开。 */
    expandOnHover: boolean;
    /** 折叠时仍显示菜单标题。 */
    collapsedShowTitle: boolean;
    /** 允许拖拽调整宽度。 */
    draggable: boolean;
  };
  /** 导航菜单。 */
  navigation: {
    /** 菜单风格。 */
    styleType: NavigationStyle;
    /** 手风琴：同级只展开一个分组。 */
    accordion: boolean;
  };
  /** 顶栏。 */
  header: {
    /** 顶栏高度（px）。 */
    height: number;
    /** 顶部导航菜单对齐。 */
    menuAlign: MenuAlign;
  };
  /** 面包屑。 */
  breadcrumb: {
    /** 是否显示。 */
    enable: boolean;
    /** 只有一级时隐藏。 */
    hideOnlyOne: boolean;
    /** 显示图标。 */
    showIcon: boolean;
    /** 首项显示首页。 */
    showHome: boolean;
    /** 风格。 */
    styleType: BreadcrumbStyle;
  };
  /** 页签栏。 */
  tabbar: {
    /** 是否显示。 */
    enable: boolean;
    /** 持久化位置。 */
    persist: TabbarPersist;
    /** 允许拖拽排序。 */
    draggable: boolean;
    /** 显示图标。 */
    showIcon: boolean;
    /** 右键菜单提供「内容最大化」。 */
    showMaximize: boolean;
    /** 风格。 */
    styleType: TabbarStyle;
    /** 最多页签数，0 不限制。 */
    maxCount: number;
    /** 滚轮横向滚动页签。 */
    wheelable: boolean;
    /** 中键关闭页签。 */
    middleClickToClose: boolean;
    /** 记录访问历史。 */
    visitHistory: boolean;
  };
  /** 页脚。 */
  footer: {
    /** 是否显示。 */
    enable: boolean;
    /** 固定在视口底部。 */
    fixed: boolean;
    /** 高度（px）。 */
    height: number;
  };
  /** 版权信息。 */
  copyright: {
    /** 是否显示。 */
    enable: boolean;
    /** 公司名。 */
    companyName: string;
    /** 公司网站。 */
    companySiteLink: string;
    /** 年份。 */
    date: string;
    /** 备案号。 */
    icp: string;
    /** 备案链接。 */
    icpLink: string;
  };
  /** Logo。 */
  logo: {
    /** 是否显示。 */
    enable: boolean;
    /** 图片地址，空串只显示文字。 */
    source: string;
    /** 同时显示应用名。 */
    showText: boolean;
  };
  /** 页面切换。 */
  transition: {
    /** 启用切换动画。 */
    enable: boolean;
    /** 动画名。 */
    name: TransitionName;
    /** 顶部进度条。 */
    progress: boolean;
    /** 导航中的遮罩加载态。 */
    loading: boolean;
  };
  /** 命令面板。 */
  palette: {
    /** 每组最多结果数。 */
    maxResults: number;
    /** 空查询时显示的最近使用条数，0 关闭。 */
    recents: number;
  };
  /** 快捷键。 */
  shortcuts: {
    /** 总开关。 */
    enable: boolean;
    /** 被用户关闭的快捷键 id。 */
    disabled: string[];
  };
  /** 顶栏部件。 */
  widget: {
    /** 部件顺序，始终是 {@link WidgetKey} 的一个排列。 */
    order: WidgetKey[];
    /** 被隐藏的部件；`preferences` 不可隐藏。 */
    hidden: WidgetKey[];
  };
  /** 应用注册的扩展偏好，键为扩展 key。 */
  extension: Record<string, unknown>;
}

/** 深部分类型：数组字段整体替换，对象字段递归。 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K]
  : T[K] extends object ? DeepPartial<T[K]>
  : T[K];
};
