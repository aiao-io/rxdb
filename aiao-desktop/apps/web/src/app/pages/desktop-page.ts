import { I18N, useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, DestroyRef, ViewEncapsulation, afterNextRender, effect, inject } from '@angular/core';

import { FinderClipboard } from '../apps/finder/finder-clipboard';
import { FinderSidebarOrder } from '../apps/finder/finder-sidebar-order';
import { MailComposer } from '../apps/mail/mail-composer';
import { desktopAppRegistry } from '../apps/registry';
import { SafariBrowsers } from '../apps/safari/safari-browsers';
import { DesktopShell } from '../components/desktop-shell';
import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { AppLauncher } from '../services/app-launcher';
import { AppNotifications } from '../services/app-notifications';
import { ApplicationCatalog } from '../services/application-catalog';
import { ApplicationRegistry } from '../services/application-registry';
import { ApplicationRuntime } from '../services/application-runtime';
import { ApplicationTransitions } from '../services/application-transitions';
import { BrowserSessionRestore } from '../services/browser-session-restore';
import { CalendarStore } from '../services/calendar-store';
import { Clock } from '../services/clock';
import { DesktopAppServices } from '../services/desktop-app-services';
import { DESKTOP_APPS } from '../services/desktop-apps';
import { DesktopBackup } from '../services/desktop-backup';
import { DesktopItems } from '../services/desktop-items';
import { DesktopMenus } from '../services/desktop-menus';
import { DockDragController } from '../services/dock-drag';
import { DockLayoutStore } from '../services/dock-layout';
import { DockState } from '../services/dock-state';
import { FileImport } from '../services/file-import';
import { FileOpener } from '../services/file-opener';
import { FilePanels } from '../services/file-panels';
import { FileSystem, HOME_PATH, describeDiskError } from '../services/file-system';
import { FinderPreferences } from '../services/finder-preferences';
import { ImageThumbnailCache } from '../services/image-thumbnail-cache';
import { InstalledApplications } from '../services/installed-applications';
import { isMenuCommand } from '../services/menu';
import { MenuBarMenus } from '../services/menu-bar-menus';
import { Overlays } from '../services/overlays';
import { PopoverService } from '../services/popover';
import { RuntimeActivity } from '../services/runtime-activity';
import { Session } from '../services/session';
import {
  hasPrimaryModifier,
  isBrowserShortcut,
  isPlainSpace,
  isTextEditingShortcut,
  matchesShortcut
} from '../services/shortcuts';
import { SystemSettingsStore } from '../services/system-settings';
import { SystemState } from '../services/system-state';
import { ThemeService } from '../services/theme';
import { Toast } from '../services/toast';
import { WallpaperService } from '../services/wallpaper';
import { WeatherStore } from '../services/weather-store';
import { WindowLayoutStore } from '../services/window-layout';
import { WindowManager } from '../services/window-manager';

/** 输入框、可编辑区与终端保留浏览器自己的右键菜单。 */
const NATIVE_MENU = 'input,textarea,[contenteditable="true"],.tm-body';

