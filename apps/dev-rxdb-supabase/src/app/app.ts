import { requestIdleCallbackPolyfill } from '@aiao/utils';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DOCUMENT, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeader } from './app-header';
import { AppSidebar } from './app-sidebar';
import { AppService } from './app.service';
import { RemoteSecurityNotice } from './remote-security-notice';
import { SessionNotice } from './session-notice';

@Component({
  imports: [RouterOutlet, AppSidebar, AppHeader, RemoteSecurityNotice, SessionNotice],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex size-full" id="layout-main">
      <app-sidebar></app-sidebar>
      <div class="flex h-full min-w-0 grow flex-col overflow-auto" id="layout-container">
        <app-header></app-header>
        <app-session-notice></app-session-notice>
        <app-remote-security-notice></app-remote-security-notice>
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
    const local = Intl.DateTimeFormat().resolvedOptions().locale;
    this.#document.documentElement.lang = local;

    if (this.isBrowser) {
      // safari 不支持 requestIdleCallback
      requestIdleCallbackPolyfill();
    }
  }
}
