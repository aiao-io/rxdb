import { Component, ElementRef, ViewEncapsulation, computed, inject, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { DesktopWindow } from '../../services/desktop-window';
import { WindowManager } from '../../services/window-manager';
import { TrafficLights } from '../../shared/traffic-lights';
import { SALTLINE_ENTRY } from './saltline-entry';

/**
 * 几猫3A大作：随桌面发布的单文件 3D 游戏，在窗口里的同源 iframe 中运行（D-15）。输入、指针锁定、全屏、
 * 设置与暂停都由游戏自己处理；窗口只管三件事：后台时盖激活层，点一下只激活窗口，再把键盘焦点交给游戏；
 * 拖动与缩放窗口时 iframe 不截走指针；关闭窗口即销毁游戏文档。
 */
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
  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>('frame');
  protected readonly win = inject(DesktopWindow);
  /** 入口是随桌面发布的固定文件，不来自用户输入。 */
  protected readonly src = inject(DomSanitizer).bypassSecurityTrustResourceUrl(SALTLINE_ENTRY);
  protected readonly shielded = computed(() => this.wm.focused() !== this.win);

  /** 激活层：窗口框架在捕获阶段已把窗口提到前台；等鼠标按下的默认焦点动作做完，再把键盘焦点交给游戏。 */
  protected activate(): void {
    setTimeout(() => this.focusGame());
  }

  /** 游戏文档加载完时窗口还在前台，就把键盘焦点交给它，打开即可用键盘操作。 */
  protected loaded(): void {
    if (this.wm.focused() === this.win) this.focusGame();
  }

  private focusGame(): void {
    this.frame().nativeElement.contentWindow?.focus();
  }
}
