import { OrbitError } from '@aiao/orbit';
import type { OrbitBinding } from '@aiao/orbit/angular';
import { injectOrbit } from '@aiao/orbit/angular';
import type {
  OrbitDragRegion,
  OrbitWindowHost,
  OrbitWindowServer,
  OrbitWindowState
} from '@aiao/orbit/window';
import { serveWindow, windowProps } from '@aiao/orbit/window';
import {
  Component,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';

import { WebAppManifest, orbitAllow } from '../../services/desktop-apps';
import { DesktopWindow } from '../../services/desktop-window';
import { OrbitHost } from '../../services/orbit-host';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { dragClipPath } from './web-app-drag';
import { failureReason } from './web-app-failure';

type WebAppState = 'loading' | 'ready' | 'failed';

function webManifest(win: DesktopWindow): WebAppManifest {
  if (win.app.kind !== 'web') throw new Error(`${win.app.id} 不是集成应用`);
  return win.app;
}

/**
 * 集成应用的窗口内容（D-11）：标题栏加一块 Orbit 容器，每个窗口一个实例。应用报告就绪前显示加载状态，
 * 失败时显示原因与重试；最小化动画结束后通知应用隐藏，还原前通知显示。父页面感知不到焦点在两个跨源
 * iframe 之间移动，所以窗口不在前台时盖一层激活层，点一下只激活窗口，再把键盘焦点交给应用。
 *
 * 窗口接口（D-14，对应 Tauri 的 getCurrentWindow）：应用经 Orbit 请求最小化、缩放、关闭、改标题；
 * 透明窗口的应用可以隐藏桌面的标题栏，自己画标题栏，并上报拖动区，桌面在 iframe 上方盖同形状的拖动层。
 */
@Component({
  selector: 'app-web-app',
  imports: [Icon, TrafficLights],
  templateUrl: './web-app.html',
  styleUrl: './web-app.scss',
  encapsulation: ViewEncapsulation.None,
  host: { style: 'display: contents' }
})
export class WebAppWindow {
  private readonly wm = inject(WindowManager);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  /** 应用要求的桌面标题栏显示状态；只有透明窗口能关掉。 */
  private readonly decorations = signal(true);
  private readonly binding: OrbitBinding;
  private windowServer: OrbitWindowServer | undefined;
  protected readonly win = inject(DesktopWindow);
  protected readonly app = webManifest(this.win);
  protected readonly state = signal<WebAppState>('loading');
  protected readonly reason = signal('');
  protected readonly shielded = computed(() => this.wm.focused() !== this.win);
  /** 桌面画标题栏：标准窗口始终画；透明窗口在应用就绪并隐藏装饰之前也画，加载中与失败时能拖、能关。 */
  protected readonly chrome = computed(() => this.decorations() || this.state() !== 'ready');
  protected readonly dragRegions = signal<readonly OrbitDragRegion[]>([]);

  constructor() {
    this.binding = injectOrbit(inject(OrbitHost).runtime, {
      appId: this.app.id,
      instanceId: this.win.id,
      version: this.app.web.version,
      url: this.app.web.url,
      title: this.app.name,
      allow: orbitAllow(this.app.web),
      timeout: this.app.web.readyTimeout,
      props: windowProps(this.windowState())
    });
    afterNextRender(() => void this.start());
    effect(() => this.syncVisibility(this.win.hidden(), this.state()));
    effect(() => {
      this.windowState();
      untracked(() => this.windowServer?.publish());
    });
  }

  /** 激活层：窗口框架在捕获阶段已把窗口提到前台；等鼠标按下的默认焦点动作做完，再把键盘焦点交给应用。 */
  protected activate(): void {
    setTimeout(() => this.focusApp());
  }

  protected retry(): void {
    this.binding.unmount();
    void this.start();
  }

  protected clipPath(region: OrbitDragRegion): string {
    return dragClipPath(region);
  }

  private async start(): Promise<void> {
    this.state.set('loading');
    this.decorations.set(true);
    this.dragRegions.set([]);
    try {
      const mounting = this.binding.mount(this.stage().nativeElement);
      this.serveWindow();
      await mounting;
    } catch (error) {
      this.showFailure(error);
      return;
    }
    this.binding.instance?.subscribe(snapshot => {
      if (snapshot.state === 'failed') this.showFailure(new OrbitError('NAVIGATION', snapshot.url));
    });
    this.state.set('ready');
    if (this.wm.focused() === this.win) this.focusApp();
  }

  /** 实例一创建就登记窗口请求：应用握手后的第一个请求就能被处理。 */
  private serveWindow(): void {
    this.windowServer?.dispose();
    const instance = this.binding.instance;
    this.windowServer = instance && serveWindow(instance, this.windowHost());
  }

  private windowHost(): OrbitWindowHost {
    return {
      state: () => this.windowState(),
      minimize: () => this.wm.minimize(this.win.id),
      toggleMaximize: () => this.wm.zoom(this.win.id),
      close: () => this.wm.close(this.win.id),
      setTitle: title => this.win.title.set(title),
      setDecorations: decorations => {
        if (!decorations && this.app.web.frame !== 'transparent')
          throw new Error(`${this.app.name} 是标准窗口，不能隐藏桌面的标题栏`);
        this.decorations.set(decorations);
      },
      setDragRegions: regions => this.dragRegions.set(regions)
    };
  }

  private windowState(): OrbitWindowState {
    return {
      platform: 'macos',
      frame: this.app.web.frame ?? 'standard',
      decorations: this.chrome(),
      focused: this.wm.focused() === this.win,
      maximized: this.win.zoomed()
    };
  }

  private showFailure(error: unknown): void {
    const host = new URL(this.app.web.url).host;
    this.reason.set(failureReason(error, { name: this.app.name, host, readyTimeout: this.app.web.readyTimeout }));
    this.state.set('failed');
  }

  private focusApp(): void {
    if (this.binding.instance?.snapshot.state === 'ready') this.binding.instance.focus();
  }

  private syncVisibility(hidden: boolean, state: WebAppState): void {
    const instance = this.binding.instance;
    if (state !== 'ready' || !instance) return;
    if (hidden && instance.snapshot.state === 'ready') instance.hide();
    if (!hidden && instance.snapshot.state === 'hidden') instance.show();
  }
}
