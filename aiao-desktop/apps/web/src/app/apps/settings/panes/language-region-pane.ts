import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, computed } from '@angular/core';

/** 面板展示的语言：'zh' 目录是中文消息的双注册，归并展示为 zh-Hans。 */
interface LanguageOption {
  readonly locale: string;
  readonly labelKey: string;
}

/** 语言列表固定为 English / 简体中文；新增语言时扩展这里与对应目录。 */
const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { locale: 'en', labelKey: 'settings.language.english' },
  { locale: 'zh-Hans', labelKey: 'settings.language.chineseSimplified' }
];

/**
 * 把运行时的当前 locale 归一到面板语言：zh*（zh-CN/zh-TW/zh-HK/zh-Hans）算 zh-Hans，其余算 en。
 * 与回退链一致：非中文设备（如 de-DE）经 defaultLocale 显示英文，标记英文为首选。
 */
export const effectiveLanguageOf = (locale: string): string =>
  locale.toLowerCase().startsWith('zh') ? 'zh-Hans' : 'en';

/** 语言与地区：首选语言列表，点击即时切换并持久保存（ADESK-US-132）。 */
@Component({
  selector: 'app-language-region-pane',
  imports: [],
  host: { style: 'display: contents' },
  template: `
    <div class="st-group" data-language-region>
      <div class="st-label">{{ i18n.t('settings.language.preferredLanguages') }}</div>
      @for (option of options; track option.locale) {
        <div
          class="st-item"
          [attr.aria-label]="i18n.t(option.labelKey)"
          [attr.data-lang]="option.locale"
          (click)="select(option.locale)"
          (keydown.enter)="select(option.locale)"
          role="button"
          tabindex="0"
        >
          <div class="lb" style="min-width: 0; flex: 1">{{ i18n.t(option.labelKey) }}</div>
          @if (current() === option.locale) {
            <div class="rt" data-primary>{{ i18n.t('settings.language.primary') }}</div>
          }
        </div>
      }
    </div>
  `
})
export class LanguageRegionPane {
  protected readonly i18n = useI18n();
  protected readonly options = LANGUAGE_OPTIONS;
  protected readonly current = computed(() => effectiveLanguageOf(this.i18n.locale()));

  protected select(locale: string): void {
    void this.i18n.setLocale(locale);
  }
}
