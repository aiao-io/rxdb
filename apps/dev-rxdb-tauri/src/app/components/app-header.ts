import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideDynamicIcon, LucideMenu as Menu, LucideSettings2 as Settings2 } from '@lucide/angular';
import { AppService } from '../app.service';

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
/** 顶部导航条：窄屏下提供侧边栏开关。 */
export class AppHeader {
  protected readonly Settings2 = Settings2;
  protected readonly Menu = Menu;
  /** 外壳布局状态，模板绑定用。 */
  app = inject(AppService);
}
