import { Component, DestroyRef, ViewEncapsulation, afterNextRender, inject } from '@angular/core';

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
import { menuShortcuts } from '../services/aria';
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
import { FileSystem, HOME_PATH } from '../services/file-system';
import { FinderPreferences } from '../services/finder-preferences';
import { ImageThumbnailCache } from '../services/image-thumbnail-cache';
import { InstalledApplications } from '../services/installed-applications';
import { isMenuCommand } from '../services/menu';
import { Overlays } from '../services/overlays';
import { PopoverService } from '../services/popover';
import { RuntimeActivity } from '../services/runtime-activity';
import { Session } from '../services/session';
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
  private readonly desktopItems = inject(DesktopItems);
  private readonly session = inject(Session);

  protected readonly wm = inject(WindowManager);
  protected readonly layout = inject(WindowLayoutStore);

  constructor() {
    this.theme.setAppearance(this.system.appearance());
    this.wallpaper.set(this.system.wallpaper());
    /* 设置存在本地库里：库就绪后恢复上次的外观、壁纸、Dock 等，之后的改动自动写回。 */
    inject(SystemSettingsStore);
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
    const meta = event.metaKey || event.ctrlKey;
    if (event.key === 'Escape' && this.dismissOverlay()) return;
    if (meta && (event.key === 'k' || event.key === 'K' || event.code === 'Space')) {
      event.preventDefault();
      this.overlays.toggleSpotlight();
      return;
    }
    if (event.key === 'F4') {
      event.preventDefault();
      this.overlays.toggleLaunchpad();
      return;
    }
    if (!meta || this.typing()) return;
    this.windowShortcut(event);
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

  /** Esc 依次关闭弹出菜单、聚焦搜索、启动台、通知中心。 */
  private dismissOverlay(): boolean {
    if (this.popover.isOpen()) this.popover.close(false, 'escape');
    else if (this.overlays.spotlight() !== 'closed') this.overlays.closeSpotlight();
    else if (this.overlays.launchpad() !== 'closed') this.overlays.closeLaunchpad();
    else if (this.overlays.notifications() === 'open') this.overlays.closeNotifications();
    else return false;
    return true;
  }

  private windowShortcut(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    const actions: Readonly<Record<string, () => void>> = {
      w: () => this.wm.closeFront(),
      m: () => this.wm.minimizeFront(),
      q: () => this.wm.quitFront(),
      '`': () => this.wm.cycle()
    };
    const action = actions[key];
    if (action) {
      event.preventDefault();
      action();
      return;
    }
    const front = this.wm.front();
    if (this.undoTrashShortcut(event, front?.appId)) return;
    if (front && this.runMenuShortcut(event, front)) return;
    if (key === 'n' && front) {
      event.preventDefault();
      this.wm.open(front.appId, { force: true });
    }
  }

  private undoTrashShortcut(event: KeyboardEvent, frontApp: string | undefined): boolean {
    if (event.key.toLowerCase() !== 'z' || event.shiftKey || event.altKey || event.metaKey === event.ctrlKey)
      return false;
    const onDesktop = event.target instanceof Element && event.target.closest('#desktop');
    if (!onDesktop && frontApp && frontApp !== 'finder') return false;
    if (event.defaultPrevented || this.session.locked() || this.session.boot() || this.session.sleep() !== 'awake')
      return true;
    if (this.popover.isOpen() || this.overlays.spotlight() !== 'closed' || this.overlays.launchpad() !== 'closed')
      return true;
    if (!this.desktopItems.canUndoTrash()) return true;
    event.preventDefault();
    if (!event.repeat) this.desktopItems.undoTrash();
    return true;
  }

  private runMenuShortcut(event: KeyboardEvent, front: ReturnType<WindowManager['front']>): boolean {
    if (!front) return false;
    // Shift 会把句点的 event.key 变成 >，但菜单快捷键仍写成句点。
    const shiftedPeriod = event.shiftKey && event.code === 'Period';
    const key =
      shiftedPeriod ? '.'
      : event.key === ' ' ? 'Space'
      : event.key.length === 1 ? event.key.toUpperCase()
      : event.key;
    const shortcut = [
      event.ctrlKey ? 'Control' : null,
      event.altKey ? 'Alt' : null,
      event.shiftKey ? 'Shift' : null,
      event.metaKey ? 'Meta' : null,
      key
    ]
      .filter((part): part is string => part !== null)
      .join('+');
    const command = front
      .menus()?.()
      .flatMap(section => section.items)
      .find(item => isMenuCommand(item) && !item.disabled && item.run && menuShortcuts(item).includes(shortcut));
    if (!command || !isMenuCommand(command) || !command.run) return false;
    event.preventDefault();
    if (!shiftedPeriod || !event.repeat) command.run();
    return true;
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
