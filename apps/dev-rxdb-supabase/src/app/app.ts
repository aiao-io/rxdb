import { requestIdleCallbackPolyfill } from '@aiao/utils';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeader } from './app-header';
import { AppSidebar } from './app-sidebar';
import { AppService } from './app.service';
import { DemoSession } from './demo-session';
import { PageWorkbench } from './page-workbench';
import { SessionNotice } from './session-notice';
import { SidePanelOutlet } from './side-panel';
import { ToastOutlet } from './toast-outlet';

@Component({
  imports: [RouterOutlet, AppSidebar, AppHeader, SessionNotice, SidePanelOutlet, ToastOutlet],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex size-full" id="layout-main">
      @if (app.$sidebarPinned()) {
        <!-- 窄屏上侧栏是抽屉：遮罩盖住页面，点一下收起（宽屏由 md:hidden 隐藏） -->
        <div class="sidebar-overlay md:hidden" (click)="app.toggleSidebar()" aria-hidden="true"></div>
      }
      <app-sidebar></app-sidebar>
      <div class="flex h-full min-w-0 grow flex-col" id="layout-container">
        <app-header></app-header>
        <app-session-notice></app-session-notice>
        <!-- 内容与右侧面板并排、各自滚动：宽屏面板占一栏不挡页面，窄屏面板是盖住页面的抽屉 -->
        <div class="flex min-h-0 grow">
          <div class="min-w-0 grow overflow-auto" id="layout-content">
            <router-outlet></router-outlet>
          </div>
          <app-side-panel-outlet></app-side-panel-outlet>
        </div>
      </div>
    </div>
    <!-- 操作结果的消息：盖在页面与右侧面板之上 -->
    <app-toast-outlet></app-toast-outlet>
  `,
  styles: [],
  host: {
    '[class.left-menu-pinned]': 'app.$sidebarPinned()',
    // 顶栏有内容（远端模式的身份、页面登记的按钮）就占自己的一行；只剩菜单按钮时悬浮，不挡页面内容
    '[class.header-floating]': 'app.$headerFloating() && !session.description && !workbench.current()'
  }
})
export class App implements OnInit {
  #document = inject(DOCUMENT);
  app = inject(AppService);
  session = inject(DemoSession);
  workbench = inject(PageWorkbench);
  isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngOnInit(): void {
    const local = Intl.DateTimeFormat().resolvedOptions().locale;
    this.#document.documentElement.lang = local;

    if (this.isBrowser) {
      // safari 不支持 requestIdleCallback
      requestIdleCallbackPolyfill();
    }
  }
}
