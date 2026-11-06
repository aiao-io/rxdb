import type { I18n } from '@aiao/rxdb-i18n';
import type { LayoutState } from '../layout/layout-state.js';
import type { BreadcrumbItem, MenuNode } from '../layout/menu.js';
import type { ShellUi } from '../layout/ui-state.js';
import type { PaletteController } from '../palette/controller.js';
import type { DrawerTab } from '../preferences/drawer-model.js';
import type { PreferenceExtension } from '../preferences/schema/index.js';
import type { PreferencesStore, PreferencesStoreOptions } from '../preferences/store.js';
import type { AdminPreferences, DeepPartial, WidgetKey } from '../preferences/types.js';
import type { ShortcutRegistry } from '../shortcuts/registry.js';
import type { StorageLike } from '../storage.js';
import type { ReadableStore, Store } from '../store.js';
import type { TabsStore } from '../tabs/tabs-store.js';
import type { ThemeOption } from '../theme/themes.js';
import type { FullscreenController } from '../widgets/fullscreen.js';
import type { LockController, PasswordHasher } from '../widgets/lock.js';

/** 外壳依赖的浏览器宿主，缺省取全局对象；SSR 与测试可以不提供。 */
export interface ShellHost {
  /** 窗口：键盘、存储事件、媒体查询、`navigator`。 */
  readonly window?: Window;
  /** 文档：根节点样式、标题、全屏。 */
  readonly document?: Document;
}

/** 创建外壳的选项。 */
export interface AdminShellOptions<TIcon = unknown> {
  /** 路由跳转，外壳本身与路由库无关。 */
  readonly navigate: (url: string) => void;
  /** 初始导航菜单，之后用 {@link AdminShell.setMenu} 更新。 */
  readonly menu?: readonly MenuNode<TIcon>[];
  /** 初始地址，缺省取 `window.location.pathname`。 */
  readonly initialUrl?: string;
  /** 首页地址：关闭最后一个页签后回到这里，缺省 `/`。 */
  readonly homeUrl?: string;
  /** 品牌：用于侧栏 / 顶栏的应用名、动态标题与水印默认文案。 */
  readonly brand?: { readonly title: string };
  /** 应用自己的国际化运行时；需要把 `adminMessages` 加入它的 `catalogs`。缺省使用只含外壳目录的静态运行时（中文）。 */
  readonly i18n?: I18n;
  /** 可选主题，必须与样式里启用的 daisyUI 主题一致，缺省 `light` / `dark`。 */
  readonly themes?: readonly ThemeOption[];
  /** 应用级默认偏好，覆盖包内默认值。 */
  readonly defaults?: DeepPartial<AdminPreferences>;
  /** 业务扩展偏好，显示在「拓展」页签。 */
  readonly extensions?: readonly PreferenceExtension[];
  /** 首次使用时从旧版本存储键迁移偏好。 */
  readonly migrateLegacy?: PreferencesStoreOptions['migrateLegacy'];
  /** 持久化介质，缺省取 `localStorage` / `sessionStorage`。 */
  readonly storage?: { readonly local?: StorageLike; readonly session?: StorageLike };
  /** 存储键前缀，同源多应用时用于隔离，缺省 `aiao.admin`。 */
  readonly storagePrefix?: string;
  /** 移动端断点（px），缺省 768。 */
  readonly mobileBreakpoint?: number;
  /** 锁屏密码哈希，缺省 PBKDF2-SHA256（Web Crypto）。 */
  readonly lockHasher?: PasswordHasher;
  /** 宿主对象，缺省取全局。 */
  readonly host?: ShellHost;
}

/** 注册到命令面板的命令。 */
export interface ShellCommand {
  /** 唯一标识。 */
  readonly id: string;
  /** 显示文本。 */
  readonly label: string;
  /** 额外检索词。 */
  readonly keywords?: readonly string[];
  /** 执行。 */
  readonly run: () => void | Promise<void>;
}

/** 主题控制。 */
export interface ShellTheme {
  /** 可选主题。 */
  readonly options: readonly ThemeOption[];
  /** 已解析的具体主题名（`system` 已按系统明暗解析）。 */
  readonly resolved: ReadableStore<string>;
  /** 当前是否深色。 */
  readonly isDark: ReadableStore<boolean>;
  /** 半深色侧栏 / 顶栏使用的深色主题名；可选主题里没有深色主题时为 `undefined`。 */
  readonly darkName: string | undefined;
  /**
   * 选择主题。
   * @param name - 主题名或 `system`。
   */
  set(name: string): void;
  /** 在 system → 浅色 → 深色 之间循环。 */
  cycle(): void;
  /**
   * 主题的显示名。
   * @param name - 主题名或 `system`。
   */
  label(name: string): string;
}

