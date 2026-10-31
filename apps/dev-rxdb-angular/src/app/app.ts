import { requestIdleCallbackPolyfill } from '@aiao/utils';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdatesService } from '@modules/angular';
import { NgxLoadingBar } from '@ngx-loading-bar/core';
import { AppService } from './app.service';
import { AppHeader } from './components/app-header';
import { AppSidebar } from './components/app-sidebar';
import { DbConnectionAlert } from './components/db-connection-alert';
import { ImportedDbBanner } from './components/imported-db-banner';
import { I18nPipe } from './pipes/i18n.pipe';

@Component({
  imports: [RouterOutlet, AppSidebar, AppHeader, DbConnectionAlert, ImportedDbBanner, NgxLoadingBar, I18nPipe],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ngx-loading-bar></ngx-loading-bar>
    <div class="flex size-full" id="layout-main">
      @if (app.$sidebarPinned()) {
        <div
          class="sidebar-overlay md:hidden"
          [attr.aria-label]="'shell.closeSidebar' | i18n"
          (click)="app.toggleSidebar()"
          aria-hidden="true"
        ></div>
      }
      <app-sidebar></app-sidebar>
      <div class="flex h-full min-w-0 grow flex-col overflow-auto" id="layout-container">
        <app-header></app-header>
        <app-imported-db-banner></app-imported-db-banner>
        <app-db-connection-alert></app-db-connection-alert>
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
  #swUpdatesService = inject(SwUpdatesService);
  app = inject(AppService);
  isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngOnInit(): void {
    if (this.isBrowser) {
      // safari 不支持 requestIdleCallback
      requestIdleCallbackPolyfill();
      this.#swUpdatesService.enable();
    }
  }
}
