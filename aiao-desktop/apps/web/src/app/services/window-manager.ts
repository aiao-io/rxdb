import { DOCUMENT } from '@angular/common';
import { Service, computed, inject, signal } from '@angular/core';

import { clamp } from '../shared/format';
import { ApplicationRuntime } from './application-runtime';
import { DESKTOP_APPS, DesktopAppId, DesktopOpenOptions } from './desktop-apps';
import { DEFAULT_MIN_HEIGHT, DEFAULT_MIN_WIDTH, DesktopWindow, WindowBox } from './desktop-window';
import { DockState } from './dock-state';
import { Toast } from './toast';
import { fitBox } from './window-layout-model';

/** 按布局里的一条记录重建一个窗口所需的信息（ADESK-US-104），见 {@link WindowManager.restore}。 */
export interface WindowRestoreSpec {
  readonly appId: DesktopAppId;
  /** 开窗参数；磁盘节点等不可序列化的内容已由调用方按保存的路径取回。 */
  readonly options: DesktopOpenOptions;
  /** 保存时（缩放前）的几何；窗口管理器按当前视口把它拉回屏幕内。 */
  readonly box: WindowBox;
  readonly minimized: boolean;
  readonly zoomed: boolean;
  /** 层叠层级，必须落在 {@link WindowManager.reserveLayers} 预留的区间内。 */
  readonly layer: number;
  /** 恢复后成为前台窗口（拿到焦点与菜单栏）。 */
  readonly foreground: boolean;
}

/**
 * 把恢复出来的窗口插到列表里第一个层级比它高的窗口之前：恢复是前台窗口先建，
 * 但列表仍按层叠排，`byApp(…).at(-1)`（启动台、Dock 取“最后一个”）才是最靠前的那个。
 */
function insertByLayer(list: readonly DesktopWindow[], win: DesktopWindow): DesktopWindow[] {
  const at = list.findIndex(other => other.zIndex() > win.zIndex());
  return at < 0 ? [...list, win] : [...list.slice(0, at), win, ...list.slice(at)];
}

/** 窗口列表、层叠顺序与焦点。几何和动画由各自的窗口框架组件负责。 */
@Service({ autoProvided: false })
export class WindowManager {
  private readonly apps = inject(DESKTOP_APPS);
  private readonly dock = inject(DockState);
  private readonly toast = inject(Toast);
  private readonly runtime = inject(ApplicationRuntime);
  private readonly root = inject(DOCUMENT).documentElement;

  private readonly windowsState = signal<readonly DesktopWindow[]>([]);
  private readonly focusedState = signal<DesktopWindow | null>(null);
  private z = 10;
  private seq = 0;
  private cascade = 0;

  readonly windows = this.windowsState.asReadonly();
  readonly focused = this.focusedState.asReadonly();

  /**
   * 正按着 Tab（桌面页在 keydown 到 keyup 之间置位）。窗口据此区分「用 Tab 走进了后台窗口」（该窗口随之成为前台）
   * 与「脚本给后台窗口里的元素设了焦点」（应用自己初始化，不该打乱前台）。
   */
  tabbing = false;

  /**
   * 桌面启动完成（窗口恢复结束、默认的 Finder 已打开）。在它之前建出的窗口标记为 `quiet`，不抢键盘焦点，
   * 页面刚打开时第一次 Tab 因此从菜单栏开始；由桌面页在启动流程结束时置位。
   */
  started = false;

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
    if (!app.load) {
      this.toast.show(`Unknown app: ${appId}`);
      return null;
    }
    const existing = options.force || app.single === false ? undefined : this.byApp(appId).at(-1);
    if (existing) {
      if (existing.minimized()) this.unminimize(existing.id);
      else this.focus(existing.id);
      /* 再次打开是明确的使用意图：刷新后延后装载的窗口（终端、游戏）此刻装载。 */
      this.runtime.activate(existing);
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
    win.quiet = !this.started;

    this.windowsState.update(list => [...list, win]);
    this.runtime.start(win);
    this.focus(win.id);
    setTimeout(() => {
      win.opening.set(false);
      this.dock.stopBounce(appId);
    }, 320);
    return win;
  }

  /**
   * 预留 `count` 个层叠位置给要恢复的窗口：返回区间起点，窗口按记录的顺序叠在 起点+1 … 起点+count，
   * 之后用户新开的窗口都在它们之上。恢复是分批的，预留让先恢复谁都不影响最终的叠放。
   */
  reserveLayers(count: number): number {
    const base = this.z;
    this.z += count;
    return base;
  }

