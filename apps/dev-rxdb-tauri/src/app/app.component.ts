import { requestIdleCallbackPolyfill } from '@aiao/utils';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgxLoadingBar } from '@ngx-loading-bar/core';
import { AppService } from './app.service';
import { AppHeader } from './components/app-header';
import { AppSidebar } from './components/app-sidebar';

@Component({
  imports: [RouterOutlet, AppSidebar, AppHeader, NgxLoadingBar],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ngx-loading-bar></ngx-loading-bar>
    <div class="flex size-full" id="layout-main">
      @if (app.$sidebarPinned()) {
        <div
          class="sidebar-overlay md:hidden"
          (click)="app.toggleSidebar()"
          aria-hidden="true"
          aria-label="Close sidebar"
        ></div>
      }
      <app-sidebar></app-sidebar>
      <div class="flex h-full min-w-0 grow flex-col overflow-auto" id="layout-container">
        <app-header></app-header>
        <div id="layout-content">
          <router-outlet></router-outlet>
        </div>
      </div>
    </div>
  `,
  styles: [],
  host: {
    '[class.left-menu-pinned]': 'app.$sidebarPinned()',
    '[class.header-floating]': 'app.$headerFloating()'
  }
})
/** 应用根组件：侧边栏 + 头部 + 路由出口的外壳布局。 */
export class AppComponent implements OnInit {
  #document = inject(DOCUMENT);
  /** 外壳布局状态，模板直接绑定。 */
  app = inject(AppService);
  /** 是否运行在浏览器（含 Tauri webview）而非服务端渲染。 */
  isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** 同步 `<html lang>`，并在浏览器端补上 Safari 缺失的 `requestIdleCallback`。 */
  ngOnInit(): void {
    const local = Intl.DateTimeFormat().resolvedOptions().locale;
    this.#document.documentElement.lang = local;

    if (this.isBrowser) {
      // safari 不支持 requestIdleCallback
      requestIdleCallbackPolyfill();
    }
  }
}