/** 桌面页：提供整套桌面状态，挂全局快捷键，并按顺序启动桌面。 */
@Component({
  selector: 'app-desktop-page',
  imports: [DesktopShell],
  templateUrl: './desktop-page.html',
  styleUrl: './desktop-page.scss',
  encapsulation: ViewEncapsulation.None,
  providers: [
    { provide: DESKTOP_APPS, useFactory: desktopAppRegistry },
    DesktopData,
    DesktopAppServices,
    AppNotifications,
    DesktopBackup,
    Preferences,
    BrowserSessionRestore,
    SystemState,
    SystemSettingsStore,
    ThemeService,
    Toast,
    PopoverService,
    Clock,
    DockState,
    DockLayoutStore,
    DockDragController,
    WindowManager,
    WindowLayoutStore,
    Overlays,
    AppLauncher,
    Session,
    RuntimeActivity,
    WallpaperService,
    ApplicationRegistry,
    InstalledApplications,
    ApplicationTransitions,
    ApplicationCatalog,
    ApplicationRuntime,
    MenuBarMenus,
    FileSystem,
    ImageThumbnailCache,
    FileImport,
    FinderClipboard,
    FileOpener,
    FilePanels,
    FinderPreferences,
    FinderSidebarOrder,
    DesktopItems,
    CalendarStore,
    WeatherStore,
    DesktopMenus,
    SafariBrowsers,
    MailComposer
  ],
  host: {
    '[style.display]': '"block"',
    '[style.width]': '"100%"',
    '[style.height]': '"100%"',
    '(document:keydown)': 'shortcut($event)',
    '(document:keyup)': 'releaseTab()',
    '(window:blur)': 'releaseTab()',
    '(document:contextmenu)': 'nativeMenu($event)',
    '(document:dragstart)': '$event.preventDefault()',
    '(window:pointerup)': 'resetCursor()',
    '(window:resize)': 'wm.keepOnScreen()',
    '(window:pagehide)': 'layout.flush()',
    '(document:visibilitychange)': 'layout.flush()'
  }
})
export class DesktopPage {
  private readonly system = inject(SystemState);
  private readonly theme = inject(ThemeService);
  private readonly popover = inject(PopoverService);
  private readonly overlays = inject(Overlays);
  private readonly wallpaper = inject(WallpaperService);
  private readonly backup = inject(DesktopBackup);
  private readonly toast = inject(Toast);
  private readonly session = inject(Session);
  private readonly menuBarMenus = inject(MenuBarMenus);
  private readonly fs = inject(FileSystem);

  protected readonly wm = inject(WindowManager);
  protected readonly layout = inject(WindowLayoutStore);
  protected readonly i18n = useI18n();