  /**
   * 按布局里的一条记录重建窗口（ADESK-US-104，刷新后恢复）：不弹跳 Dock 图标、没有开窗动画，不走“单实例应用已打开就复用”，
   * 层叠与几何取记录的（几何按当前视口拉回屏幕内）。最小化的窗口与清单声明 `restore: 'deferred'` 的应用只重建外框、
   * 不请求应用载荷，等 {@link activate}（最小化的窗口第一次还原时自动触发）；其余窗口立即开始装载。
   * 没有组件的系统入口、不认识的应用恢复不了，返回 `null`。
   */
  restore(spec: WindowRestoreSpec): DesktopWindow | null {
    const app = this.apps[spec.appId];
    if (!app?.load) return null;
    const min = { width: app.minW ?? DEFAULT_MIN_WIDTH, height: app.minH ?? DEFAULT_MIN_HEIGHT };
    const box = fitBox(spec.box, { width: innerWidth, height: innerHeight }, this.menubarHeight(), min);
    const win = new DesktopWindow(`w${++this.seq}`, app, spec.options, box);
    win.quiet = !this.started;
    win.opening.set(false);
    win.zIndex.set(spec.layer);
    win.zoomed.set(spec.zoomed);
    win.minimized.set(spec.minimized);
    win.hidden.set(spec.minimized);
    this.windowsState.update(list => insertByLayer(list, win));
    if (spec.minimized || (app.kind !== 'system' && app.restore === 'deferred')) this.runtime.defer(win);
    else this.runtime.start(win);
    if (spec.foreground) this.focusedState.set(win);
    return win;
  }

  /** 装载一个延后的窗口（用户第一次点击未启动的窗口）；窗口不存在或已经装载过时什么也不做。 */
  activate(id: string): void {
    const win = this.get(id);
    if (win) this.runtime.activate(win);
  }

  /**
   * 把窗口调到前台。键盘焦点默认跟着进去（⌘`、再次打开、从 Dock 菜单选窗口）；
   * 鼠标按下已经决定了焦点落在哪个元素，调用方传 `dom: false` 只改前台状态与层叠。
   */
  focus(id: string, { dom = true }: { readonly dom?: boolean } = {}): void {
    const win = this.get(id);
    if (!win || win.closing()) return;
    this.raise(win);
    this.focusedState.set(win);
    if (dom) win.frame?.focusContent();
  }

  /** 只抬高层级而不改焦点：还原动画期间避免重绘其他窗口的阴影。 */
  raise(win: DesktopWindow): void {
    win.zIndex.set(++this.z);
  }

  focusFront(): void {
    const front = this.front();
    if (front) this.focus(front.id);
  }

  /**
   * 窗口离开前台之后（关闭完成、最小化动画结束）：前台交给下一个窗口。`hadFocus` 为真（键盘焦点原本在这个窗口里）时
   * 焦点跟着去，没有别的窗口就落在它的 Dock 图标上；焦点原本在别处就只改前台状态，不抢用户当前的位置。
   */
  handOffFocus(win: DesktopWindow, hadFocus: boolean): void {
    const front = this.front();
    if (front) this.focus(front.id, { dom: hadFocus });
    else if (hadFocus) this.dock.focusApp(win.appId);
  }

  close(id: string): void {
    const win = this.get(id);
    if (!win || win.closing()) return;
    /* 关窗口的瞬间记下焦点在不在里面：窗口移除之后焦点就丢了。 */
    const hadFocus = win.frame?.holdsFocus() ?? false;
    win.closing.set(true);
    this.runtime.closing(win);
    win.beforeClose.next();
    win.beforeClose.complete();
    setTimeout(() => {
      this.windowsState.update(list => list.filter(item => item !== win));
      this.runtime.closed(win);
      this.handOffFocus(win, hadFocus);
    }, 200);
  }

  /** 装载失败的窗口重试：创建新的应用实例（见 {@link ApplicationRuntime}）。 */
  retry(id: string): void {
    const win = this.get(id);
    if (win) this.runtime.retry(win);
  }

  closeAll(): void {
    this.windowsState().forEach(win => this.close(win.id));
  }

  minimize(id: string): void {
    this.get(id)?.frame?.minimize();
  }

  /** 从 Dock 还原；刷新后恢复成最小化的窗口，第一次还原时才装载内容。 */
  unminimize(id: string): void {
    const win = this.get(id);
    if (!win?.frame) return;
    const wasMinimized = win.minimized();
    win.frame.restore();
    if (wasMinimized && !win.minimized()) this.runtime.activate(win);
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
