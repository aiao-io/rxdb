import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { AppResourceState, DesktopWindow } from '../../services/desktop-window';
import { RuntimeActivity } from '../../services/runtime-activity';
import { WindowManager } from '../../services/window-manager';
import { TrafficLights } from '../../shared/traffic-lights';
import { SALTLINE_ENTRY } from './saltline-entry';

interface SaltlineBridge {
  setVisible(visible: boolean): void;
  subscribe(listener: (state: AppResourceState, error: string | null) => void): () => void;
}

/** 同源游戏保留会话，隐藏时由宿主桥接停止绘制和音频。 */
@Component({
  selector: 'app-saltline',
  imports: [TrafficLights],
  template: `
    <div class="tb dark" data-drag>
      <div class="title">{{ win.title() }}</div>
      <div class="tbz"><app-traffic-lights /></div>
      <div class="grow"></div>
      <div class="tbz"></div>
    </div>
    <div class="saltline">
      <iframe
        class="saltline-frame"
        #frame
        [src]="src"
        [title]="win.app.name"
        (load)="loaded()"
        allow="fullscreen; gamepad"
        data-saltline-frame
      ></iframe>
      @if (shielded()) {
        <div class="saltline-shield" (pointerdown)="activate()" data-saltline-shield></div>
      }
    </div>
  `,
  styleUrl: './saltline.scss',
  encapsulation: ViewEncapsulation.None,
  host: { style: 'display: contents' }
})
export class SaltlineApp {
  private readonly wm = inject(WindowManager);
  private readonly activity = inject(RuntimeActivity);
  private readonly bridge = signal<SaltlineBridge | null>(null);
  private unsubscribe: (() => void) | undefined;
  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');
  protected readonly win = inject(DesktopWindow);
  /** 入口是随桌面发布的固定文件，不来自用户输入。 */
  protected readonly src = inject(DomSanitizer).bypassSecurityTrustResourceUrl(SALTLINE_ENTRY);
  protected readonly shielded = computed(() => this.wm.focused() !== this.win);

  constructor() {
    this.win.resourceState.set('pending');
    effect(() => this.bridge()?.setVisible(this.activity.visible(this.win)));
    const close = this.win.beforeClose.subscribe(() => this.bridge()?.setVisible(false));
    inject(DestroyRef).onDestroy(() => {
      this.unsubscribe?.();
      close.unsubscribe();
      this.bridge()?.setVisible(false);
    });
  }

  /** 激活层：窗口框架在捕获阶段已把窗口提到前台；等鼠标按下的默认焦点动作做完，再把键盘焦点交给游戏。 */
  protected activate(): void {
    setTimeout(() => this.focusGame());
  }

  /** 游戏文档加载完时窗口还在前台，就把键盘焦点交给它，打开即可用键盘操作。 */
  protected loaded(): void {
    this.unsubscribe?.();
    const view = this.frame().nativeElement.contentWindow as (Window & { saltlineDesktop?: SaltlineBridge }) | null;
    const bridge = view?.saltlineDesktop;
    if (bridge) {
      this.bridge.set(bridge);
      this.unsubscribe = bridge.subscribe((state, error) => {
        this.win.resourceState.set(state);
        this.win.resourceFailure.set(error);
      });
    }
    if (this.wm.focused() === this.win) this.focusGame();
  }

  private focusGame(): void {
    this.frame().nativeElement.contentWindow?.focus();
  }
}
