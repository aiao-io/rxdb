import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  LucideDatabase as Database,
  LucideDynamicIcon,
  LucidePanelLeftClose as PanelLeftClose,
  LucidePanelLeftDashed as PanelLeftDashed
} from '@lucide/angular';
import { ThemeBtn } from '@modules/angular';
import { AppMenu } from './app-menu';
import { AppService } from './app.service';
import { BranchManager } from './branch-manager';

@Component({
  imports: [LucideDynamicIcon, ThemeBtn, AppMenu, BranchManager],
  selector: 'app-sidebar',
  template: `
    <div class="bg-base-300 flex items-center justify-between p-1">
      <div id="logo">
        <button
          class="btn btn-ghost btn-sm hover:border-transparent hover:bg-transparent"
          (click)="app.toggleSidebar()"
          aria-label="sidebar toggle"
        >
          <svg [lucideIcon]="Database" size="16"></svg>
          <span id="logo-name">RxDB</span>
        </button>
      </div>
      <button class="btn btn-ghost btn-sm" (click)="app.toggleSidebar()" aria-label="sidebar toggle">
        @if (app.$sidebarPinned()) {
          <svg [lucideIcon]="PanelLeftClose" size="16"></svg>
        } @else {
          <svg [lucideIcon]="PanelLeftDashed" size="16"></svg>
        }
      </button>
    </div>
    <div class="bg-base-200 flex-1 overflow-y-auto" [class.hide-scrollbar]="!app.$sidebarPinned()">
      <app-menu></app-menu>
    </div>
    <div class="bg-base-300 flex flex-col p-1">
      <div class="flex flex-row justify-between">
        <app-branch-manager></app-branch-manager>
        <div class="flex gap-1">
          <ao-theme-btn></ao-theme-btn>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        border-right: 1px solid color-mix(in oklch, var(--color-base-content), transparent 90%);
        display: flex;
        flex-direction: column;
        transition: width 0.3s ease-in-out;
        width: 48px;
        overflow: hidden;
        #logo:hover {
          position: absolute;
          opacity: 0;
        }
        #logo-name {
          display: none;
        }
      }
      :has(.left-menu-pinned) :host {
        border-color: transparent;
        width: 240px;
        #logo:hover {
          position: initial;
          opacity: 1;
        }
        #logo-name {
          display: block;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppSidebar {
  protected readonly PanelLeftClose = PanelLeftClose;
  protected readonly PanelLeftDashed = PanelLeftDashed;
  protected readonly Database = Database;

  protected readonly app = inject(AppService);
}
