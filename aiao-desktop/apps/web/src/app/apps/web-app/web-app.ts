import type { OrbitDragRegion } from '@aiao/orbit/window';
import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  computed,
  effect,
  inject,
  linkedSignal,
  untracked,
  viewChild
} from '@angular/core';

import { DesktopAppContexts } from '../../services/app-context';
import { ApplicationRuntime } from '../../services/application-runtime';
import { WebAppManifest } from '../../services/desktop-apps';
import { AppInstanceState, DesktopWindow } from '../../services/desktop-window';
import { OrbitHost } from '../../services/orbit-host';
import { RemoteAppSession } from '../../services/remote-app-session';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';
import { TrafficLights } from '../../shared/traffic-lights';
import { dragClipPath } from './web-app-drag';

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
 * 应用实例的创建、重试、失败与能力（ADESK-US-206 阶段 C）都在 {@link RemoteAppSession} 里：每次尝试一个新的实例 ID、
 * 新的 Orbit 实例与新的能力上下文，窗口状态走应用运行时（`win.state`、`win.failure`），这个组件只是它的视图。
 *
 * 窗口接口（D-14，对应 Tauri 的 getCurrentWindow）：应用经 Orbit 请求最小化、缩放、关闭、改标题；
 * 透明窗口的应用可以隐藏桌面的标题栏，自己画标题栏，并上报拖动区，桌面在 iframe 上方盖同形状的拖动层。
 * 未在清单里声明的能力被拒绝，窗口里给出一句可见的原因（窗口内的提示条）。
 */
@Component({
  selector: 'app-web-app',
  imports: [Icon, TrafficLights],
  templateUrl: './web-app.html',
  styleUrl: './web-app.scss',
  encapsulation: ViewEncapsulation.None,
  providers: [DesktopAppContexts],
  host: { style: 'display: contents' }
})
export class WebAppWindow {
  private readonly wm = inject(WindowManager);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  protected readonly session: RemoteAppSession;
  protected readonly win = inject(DesktopWindow);
  protected readonly app = webManifest(this.win);
  /** 窗口里应用实例的状态，取自应用运行时；窗口关闭动画期间保持关闭前的样子，不闪成空白。 */
  protected readonly state = linkedSignal<AppInstanceState, WebAppState>({
    source: this.win.state,
    computation: (state, previous) => {
      if (state === 'closing' || state === 'closed') return previous?.value ?? 'ready';
      if (state === 'failed') return 'failed';
      return state === 'ready' ? 'ready' : 'loading';
    }
  });
  protected readonly reason = computed(() => this.win.failure() ?? '');
  protected readonly shielded = computed(() => this.wm.focused() !== this.win);

  constructor() {
    const session = new RemoteAppSession({
      win: this.win,
      app: this.app,
      orbit: inject(OrbitHost).runtime,
      runtime: inject(ApplicationRuntime),
      contexts: inject(DesktopAppContexts)
    });
    this.session = session;
    inject(DestroyRef).onDestroy(() => session.dispose());
    afterNextRender(() => void session.start(this.stage().nativeElement));
    effect(() => this.syncVisibility(this.win.hidden(), this.state()));
    /* 应用就绪时，如果窗口在前台，把键盘焦点交给应用。 */
    effect(() => {
      if (this.win.state() === 'ready') untracked(() => this.focusIfForeground());
    });
  }

  /** 激活层：窗口框架在捕获阶段已把窗口提到前台；等鼠标按下的默认焦点动作做完，再把键盘焦点交给应用。 */
  protected activate(): void {
    setTimeout(() => this.focusApp());
  }

  protected retry(): void {
    void this.session.retry();
  }

  protected clipPath(region: OrbitDragRegion): string {
    return dragClipPath(region);
  }

  private focusIfForeground(): void {
    if (this.wm.focused() === this.win) this.focusApp();
  }

  private focusApp(): void {
    const instance = this.session.instance;
    if (instance?.snapshot.state === 'ready') instance.focus();
  }

  private syncVisibility(hidden: boolean, state: WebAppState): void {
    const instance = this.session.instance;
    if (state !== 'ready' || !instance) return;
    if (hidden && instance.snapshot.state === 'ready') instance.hide();
    if (!hidden && instance.snapshot.state === 'hidden') instance.show();
  }
}
