import { DOCUMENT } from '@angular/common';
import { Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { ApplicationRegistry } from './application-registry';

import { clamp } from '../shared/format';
import { ApplicationRuntime } from './application-runtime';
import { DesktopAppId, DesktopOpenOptions } from './desktop-apps';
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
  private readonly apps = inject(ApplicationRegistry).apps;
  private readonly dock = inject(DockState);
  private readonly toast = inject(Toast);
  private readonly runtime = inject(ApplicationRuntime);
  private readonly root = inject(DOCUMENT).documentElement;

  private readonly windowsState = signal<readonly DesktopWindow[]>([]);
  private readonly focusedState = signal<DesktopWindow | null>(null);
  private z = 10;
  private seq = 0;
  private cascade = 0;
  private closeRequest: { readonly windows: readonly DesktopWindow[]; readonly result: Promise<boolean> } | null = null;

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

  /**
   * 被「隐藏」的应用：Hide 是隐藏整个应用（窗口全部收起）而不是最小化一个窗口；这些应用仍在运行，
   * 点击 Dock 图标或 Show All 时整组恢复。手动最小化的窗口不在恢复范围内。
   */
  private readonly hiddenAppsState = signal<ReadonlySet<DesktopAppId>>(new Set());
  /** Hide / Hide Others 亲自收起的窗口 id；只还原这些，不碰用户自己最小化的窗口。 */
  private readonly hiddenWindows = new Map<DesktopAppId, Set<string>>();
  readonly hiddenApps = this.hiddenAppsState.asReadonly();

  constructor() {
    effect(() => {
      const apps = this.apps();
      untracked(() => {
        for (const win of this.windowsState())
          if (
            win.app.kind === 'web' &&
            win.app.installScope === 'approved-catalog' &&
            JSON.stringify(apps[win.appId]) !== JSON.stringify(win.app)
          )
            this.closeApproved(win);
      });
    });
  }

  closeApp(appId: DesktopAppId): boolean | Promise<boolean> {
    return this.closeWindows(this.byApp(appId));
  }

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
    const app = this.apps()[appId];
    if (!app?.load) {
      this.toast.show(`Unknown app: ${appId}`);
      return null;
    }
    /* 隐藏的应用被再次打开时先整组恢复，再按单实例 / 多实例规则处理。 */
    this.unhideApp(appId);
    const candidates = this.byApp(appId);
    const existing =
      options.force ? undefined
      : options.projectId ?
        candidates.find(win => (win.restoreOptions()?.projectId ?? win.options.projectId) === options.projectId)
      : app.single === false ? undefined
      : candidates.at(-1);
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
   * 层叠与几何取记录的（几何按当前视口拉回屏幕内）。最小化的窗口、`deferred` 窗口和不在前台的 `foreground` 窗口
   * 只重建外框，等 {@link activate}（最小化的窗口第一次还原时自动触发）；其余窗口立即装载。
   * 没有组件的系统入口、不认识的应用恢复不了，返回 `null`。
   */
  restore(spec: WindowRestoreSpec): DesktopWindow | null {
    const app = this.apps()[spec.appId];
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
    const restore = app.kind === 'system' ? undefined : app.restore;
    if (spec.minimized || restore === 'deferred' || (restore === 'foreground' && !spec.foreground))
      this.runtime.defer(win);
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
   * 窗口开始关闭或最小化时，立即把前台与焦点交给下一个窗口，避免隐藏仍有焦点的内容。`hadFocus` 为真（键盘焦点原本在这个窗口里）时
   * 焦点跟着去，没有别的窗口就落在它的 Dock 图标上；焦点原本在别处就只改前台状态，不抢用户当前的位置。
   */
  handOffFocus(win: DesktopWindow, hadFocus: boolean): void {
    const front = this.front();
    if (front) this.focus(front.id, { dom: hadFocus });
    else if (hadFocus) this.dock.focusApp(win.appId);
  }

  close(id: string): void {
    const win = this.get(id);
    if (win) void this.closeWindows([win]);
  }

  /** 装载失败的窗口重试：创建新的应用实例（见 {@link ApplicationRuntime}）。 */
  retry(id: string): void {
    const win = this.get(id);
    if (win) this.runtime.retry(win);
  }

  closeAll(): boolean | Promise<boolean> {
    return this.closeWindows(this.windowsState());
  }

  /** 数据恢复与抹掉保留操作窗口，其余窗口仍逐个协商未保存内容。 */
  closeOthers(id: string): boolean | Promise<boolean> {
    return this.closeWindows(this.windowsState().filter(win => win.id !== id));
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
    this.forgetHiddenWindow(id);
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

  /** 隐藏前台应用的全部窗口（macOS 的 Hide）：应用仍在运行，Dock 图标保留运行态。 */
  hideFront(): void {
    const front = this.front();
    if (front) this.hideApp(front.appId);
  }

  /** 隐藏一个应用的全部窗口；已经最小化的窗口保持原样，也不计入「隐藏时收起的窗口」。 */
  hideApp(appId: DesktopAppId): void {
    this.hiddenAppsState.update(hidden => (hidden.has(appId) ? hidden : new Set(hidden).add(appId)));
    const ids = this.hiddenWindows.get(appId) ?? new Set<string>();
    this.windowsState()
      .filter(win => win.appId === appId && !win.minimized() && !win.closing())
      .forEach(win => {
        ids.add(win.id);
        this.minimize(win.id);
      });
    this.hiddenWindows.set(appId, ids);
  }

  /** 显示被隐藏的应用：只还原 Hide / Hide Others 收起的窗口；不在隐藏集合里时什么也不做。 */
  unhideApp(appId: DesktopAppId): void {
    if (!this.hiddenAppsState().has(appId)) return;
    this.hiddenAppsState.update(hidden => {
      const next = new Set(hidden);
      next.delete(appId);
      return next;
    });
    const ids = this.hiddenWindows.get(appId);
    this.hiddenWindows.delete(appId);
    for (const id of ids ?? []) {
      const win = this.get(id);
      if (win?.minimized()) this.unminimize(id);
    }
  }

  hideOthers(): void {
    const keep = this.front()?.appId;
    const others = new Set(
      this.windowsState().filter(win => win.appId !== keep && !win.closing()).map(win => win.appId)
    );
    others.forEach(appId => this.hideApp(appId));
  }

  /** 显示全部被隐藏的应用；用户自己最小化的窗口不在其中，保持最小化。 */
  showAll(): void {
    for (const appId of this.hiddenAppsState()) this.unhideApp(appId);
  }

  quitApp(appId: DesktopAppId): void {
    void this.closeWindows(this.byApp(appId));
  }

  /** ⌘`：把最底层的可见窗口提到最前。 */
  cycle(): void {
    const visible = this.windowsState()
      .filter(win => !win.minimized() && !win.closing())
      .sort((a, b) => a.zIndex() - b.zIndex());
    if (visible.length > 1) this.focus(visible[0].id);
  }

  /** 窗口关了或已经被单独还原：不再算作「隐藏时收起的窗口」。 */
  private forgetHiddenWindow(id: string): void {
    for (const [appId, ids] of this.hiddenWindows) {
      if (!ids.delete(id)) continue;
      if (!ids.size) this.hiddenWindows.delete(appId);
    }
  }

  private closeApproved(win: DesktopWindow): void {
    if (win.closing() || this.get(win.id) !== win) return;
    /* 关窗口的瞬间记下焦点在不在里面：窗口移除之后焦点就丢了。 */
    const hadFocus = win.frame?.holdsFocus() ?? false;
    win.closing.set(true);
    this.handOffFocus(win, hadFocus);
    this.runtime.closing(win);
    win.beforeClose.next();
    win.beforeClose.complete();
    setTimeout(() => {
      this.windowsState.update(list => list.filter(item => item !== win));
      this.runtime.closed(win);
      this.forgetHiddenWindow(win.id);
      if (!this.windowsState().some(item => item.appId === win.appId)) {
        this.hiddenWindows.delete(win.appId);
        this.hiddenAppsState.update(hidden => {
          if (!hidden.has(win.appId)) return hidden;
          const next = new Set(hidden);
          next.delete(win.appId);
          return next;
        });
      }
    }, 200);
  }

  private closeWindows(windows: readonly DesktopWindow[]): boolean | Promise<boolean> {
    const pending = this.closeRequest;
    if (pending && windows.every(win => pending.windows.includes(win))) return pending.result;
    if (pending) return pending.result.then(() => this.closeWindows(windows));
    const selected = windows.filter(win => this.get(win.id) === win && !win.closing());
    if (!selected.some(win => win.confirmClose)) {
      selected.forEach(win => this.closeApproved(win));
      return true;
    }
    selected.forEach(win => win.closePending.set(true));
    const result = this.approveAndClose(selected).finally(() => {
      selected.forEach(win => win.closePending.set(false));
      this.closeRequest = null;
    });
    this.closeRequest = { windows: selected, result };
    return result;
  }

  private async approveAndClose(windows: readonly DesktopWindow[]): Promise<boolean> {
    try {
      for (const win of windows) {
        if (win.hasUnsavedChanges()) {
          this.unminimize(win.id);
          this.focus(win.id);
        }
        if (win.confirmClose && !(await win.confirmClose())) return false;
      }
      windows.forEach(win => this.closeApproved(win));
      return true;
    } catch (error) {
      this.toast.show(`Unable to close: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private withFront(action: (win: DesktopWindow) => void): void {
    const front = this.front();
    if (front) action(front);
  }
}
