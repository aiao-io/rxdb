import { useI18n } from '@aiao/rxdb-i18n-angular';
import { ChangeDetectionStrategy, Component, DOCUMENT, effect, inject } from '@angular/core';
import { LucideDynamicIcon, LucideMenu as Menu, LucideSettings2 as Settings2 } from '@lucide/angular';
import { AppService } from '../app.service';
import { DEMO_DATE_OPTIONS, DEMO_FORMAT_DATE, DEMO_FORMAT_NUMBER } from '../rxdb/i18n';

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
    [attr.aria-label]="i18n.t('shell.navbar')"
    role="navigation"
  >
    <div class="inline-flex items-center gap-3">
      <button class="btn btn-ghost btn-sm md:hidden" (click)="app.toggleSidebar()" [attr.aria-label]="i18n.t('shell.toggleMenu')">
        <svg [lucideIcon]="Menu" size="20"></svg>
      </button>
    </div>
    <div class="pointer-events-auto inline-flex items-center gap-3">
      <div class="hidden text-xs sm:block" [attr.aria-label]="i18n.t('shell.localePreview')">
        <span data-testid="i18n-formatted-date">{{ i18n.formatDate(formatDate, dateOptions) }}</span>
        <span class="mx-2" aria-hidden="true">·</span>
        <span data-testid="i18n-formatted-number">{{ i18n.formatNumber(formatNumber) }}</span>
      </div>
      <label class="inline-flex items-center gap-2 text-sm">
        <span>{{ i18n.t('shell.language') }}</span>
        <select
          class="select select-sm w-auto"
          [value]="i18n.locale().startsWith('en') ? 'en' : 'zh-Hans'"
          (change)="changeLocale($event)"
          data-testid="i18n-locale"
        >
          <option value="zh-Hans">{{ i18n.t('i18n.locale.zh') }}</option>
          <option value="en">{{ i18n.t('i18n.locale.en') }}</option>
        </select>
      </label>
    </div>
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppHeader {
  private readonly document = inject(DOCUMENT);
  protected readonly Settings2 = Settings2;
  protected readonly Menu = Menu;
  protected readonly formatDate = DEMO_FORMAT_DATE;
  protected readonly formatNumber = DEMO_FORMAT_NUMBER;
  protected readonly dateOptions = DEMO_DATE_OPTIONS;
  app = inject(AppService);
  readonly i18n = useI18n();

  constructor() {
    effect(() => {
      this.document.documentElement.lang = this.i18n.locale();
    });
  }

  protected changeLocale(event: Event): void {
    void this.i18n.setLocale((event.target as HTMLSelectElement).value);
  }
}
