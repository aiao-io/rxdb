import { Component, DestroyRef, ViewEncapsulation, afterNextRender, inject } from '@angular/core';

import { MailComposer } from '../apps/mail/mail-composer';
import { NowPlaying } from '../apps/music/now-playing';
import { PhotoLibrary } from '../apps/photos/photo-library';
import { PhotoLoadQueue } from '../apps/photos/photo-loader';
import { DESKTOP_APP_REGISTRY } from '../apps/registry';
import { SafariBrowsers } from '../apps/safari/safari-browsers';
import { DesktopShell } from '../components/desktop-shell';
import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { AppLauncher } from '../services/app-launcher';
import { CalendarStore } from '../services/calendar-store';
import { Clock } from '../services/clock';
import { DESKTOP_APPS } from '../services/desktop-apps';
import { DesktopItems } from '../services/desktop-items';
import { DesktopMenus } from '../services/desktop-menus';
import { DockState } from '../services/dock-state';
import { FileOpener } from '../services/file-opener';
import { FileSystem, HOME_PATH } from '../services/file-system';
import { Overlays } from '../services/overlays';
import { PopoverService } from '../services/popover';
import { Session } from '../services/session';
import { SystemSettingsStore } from '../services/system-settings';
import { SystemState } from '../services/system-state';
import { ThemeService } from '../services/theme';
import { Toast } from '../services/toast';
import { WallpaperService } from '../services/wallpaper';
import { WeatherStore } from '../services/weather-store';
import { WindowManager } from '../services/window-manager';
import { VirtualMachine } from '../vm/virtual-machine';

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
    { provide: DESKTOP_APPS, useValue: DESKTOP_APP_REGISTRY },
    DesktopData,
    Preferences,
    SystemState,
    SystemSettingsStore,
    ThemeService,
    Toast,
    PopoverService,
    Clock,
    DockState,
    WindowManager,
    Overlays,
    AppLauncher,
    Session,
    WallpaperService,
    FileSystem,
    FileOpener,
    DesktopItems,
    CalendarStore,
    WeatherStore,
    DesktopMenus,
    SafariBrowsers,
    MailComposer,
    NowPlaying,
    PhotoLibrary,
    PhotoLoadQueue,
    VirtualMachine
  ],
  host: {
    '[style.display]': '"block"',
    '[style.width]': '"100%"',
    '[style.height]': '"100%"',
    '(document:keydown)': 'shortcut($event)',
    '(document:contextmenu)': 'nativeMenu($event)',
    '(document:dragstart)': '$event.preventDefault()',
    '(window:pointerup)': 'resetCursor()',
    '(window:resize)': 'wm.keepOnScreen()'
  }
})
export class DesktopPage {
  private readonly system = inject(SystemState);
  private readonly theme = inject(ThemeService);
  private readonly popover = inject(PopoverService);
  private readonly overlays = inject(Overlays);
  private readonly wallpaper = inject(WallpaperService);

  protected readonly wm = inject(WindowManager);
  constructor() {
    this.theme.setAppearance(this.system.appearance());
    this.wallpaper.set(this.system.wallpaper());
    /* 设置存在本地库里：库就绪后恢复上次的外观、壁纸、Dock 等，之后的改动自动写回。 */
    inject(SystemSettingsStore);
    afterNextRender(() => setTimeout(() => this.wm.open('finder', { path: HOME_PATH }), 340));
    /* 电量缓慢下降，桌面永远不会完全静止。 */
    const drift = setInterval(() => this.driftBattery(), 42000);
    inject(DestroyRef).onDestroy(() => clearInterval(drift));
  }

  protected shortcut(event: KeyboardEvent): void {
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

  protected nativeMenu(event: MouseEvent): void {
    if ((event.target as Element).closest(NATIVE_MENU)) return;
    if (!event.defaultPrevented) event.preventDefault();
  }

  protected resetCursor(): void {
    document.body.style.cursor = '';
  }

  /** Esc 依次关闭弹出菜单、聚焦搜索、启动台、通知中心。 */
  private dismissOverlay(): boolean {
    if (this.popover.isOpen()) this.popover.close();
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
    if (key === 'n' && front) {
      event.preventDefault();
      this.wm.open(front.appId, { force: true });
    }
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
