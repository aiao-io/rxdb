import { DOCUMENT } from '@angular/common';
import { Service, computed, inject, signal } from '@angular/core';

import { clamp } from '../shared/format';
import { DESKTOP_APPS, DesktopAppId, DesktopOpenOptions } from './desktop-apps';
import { DesktopWindow } from './desktop-window';
import { DockState } from './dock-state';
import { Toast } from './toast';

/** 窗口列表、层叠顺序与焦点。几何和动画由各自的窗口框架组件负责。 */
@Service({ autoProvided: false })
export class WindowManager {
  private readonly apps = inject(DESKTOP_APPS);
  private readonly dock = inject(DockState);
  private readonly toast = inject(Toast);
  private readonly root = inject(DOCUMENT).documentElement;

  private readonly windowsState = signal<readonly DesktopWindow[]>([]);
  private readonly focusedState = signal<DesktopWindow | null>(null);
  private z = 10;
  private seq = 0;
  private cascade = 0;

  readonly windows = this.windowsState.asReadonly();
  readonly focused = this.focusedState.asReadonly();

  /** 菜单栏跟随最后获得焦点、且尚未移除的窗口；没有时回到 Finder。 */
  readonly menubarOwner = computed(() => {
    const focused = this.focusedState();
    return focused && this.windowsState().includes(focused) ? focused : null;
  });

  /** 有缩放到全屏的可见窗口时，菜单栏变为不透明。 */
  readonly opaqueMenubar = computed(() =>
    this.windowsState().some(win => !win.closing() && !win.minimized() && win.zoomed())
  );

  readonly runningApps = computed(() => new Set(this.windowsState().map(win => win.appId)));

  get(id: string): DesktopWindow | undefined {
    return this.windowsState().find(win => win.id === id);
  }

  byApp(appId: DesktopAppId): DesktopWindow[] {
    return this.windowsState().filter(win => win.appId === appId && !win.closing());
  }

  /** 最上层的可见窗口。 */
  front(): DesktopWindow | undefined {
    return this.windowsState()
      .filter(win => !win.minimized() && !win.closing())
      .sort((a, b) => a.zIndex() - b.zIndex())
      .at(-1);
  }

  menubarHeight(): number {
    return parseInt(getComputedStyle(this.root).getPropertyValue('--mb-h'), 10) || 25;
  }

  /** AppKit 的 visibleFrame：缩放停在 Dock 上方，按样式变量计算，不受放大中的 Dock 影响。 */
  visibleHeight(): number {
    const style = getComputedStyle(this.root);
    const px = (name: string): number => parseFloat(style.getPropertyValue(name)) || 0;
    return innerHeight - this.menubarHeight() - (px('--dock-size') + 14 + px('--dock-bottom') + 5);
  }

  open(appId: DesktopAppId, options: DesktopOpenOptions = {}): DesktopWindow | null {
    const app = this.apps[appId];
    if (!app.component) {
      this.toast.show(`Unknown app: ${appId}`);
      return null;
    }
    const existing = options.force || app.single === false ? undefined : this.byApp(appId).at(-1);
    if (existing) {
      if (existing.minimized()) this.unminimize(existing.id);
      else this.focus(existing.id);
      return existing;
    }
    this.dock.bounce(appId);

    const mb = this.menubarHeight();
    const width = Math.min(options.w ?? app.w ?? 860, innerWidth - 60);
    const height = Math.min(options.h ?? app.h ?? 560, innerHeight - mb - 90);
    const step = (this.cascade++ % 7) * 26;
    const left = Math.round(clamp((innerWidth - width) / 2 - 90 + step, 14, innerWidth - width - 14));
    const top = Math.round(clamp(mb + 26 + step, mb + 6, innerHeight - height - 90));
    const win = new DesktopWindow(`w${++this.seq}`, app, options, { left, top, width, height });

    this.windowsState.update(list => [...list, win]);
    this.focus(win.id);
    setTimeout(() => {
      win.opening.set(false);
      this.dock.stopBounce(appId);
    }, 320);
    return win;
  }

  focus(id: string): void {
    const win = this.get(id);
    if (!win || win.closing()) return;
    this.raise(win);
    this.focusedState.set(win);
  }

  /** 只抬高层级而不改焦点：还原动画期间避免重绘其他窗口的阴影。 */
  raise(win: DesktopWindow): void {
    win.zIndex.set(++this.z);
  }

  focusFront(): void {
    const front = this.front();
    if (front) this.focus(front.id);
  }

  close(id: string): void {
    const win = this.get(id);
    if (!win || win.closing()) return;
    win.closing.set(true);
    win.beforeClose.next();
    win.beforeClose.complete();
    setTimeout(() => {
      this.windowsState.update(list => list.filter(item => item !== win));
      this.focusFront();
    }, 200);
  }

  closeAll(): void {
    this.windowsState().forEach(win => this.close(win.id));
  }

  minimize(id: string): void {
    this.get(id)?.frame?.minimize();
  }

  unminimize(id: string): void {
    this.get(id)?.frame?.restore();
  }

  zoom(id: string): void {
    this.get(id)?.frame?.toggleZoom();
  }

  /** 视口变小时把窗口拉回屏幕内。 */
  keepOnScreen(): void {
    this.windowsState().forEach(win => win.frame?.keepOnScreen());
  }

  closeFront(): void {
    this.withFront(win => this.close(win.id));
  }

  minimizeFront(): void {
    this.withFront(win => this.minimize(win.id));
  }

  zoomFront(): void {
    this.withFront(win => this.zoom(win.id));
  }

  quitFront(): void {
    this.withFront(win => this.quitApp(win.appId));
  }

  hideOthers(): void {
    const front = this.front();
    this.windowsState()
      .filter(win => win !== front && !win.minimized() && !win.closing())
      .forEach(win => this.minimize(win.id));
  }

  showAll(): void {
    this.windowsState()
      .filter(win => win.minimized())
      .forEach(win => this.unminimize(win.id));
  }

  quitApp(appId: DesktopAppId): void {
    this.byApp(appId).forEach(win => this.close(win.id));
  }

  /** ⌘`：把最底层的可见窗口提到最前。 */
  cycle(): void {
    const visible = this.windowsState()
      .filter(win => !win.minimized() && !win.closing())
      .sort((a, b) => a.zIndex() - b.zIndex());
    if (visible.length > 1) this.focus(visible[0].id);
  }

  private withFront(action: (win: DesktopWindow) => void): void {
    const front = this.front();
    if (front) action(front);
  }
}
