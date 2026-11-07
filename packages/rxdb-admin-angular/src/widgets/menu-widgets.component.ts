import { TIMEZONE_REGIONS, buildTimezoneEntries, timeInZone } from '@aiao/rxdb-admin';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal
} from '@angular/core';
import { LucideCheck, LucideClock, LucideDynamicIcon, LucideLanguages } from '@lucide/angular';
import { injectAdminShell, injectAdminStore, injectAdminText } from '../context';

const TICK_MS = 30_000;

function blurActive(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

function localeLabel(locale: string): string {
  return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
}

/**
 * 语言切换：列出运行时的可用语言，选择后写入偏好。只有一种语言时不渲染。
 */
@Component({
  selector: 'rxdb-admin-language-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon],
  host: { style: 'display: contents' },
  template: `
    @if (locales().length >= 2) {
      <div class="dropdown dropdown-end">
        <button
          class="btn btn-ghost btn-sm btn-square"
          [attr.aria-label]="t('widget.language')"
          aria-haspopup="menu"
          data-testid="admin-widget-language"
          tabindex="0"
          type="button"
        >
          <svg [lucideIcon]="Languages" [size]="18"></svg>
        </button>
        <ul class="dropdown-content menu bg-base-100 rounded-box z-50 w-48 p-2 shadow" role="menu" tabindex="0">
          @for (locale of locales(); track locale) {
            <li>
              <!-- prettier-ignore -->
              <button type="button" role="menuitemradio" [attr.aria-checked]="locale === current()" (click)="choose(locale)">{{ localeLabel(locale) }}@if (locale === current()) {<svg [lucideIcon]="Check" [size]="14"></svg>}</button>
            </li>
          }
        </ul>
      </div>
    }
  `
})
export class AdminLanguageWidgetComponent {
  readonly #shell = injectAdminShell();

  protected readonly t = injectAdminText();
  protected readonly prefs = injectAdminStore(this.#shell.preferences);
  protected readonly revision = injectAdminStore(this.#shell.text);
  protected readonly locales = computed(() => {
    this.revision();
    return this.#shell.i18n.availableLocales;
  });
  protected readonly current = computed(() => {
    this.revision();
    return this.prefs().app.locale || this.#shell.i18n.locale;
  });
  protected readonly Languages = LucideLanguages;
  protected readonly Check = LucideCheck;
  protected readonly localeLabel = localeLabel;

  protected choose(locale: string): void {
    this.#shell.preferences.setPath('app.locale', locale);
    blurActive();
  }
}

/**
 * 时区切换：按地理分组列出常用时区、各自当前时间与 UTC 偏移，每 30 秒刷新一次时间。
 */
@Component({
  selector: 'rxdb-admin-timezone-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon],
  host: { style: 'display: contents' },
  templateUrl: './timezone-widget.component.html'
})
export class AdminTimezoneWidgetComponent {
  readonly #shell = injectAdminShell();
  readonly #now = signal(new Date());

  protected readonly t = injectAdminText();
  protected readonly current = injectAdminStore(this.#shell.timezone);
  protected readonly prefs = injectAdminStore(this.#shell.preferences);
  protected readonly entries = computed(() => buildTimezoneEntries(this.#now()));
  protected readonly offset = computed(
    () => this.entries().find(entry => entry.zone === this.current())?.offset ?? this.current()
  );
  protected readonly regions = computed(() =>
    TIMEZONE_REGIONS.map(region => ({ region, items: this.entries().filter(entry => entry.region === region) }))
  );
  protected readonly Clock = LucideClock;
  protected readonly Check = LucideCheck;

  constructor() {
    const destroyRef = inject(DestroyRef);
    // 与 React 的 useEffect 一致：首次渲染之后才启动计时器（服务端渲染不会留下计时器）
    afterNextRender(() => {
      const timer = setInterval(() => this.#now.set(new Date()), TICK_MS);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  protected timeIn(zone: string): string {
    return timeInZone(zone, this.#now());
  }

  protected choose(zone: string): void {
    this.#shell.preferences.setPath('app.timezone', zone);
    blurActive();
  }
}