  constructor() {
    this.theme.setAppearance(this.system.appearance());
    this.wallpaper.set(this.system.wallpaper());
    /* 设置存在本地库里：库就绪后恢复上次的外观、壁纸、Dock 等，之后的改动自动写回。 */
    inject(SystemSettingsStore);
    /* i18n 串行于桌面数据之后初始化（US-132 设计决策 3）：i18n 的 connect 引导不持 STARTUP_LOCK，
       过早 init 会静默补建表、掩盖 probeSchema 的损坏探测，并与其他标签页的升级交错。失败不阻断桌面：
       目录随包可用，语言偏好未落库时界面仍按设备语言显示。桌面数据打不开（corrupt/too-new/selection 损坏等）
       由 DesktopData 的阻断界面按设计呈现，不算 i18n 失败；这里只记录 init 本身的失败。
       注入必须在构造器的注入上下文里解析，回调里只用解析出来的实例（回调里再 inject 会抛 NG0203）。 */
    const desktopData = inject(DesktopData);
    const i18nRuntime = inject(I18N);
    void desktopData.ready
      .then(
        () => i18nRuntime.init(),
        () => undefined
      )
      .catch((error: unknown) => console.error('i18n init failed', error));
    /* 界面语言跟随运行时：zh-CN 设备上 locale 为 zh-CN（文案来自 zh 目录），lang 按设备链写、不强制归一。 */
    effect(() => {
      document.documentElement.lang = this.i18n.locale();
    });
    afterNextRender(() => {
      void this.startWindows();
      void this.backup
        .cleanupInterruptedRestore()
        .catch((error: unknown) =>
          this.toast.show(`Restore cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
        );
    });
    /* 电量缓慢下降，桌面永远不会完全静止。 */
    const drift = setInterval(() => this.driftBattery(), 42000);
    inject(DestroyRef).onDestroy(() => clearInterval(drift));
  }

  protected shortcut(event: KeyboardEvent): void {
    /* Tab 按下期间焦点落进后台窗口，说明用户用 Tab 走进了它：窗口随之成为前台（见 WindowFrame）。 */
    this.wm.tabbing = event.key === 'Tab';
    /* 锁屏、开机、睡眠与重启/关机确认期间桌面不响应快捷键；跳过开机与解锁由各自的界面处理。 */
    if (
      this.session.locked() ||
      this.session.boot() ||
      this.session.sleep() !== 'awake' ||
      this.session.confirm() !== null
    )
      return;
    if (event.key === 'Escape' && this.dismissOverlay()) return;
    if (event.key === 'F4') {
      event.preventDefault();
      this.overlays.toggleLaunchpad();
      return;
    }
    /* ⌃↑ 是 Mission Control 系统手势的键盘版：切换全屏窗口总览。 */
    if (event.key === 'ArrowUp' && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat) this.overlays.toggleMission();
      return;
    }
    const meta = event.metaKey || event.ctrlKey;
    if (!meta) {
      /* 菜单里没有修饰键的命令（音乐的空格播放）：焦点不在可交互控件上时才生效。 */
      if (isPlainSpace(event) && !this.typing() && !this.interactiveTarget(event) && this.runMenuShortcut(event)) {
        event.preventDefault();
      }
      return;
    }
    /* ⌘Space 始终打开聚焦搜索，不归输入框或应用菜单。 */
    if (event.code === 'Space') {
      event.preventDefault();
      this.overlays.toggleSpotlight();
      return;
    }
    /* 聚焦搜索（或别的全屏浮层）打开时，⌘K 先处理浮层，不交给底下的应用菜单（例如终端的清屏）。 */
    const key = event.key.toLowerCase();
    if (
      key === 'k' &&
      (this.overlays.spotlight() !== 'closed' ||
        this.overlays.launchpad() !== 'closed' ||
        this.overlays.notifications() === 'open')
    ) {
      event.preventDefault();
      this.overlays.toggleSpotlight();
      return;
    }
    /* 输入框里先让浏览器完成文本编辑（⌘A/C/X/V/Z），其余命令照常交给桌面。 */
    if (this.typing() && isTextEditingShortcut(event)) return;
    /* 应用自己已经在编辑区处理过这个键（例如 TextEdit 的 ⌘S）：不重复执行，也不抢着 preventDefault。 */
    if (event.defaultPrevented) return;
    /* ⇧⌘Q 登出：全部窗口关闭后回到锁屏。desktop-menus 的 Log Out 项仍指向 lock()（该文件不在本代理清单，见 notes）。 */
    if (event.shiftKey && !event.altKey && hasPrimaryModifier(event) && key === 'q') {
      event.preventDefault();
      if (!event.repeat) this.session.logOut();
      return;
    }
    /* 先看菜单栏上真实展示的命令：应用菜单、Apple 菜单与应用自己的菜单都能按键触发。 */
    if (this.runMenuShortcut(event)) {
      event.preventDefault();
      return;
    }
    /* ⌘K 是桌面的聚焦搜索；终端菜单声明了 ⌘K（清屏）时已在上面被菜单认领。 */
    if (key === 'k') {
      event.preventDefault();
      this.overlays.toggleSpotlight();
      return;
    }
    /* 窗口动作是菜单没认领时的兜底；仍要拦下 Chrome 自己的查找/刷新/标签等快捷键。 */
    if (this.windowShortcut(event) || isBrowserShortcut(event)) event.preventDefault();
  }

  /**
   * Tab 抬起（或窗口失去焦点）：不再算「正按着 Tab」。必须是返回 void 的方法——Angular 的事件绑定在表达式
   * 求值为 `false` 时会 `preventDefault()`，写成赋值表达式 `wm.tabbing = false` 会连带吃掉空格键 keyup 触发的按钮点击。
   */
  protected releaseTab(): void {
    this.wm.tabbing = false;
  }

  protected nativeMenu(event: MouseEvent): void {
    if ((event.target as Element).closest(NATIVE_MENU)) return;
    if (!event.defaultPrevented) event.preventDefault();
  }

  protected resetCursor(): void {
    document.body.style.cursor = '';
  }

  /** Esc 依次关闭弹出菜单、聚焦搜索、启动台、Mission Control、通知中心。 */
  private dismissOverlay(): boolean {
    if (this.popover.isOpen()) this.popover.close(false, 'escape');
    else if (this.overlays.spotlight() !== 'closed') this.overlays.closeSpotlight();
    else if (this.overlays.launchpad() !== 'closed') this.overlays.closeLaunchpad();
    else if (this.overlays.mission() !== 'closed') this.overlays.closeMission();
    else if (this.overlays.notifications() === 'open') this.overlays.closeNotifications();
    else return false;
    return true;
  }

  private windowShortcut(event: KeyboardEvent): boolean {
    if (!hasPrimaryModifier(event) || event.altKey || event.shiftKey) return false;
    const key = event.key.toLowerCase();
    const actions: Readonly<Record<string, () => void>> = {
      w: () => this.wm.closeFront(),
      m: () => this.wm.minimizeFront(),
      q: () => this.wm.quitFront(),
      '`': () => this.wm.cycle()
    };
    const action = actions[key];
    if (action) {
      if (!event.repeat) action();
      return true;
    }
    const front = this.wm.front();
    if (this.undoTrashShortcut(event, front?.appId)) return true;
    if (key === 'n') {
      /* 没有前台窗口时 Finder 就是前台应用，与菜单栏显示保持一致。 */
      if (front) this.wm.open(front.appId, { force: true });
      else this.wm.open('finder', { path: HOME_PATH });
      return true;
    }
    return false;
  }

  private undoTrashShortcut(event: KeyboardEvent, frontApp: string | undefined): boolean {
    if (event.key.toLowerCase() !== 'z' || event.shiftKey || event.altKey || event.metaKey === event.ctrlKey)
      return false;
    const onDesktop = event.target instanceof Element && event.target.closest('#desktop');
    if (!onDesktop && frontApp && frontApp !== 'finder') return false;
    if (event.defaultPrevented || this.session.locked() || this.session.boot() || this.session.sleep() !== 'awake')
      return true;
    if (
      this.popover.isOpen() ||
      this.overlays.spotlight() !== 'closed' ||
      this.overlays.launchpad() !== 'closed' ||
      this.overlays.mission() !== 'closed'
    )
      return true;
    if (!this.fs.canUndo()) return true;
    event.preventDefault();
    if (!event.repeat) void this.fs.undo().catch((error: unknown) => this.toast.show(describeDiskError(error)));
    return true;
  }

  /**
   * 菜单栏上此刻能点到的命令：前台窗口注册的菜单 + 菜单栏合成的应用菜单与 Apple 菜单。
   * 命中即视为已处理（包括禁用与没有 `run` 的占位项）：不能让同一个组合落到浏览器上，
   * 例如 Calendar 的 ⌘1-4 与 Music 的 ⌘R。
   */
  private runMenuShortcut(event: KeyboardEvent): boolean {
    const front = this.wm.front();
    const sections = [...(front?.menus()?.() ?? []), ...this.menuBarMenus.sections()];
    const command = sections
      .flatMap(section => section.items)
      .find(item => isMenuCommand(item) && matchesShortcut(item, event));
    if (!command || !isMenuCommand(command)) return false;
    if (!event.repeat && !command.disabled) command.run?.();
    return true;
  }

  /** Space 这类无修饰键的快捷键不能从按钮、输入框或列表项手里抢走。 */
  private interactiveTarget(event: KeyboardEvent): boolean {
    const target = event.target as Element | null;
    return Boolean(
      target?.closest(
        'button, a, input, textarea, select, [contenteditable="true"], [role="button"], [role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="tab"], [role="switch"], [role="slider"]'
      )
    );
  }

  /**
   * 桌面启动流程的后段（ADESK-US-104）：偏好库与磁盘就绪后恢复刷新前的窗口；
   * 没有任何可恢复的窗口（新标签页、用户关光了窗口、保存的窗口都恢复不了）才打开默认的 Finder，有就不再多开一个。
   */
  private async startWindows(): Promise<void> {
    if ((await this.layout.restore()) === 0) this.wm.open('finder', { path: HOME_PATH });
    this.wm.started = true;
  }

  private typing(): boolean {
    const active = document.activeElement as HTMLElement | null;
    return !!active && (/input|textarea/i.test(active.tagName) || active.isContentEditable);
  }

  private driftBattery(): void {
    if (this.system.charging()) this.system.battery.update(level => Math.min(100, level + 1));
    else if (Math.random() < 0.35) this.system.battery.update(level => Math.max(3, level - 1));
  }
}
