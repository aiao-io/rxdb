import type { OrbitBinding, OrbitInstance, OrbitRuntime } from '@aiao/orbit';
import { OrbitError, createOrbitBinding } from '@aiao/orbit';
import type { DesktopCapability, DesktopWindowState } from '@aiao/orbit/desktop';
import { desktopProps, serveDesktop } from '@aiao/orbit/desktop';
import type { OrbitDragRegion, OrbitWindowHost, OrbitWindowState } from '@aiao/orbit/window';
import { serveWindow, windowProps } from '@aiao/orbit/window';
import { Signal, computed, signal } from '@angular/core';
import type { Subscription } from 'rxjs';

import { failureReason } from '../apps/web-app/web-app-failure';
import type { AppContextChrome, BindOptions, DesktopAppContext, DesktopNotice } from './app-context';
import type { ApplicationRuntime } from './application-runtime';
import type { AppCapabilityRestriction } from './browser-app-support';
import { WebAppManifest, orbitAllow } from './desktop-apps';
import type { DesktopWindow } from './desktop-window';

/** 窗口里的提示条停留多久（毫秒）。 */
const NOTICE_MS = 4_500;

/** 创建一个窗口的远程应用会话所需的全部输入。 */
export interface RemoteAppSessionOptions {
  /** 会话所在的窗口。 */
  readonly win: DesktopWindow;
  /** 这个窗口里运行的集成应用的清单。 */
  readonly app: WebAppManifest;
  /** 桌面页的 Orbit 运行内核。 */
  readonly orbit: OrbitRuntime;
  /** 应用运行时：实例的生命周期状态由它推进。 */
  readonly runtime: Pick<ApplicationRuntime, 'beginInstance' | 'renew' | 'instanceReady' | 'instanceFailed'>;
  /** 应用上下文工厂。 */
  readonly contexts: { bind(win: DesktopWindow, options?: BindOptions): DesktopAppContext };
}

/** 窗口协议（旧版逐方法）的状态是桌面能力状态去掉「是否最小化」。 */
function legacyState(state: DesktopWindowState): OrbitWindowState {
  return {
    platform: state.platform,
    frame: state.frame,
    decorations: state.decorations,
    focused: state.focused,
    maximized: state.maximized
  };
}

/**
 * 一个窗口里 remote-web 应用的运行会话（ADESK-US-206 阶段 C，D-11、D-18）：每次尝试创建一个**新的** Orbit 实例
 * （实例 ID 取窗口此刻的实例 ID，重试经应用运行时换新）与一个新的能力上下文，不复用旧 iframe；
 * 把实例的就绪与失败汇报给应用运行时，旧实例迟到的结果按实例 ID 丢弃，不会让已关闭的窗口重新出现，
 * 也不会让新实例误判就绪。能力经 `serveDesktop`（统一信封）与旧版 `serveWindow`（已发布的应用在用）两条路径落在同一个上下文上，
 * 清单没声明的能力两条路径都不放行。
 */
export class RemoteAppSession {
  private readonly host: string;
  private readonly closing: Subscription;
  private readonly chromeHooks: AppContextChrome;
  private readonly servers: { dispose(): void }[] = [];
  private binding: OrbitBinding | undefined;
  private current: DesktopAppContext | undefined;
  private container: HTMLElement | undefined;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  /** 应用要求的桌面标题栏显示状态；只有透明窗口能关掉。 */
  readonly decorations = signal(true);
  /** 应用上报的拖动区，窗口在 iframe 上方盖同形状的拖动层。 */
  readonly dragRegions = signal<readonly OrbitDragRegion[]>([]);
  /** 窗口里的提示条：未声明能力、参数非法、超时。 */
  readonly notice = signal<DesktopNotice | null>(null);
  /** 入口处持续显示的浏览器限制；应用重试仍按当前上下文重新取得。 */
  readonly restrictions = signal<readonly AppCapabilityRestriction[]>([]);
  /** 桌面画标题栏：应用没隐藏它，或实例还没就绪（加载中与失败时始终画，能拖、能关）。 */
  readonly chrome: Signal<boolean>;

  /** 当前的 Orbit 实例；失败或销毁后为空。 */
  get instance(): OrbitInstance | undefined {
    return this.binding?.instance;
  }

  /** 当前实例的能力上下文；失败或销毁后为空。 */
  get context(): DesktopAppContext | undefined {
    return this.current;
  }

  constructor(private readonly options: RemoteAppSessionOptions) {
    const { win, app, runtime } = options;
    this.host = new URL(app.web.url).host;
    this.chrome = computed(() => this.decorations() || win.state() !== 'ready');
    this.chromeHooks = {
      decorations: () => this.chrome(),
      setDecorations: decorations => this.decorations.set(decorations),
      setDragRegions: regions => this.dragRegions.set(regions)
    };
    /* 关闭开始时（动画之前）能力上下文就解绑：菜单、命令与订阅立刻撤销，迟到的调用都是 WINDOW_CLOSED。 */
    this.closing = win.beforeClose.subscribe(() => this.current?.dispose());
    runtime.beginInstance(win);
  }

