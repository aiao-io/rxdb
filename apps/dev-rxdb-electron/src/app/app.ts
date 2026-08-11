import { requestIdleCallbackPolyfill } from '@aiao/utils';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgxLoadingBar } from '@ngx-loading-bar/core';
import { AppService } from './app.service';
import { AppHeader } from './components/app-header';
import { AppSidebar } from './components/app-sidebar';

/** 应用外壳：侧边栏 + 头部 + 路由出口的三段式布局。 */
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
export class App implements OnInit {
  #document = inject(DOCUMENT);
  app = inject(AppService);
  isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngOnInit(): void {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    this.#document.documentElement.lang = locale;

    if (this.isBrowser) {
      // safari 不支持 requestIdleCallback
      requestIdleCallbackPolyfill();
    }
  }
}
