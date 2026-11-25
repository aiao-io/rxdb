import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideDynamicIcon, LucideMenu as Menu } from '@lucide/angular';
import { AppService } from './app.service';
import { IDENTITY_CHOICES } from './demo-identity';
import { DemoSession } from './demo-session';
import { RemoteSecurityNotice } from './remote-security-notice';

/**
 * 顶栏：远端同步的安全提示图标、当前身份与切换身份（远端模式才有）。
 *
 * @remarks
 * 切换身份会登录或退出，然后重新加载页面，打开那个身份自己的本地库（US-035）。
 */
@Component({
  selector: 'app-header',
  imports: [LucideDynamicIcon, RemoteSecurityNotice],
  styles: [
    `
      :host {
        pointer-events: none;
      }
      :host {
        .btn,
        .identity,
        app-remote-security-notice {
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
      <!-- 窄屏上侧栏收起成抽屉，从这里打开；宽屏侧栏常驻，不需要 -->
      <button class="btn btn-ghost btn-sm md:hidden" (click)="app.toggleSidebar()" aria-label="菜单" type="button">
        <svg [lucideIcon]="Menu" size="20"></svg>
      </button>
    </div>
    <div class="flex items-center gap-2">
      <app-remote-security-notice />
      @if (session.description; as description) {
        <div class="identity bg-base-100 rounded-box flex items-center gap-2 px-2 py-1 shadow-sm">
          <div class="flex flex-col text-right leading-tight">
            <span class="text-sm font-semibold" data-testid="identity-title">{{ description.title }}</span>
            <span class="text-base-content/60 text-xs">{{ description.detail }}</span>
          </div>
          <!-- 选中项绑在每个 option 上：select 的 [value] 先于 @for 渲染出选项，会落回第一项 -->
          <select
            class="select select-sm w-40"
            [disabled]="session.$switching()"
            (change)="switchTo($event)"
            aria-label="切换身份"
          >
            @if (session.currentChoice === null) {
              <option disabled selected value="">其他账号</option>
            }
            @for (choice of choices; track choice.key) {
              <option [selected]="choice.key === session.currentChoice" [value]="choice.key">{{ choice.label }}</option>
            }
          </select>
        </div>
      }
    </div>
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppHeader {
  readonly app = inject(AppService);
  readonly session = inject(DemoSession);
  readonly choices = IDENTITY_CHOICES;
  readonly Menu = Menu;

  switchTo(event: Event): void {
    void this.session.switchTo((event.target as HTMLSelectElement).value);
  }
}