/** 后台外壳运行时：聚合偏好、主题、布局、页签、快捷键、命令面板与锁屏。三端绑定都是它的薄封装。 */
export interface AdminShell<TIcon = unknown> {
  /** 偏好状态树。 */
  readonly preferences: PreferencesStore;
  /** 瞬时界面状态与动作。 */
  readonly ui: ShellUi;
  /** 导航菜单。 */
  readonly menu: Store<readonly MenuNode<TIcon>[]>;
  /** 当前地址。 */
  readonly currentUrl: ReadableStore<string>;
  /** 由偏好 / 视口 / 菜单推导的布局。 */
  readonly layout: ReadableStore<LayoutState>;
  /** 移动端宽度。 */
  readonly isMobile: ReadableStore<boolean>;
  /** 面包屑。 */
  readonly breadcrumb: ReadableStore<BreadcrumbItem<TIcon>[]>;
  /** 顶栏上可见的部件，按顺序。 */
  readonly widgets: ReadableStore<WidgetKey[]>;
  /** 偏好抽屉的视图模型。 */
  readonly drawer: ReadableStore<readonly DrawerTab[]>;
  /** 水印的 CSS `background-image` 值，未启用为空串。 */
  readonly watermark: ReadableStore<string>;
  /** 生效的时区（IANA）。 */
  readonly timezone: ReadableStore<string>;
  /** 文案修订号，语言或目录变化时递增；绑定据此重新渲染。 */
  readonly text: ReadableStore<number>;
  /** 应用品牌名。 */
  readonly brandTitle: string;
  /** 首页地址。 */
  readonly homeUrl: string;
  /** 国际化运行时。 */
  readonly i18n: I18n;
  /** 主题。 */
  readonly theme: ShellTheme;
  /** 快捷键注册中心。 */
  readonly shortcuts: ShortcutRegistry;
  /** 页签。 */
  readonly tabs: TabsStore;
  /** 命令面板。 */
  readonly palette: PaletteController;
  /** 锁屏。 */
  readonly lock: LockController;
  /** 全屏。 */
  readonly fullscreen: FullscreenController;
  /**
   * 翻译外壳文案。
   * @param key - 文案键。
   * @param params - ICU 参数。
   */
  t(key: string, params?: Record<string, unknown>): string;
  /**
   * 路由变化后调用：同步当前地址、打开页签、收起移动端抽屉。
   * @param url - 当前地址。
   */
  syncRoute(url: string): void;
  /**
   * 跳转到地址（经 `options.navigate`）。
   * @param url - 目标地址。
   */
  navigate(url: string): void;
  /**
   * 更新导航菜单（语言切换、实体注册变化后）。
   * @param nodes - 菜单树。
   */
  setMenu(nodes: readonly MenuNode<TIcon>[]): void;
  /**
   * 注册命令面板命令。
   * @param command - 命令。
   * @returns 注销函数。
   */
  registerCommand(command: ShellCommand): () => void;
  /**
   * 激活页签（跳转到它的地址）。
   * @param key - 页签键。
   */
  activateTab(key: string): void;
  /**
   * 关闭页签；关闭当前页签会跳转到下一个。
   * @param key - 页签键。
   */
  closeTab(key: string): void;
  /**
   * 关闭其他页签。
   * @param key - 保留的页签键。
   */
  closeOtherTabs(key: string): void;
  /**
   * 关闭左侧页签。
   * @param key - 基准页签键。
   */
  closeLeftTabs(key: string): void;
  /**
   * 关闭右侧页签。
   * @param key - 基准页签键。
   */
  closeRightTabs(key: string): void;
  /** 关闭全部非固定页签。 */
  closeAllTabs(): void;
  /**
   * 在新窗口打开页签。
   * @param key - 页签键。
   */
  openTabInNewWindow(key: string): void;
  /** 折叠 / 展开侧栏（移动端为打开 / 关闭抽屉）。 */
  toggleSidebar(): void;
  /**
   * 按所选时区与语言格式化日期。
   * @param date - 时刻。
   * @param options - `Intl.DateTimeFormat` 选项。
   */
  formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string;
  /**
   * 绑定浏览器：全局快捷键、根节点主题 / 布局变量、动态标题、语言偏好。幂等。
   * @returns 解除绑定函数。
   */
  attach(): () => void;
  /** 解除绑定并释放监听、落盘待定写入。 */
  destroy(): void;
}
