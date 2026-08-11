import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideDynamicIcon, LucideMenu as Menu } from '@lucide/angular';
import { AppService } from '../app.service';

/** 顶部栏：侧边栏开关与主题切换。 */
@Component({
  imports: [LucideDynamicIcon],
  selector: 'app-header',
  styles: [
    `
      :host {
        pointer-events: none;
      }
      :host {
        .btn {
          pointer-events: auto;
        }
      }
    `
  ],
  template: `<div
    class="flex items-center justify-between p-1"
    id="layout-topbar"
    aria-label="Navbar"
    role="navigation"
  >
    <div class="inline-flex items-center gap-3">
      <button class="btn btn-ghost btn-sm md:hidden" (click)="app.toggleSidebar()" aria-label="Toggle menu">
        <svg [lucideIcon]="Menu" size="20"></svg>
      </button>
    </div>
    <div class="hidden items-center gap-1 2xl:inline-flex"></div>
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppHeader {
  protected readonly Menu = Menu;
  app = inject(AppService);
}
