import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IDENTITY_CHOICES } from './demo-identity';
import { DemoSession } from './demo-session';

/**
 * 顶栏：当前身份与切换身份（远端模式才有）。
 *
 * @remarks
 * 切换身份会登录或退出，然后重新加载页面，打开那个身份自己的本地库（US-035）。
 */
@Component({
  selector: 'app-header',
  styles: [
    `
      :host {
        pointer-events: none;
      }
      :host {
        .btn,
        .identity {
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
    <div class="inline-flex items-center gap-3"></div>
    @if (session.description; as description) {
      <div class="identity bg-base-100 rounded-box flex items-center gap-2 px-2 py-1 shadow-sm">
        <div class="flex flex-col text-right leading-tight">
          <span class="text-sm font-semibold" data-testid="identity-title">{{ description.title }}</span>
          <span class="text-base-content/60 text-xs">{{ description.detail }}</span>
        </div>
        <select
          class="select select-sm w-40"
          [disabled]="session.$switching()"
          [value]="session.currentChoice ?? ''"
          (change)="switchTo($event)"
          aria-label="切换身份"
        >
          @if (session.currentChoice === null) {
            <option value="" disabled>其他账号</option>
          }
          @for (choice of choices; track choice.key) {
            <option [value]="choice.key">{{ choice.label }}</option>
          }
        </select>
      </div>
    }
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppHeader {
  readonly session = inject(DemoSession);
  readonly choices = IDENTITY_CHOICES;

  switchTo(event: Event): void {
    void this.session.switchTo((event.target as HTMLSelectElement).value);
  }
}