  /** 把应用装载到容器里：创建 Orbit 实例，等应用报告就绪。 */
  async start(container: HTMLElement): Promise<void> {
    this.container = container;
    await this.launch();
  }

  /** 失败后重试：应用运行时给窗口换一个新的实例 ID，然后创建新的 Orbit 实例；窗口在关闭时什么都不做。 */
  async retry(): Promise<void> {
    if (this.disposed || !this.container || !this.options.runtime.renew(this.options.win)) return;
    await this.launch();
  }

  /** 窗口组件销毁（窗口关闭动画结束）：销毁实例、解绑上下文、清掉定时器。幂等。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.closing.unsubscribe();
    this.teardown(false);
    this.hideNotice();
  }

  private async launch(): Promise<void> {
    const { win, app, orbit, contexts } = this.options;
    if (this.disposed || win.state() === 'closing' || win.state() === 'closed') return;
    const instanceId = win.instanceId;
    this.teardown(true);
    const context = contexts.bind(win, {
      chrome: this.chromeHooks,
      notify: notice => this.show(notice),
      refocus: () => this.refocus()
    });
    this.current = context;
    const capabilities = context.capabilities;
    this.restrictions.set(context.restrictions);
    const binding = createOrbitBinding(orbit, {
      appId: app.id,
      instanceId,
      version: app.web.version,
      url: app.web.url,
      title: app.name,
      allow: orbitAllow(app.web),
      timeout: app.web.readyTimeout,
      props: { ...this.windowProps(context, capabilities), ...desktopProps(capabilities) }
    });
    this.binding = binding;
    let mounting: Promise<void>;
    try {
      mounting = binding.mount(this.container!);
      this.serve(binding.instance!, context, capabilities);
    } catch (error) {
      this.fail(instanceId, error);
      return;
    }
    try {
      await mounting;
    } catch (error) {
      this.fail(instanceId, error);
      return;
    }
    if (this.stale(instanceId)) return;
    binding.instance?.subscribe(snapshot => {
      if (snapshot.state === 'failed') this.fail(instanceId, new OrbitError('NAVIGATION', snapshot.url));
    });
    this.options.runtime.instanceReady(win, instanceId);
  }

  /** 这次尝试已经过时：会话已销毁，或窗口换了新的实例。过时的结果一律丢弃。 */
  private stale(instanceId: string): boolean {
    return this.disposed || instanceId !== this.options.win.instanceId;
  }

  private fail(instanceId: string, error: unknown): void {
    if (this.stale(instanceId)) return;
    const { win, app, runtime } = this.options;
    const reason = failureReason(error, { name: app.name, host: this.host, readyTimeout: app.web.readyTimeout });
    this.teardown(true);
    runtime.instanceFailed(win, instanceId, reason);
  }

  /** 实例一创建就登记请求：应用握手后的第一个请求就能被处理。 */
  private serve(instance: OrbitInstance, context: DesktopAppContext, capabilities: readonly DesktopCapability[]): void {
    this.servers.push(
      serveDesktop(instance, context, { capabilities, onError: (error, method) => context.report(error, method) })
    );
    if (!capabilities.includes('window')) return;
    const legacy = serveWindow(instance, this.windowHost(context));
    this.servers.push(legacy);
    context.window.onStateChange(() => legacy.publish());
  }

  private windowProps(context: DesktopAppContext, capabilities: readonly DesktopCapability[]) {
    return capabilities.includes('window') ? windowProps(legacyState(context.windowState())) : {};
  }

  /** 旧版窗口协议（`@aiao/orbit/window`，已发布的应用在用）的宿主：全部转给同一个上下文，权限与解绑都一样。 */
  private windowHost(context: DesktopAppContext): OrbitWindowHost {
    return {
      state: () => legacyState(context.windowState()),
      minimize: () => context.window.minimize(),
      toggleMaximize: () => context.window.toggleMaximize(),
      close: () => context.window.close(),
      setTitle: title => context.window.setTitle(title),
      setDecorations: decorations => context.window.setDecorations(decorations),
      setDragRegions: regions => context.window.setDragRegions(regions)
    };
  }

  /** 撤掉当前实例：请求与订阅解绑、上下文解绑、Orbit 实例销毁；`reset` 时把标题、标题栏与拖动区还原。 */
  private teardown(reset: boolean): void {
    for (const server of this.servers.splice(0)) server.dispose();
    this.current?.dispose();
    this.current = undefined;
    this.restrictions.set([]);
    this.binding?.unmount();
    this.binding = undefined;
    if (!reset) return;
    this.decorations.set(true);
    this.dragRegions.set([]);
    this.options.win.title.set(this.options.app.name);
    this.hideNotice();
  }

  /** 文件面板关闭之后把键盘焦点还给应用的文档；实例不在就绪、可见的状态（已关闭、已失败、已最小化）时不动。 */
  private refocus(): void {
    const instance = this.binding?.instance;
    if (instance?.snapshot.state === 'ready') instance.focus();
  }

  private show(notice: DesktopNotice): void {
    this.notice.set(notice);
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.notice.set(null), NOTICE_MS);
  }

  private hideNotice(): void {
    clearTimeout(this.noticeTimer);
    this.noticeTimer = undefined;
    this.notice.set(null);
  }
}
