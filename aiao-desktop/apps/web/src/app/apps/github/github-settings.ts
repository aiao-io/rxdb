import { useI18n } from '@aiao/rxdb-i18n-angular';
import { Component, input, model, output, signal } from '@angular/core';
import { LucideDynamicIcon, LucideHome, LucidePaintbrush, LucideUserRound } from '@lucide/angular';

import type { GitHubSession } from '../../services/github/github-types';
import { FocusTrap } from '../../shared/focus-trap';
import {
  DATE_FORMATS,
  NUMBER_FORMATS,
  TAB_SIZES,
  THEMES,
  TIME_FORMATS,
  formatGithubDate,
  formatGithubNumber,
  formatGithubTime,
  type GithubAppearance
} from './github-appearance';

type SettingsTab = 'accounts' | 'appearance';
const preview = new Date(2017, 9, 19, 14, 30, 45);
type SelectKey = 'tabSize' | 'dateFormat' | 'timeFormat' | 'numberFormat';
const selectValues: { readonly [K in SelectKey]: readonly GithubAppearance[K][] } = {
  tabSize: TAB_SIZES,
  dateFormat: DATE_FORMATS,
  timeFormat: TIME_FORMATS,
  numberFormat: NUMBER_FORMATS
};

@Component({
  selector: 'app-github-settings',
  imports: [FocusTrap, LucideDynamicIcon],
  templateUrl: './github-settings.html',
  host: { style: 'display: contents' }
})
export class GithubSettings {
  protected readonly i18n = useI18n();
  protected readonly tab = signal<SettingsTab>('accounts');
  protected readonly tokenForm = signal(false);
  protected readonly UserRound = LucideUserRound;
  protected readonly tabs = [
    { id: 'accounts', label: 'apps.github.settingsTabAccounts', icon: LucideHome },
    { id: 'appearance', label: 'apps.github.settingsTabAppearance', icon: LucidePaintbrush }
  ] as const;
  protected readonly themes = THEMES;
  protected readonly tabSizes = TAB_SIZES;
  protected readonly dateFormats = DATE_FORMATS.map(value => ({
    value,
    label: `${formatGithubDate(preview, value)} (${value})`
  }));
  protected readonly timeFormats = TIME_FORMATS.map(value => ({
    value,
    label: `${formatGithubTime(preview, value)} (${value})`
  }));
  protected readonly numberFormats = NUMBER_FORMATS.map(value => ({
    value,
    label: formatGithubNumber(1234567.89, value)
  }));

  readonly idPrefix = input.required<string>();
  readonly appearance = model.required<GithubAppearance>();
  readonly account = input.required<GitHubSession | null>();
  readonly authBusy = input.required<boolean>();
  readonly oauthPending = input.required<boolean>();
  readonly authError = input.required<string | null>();
  readonly saveError = input.required<string | null>();
  readonly saving = input.required<boolean>();

  readonly signIn = output<void>();
  readonly signInWithToken = output<string>();
  readonly signOut = output<void>();
  readonly cancelSignIn = output<void>();
  readonly dismissed = output<void>();
  readonly save = output<void>();

  protected themeLabel(theme: (typeof THEMES)[number]): string {
    const labels: Record<(typeof THEMES)[number], string> = {
      light: 'apps.github.themeLight',
      dark: 'apps.github.themeDark',
      system: 'apps.github.themeSystem'
    };
    return this.i18n.t(labels[theme]);
  }

  protected navigateTabs(event: KeyboardEvent, list: HTMLElement): void {
    const key = event.key;
    if (key === 'Home') this.tab.set('accounts');
    else if (key === 'End') this.tab.set('appearance');
    else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      this.tab.update(tab => (tab === 'accounts' ? 'appearance' : 'accounts'));
    } else return;
    event.preventDefault();
    list.querySelector<HTMLElement>(`[data-tab="${this.tab()}"]`)?.focus();
  }

  protected update<K extends keyof GithubAppearance>(key: K, value: GithubAppearance[K]): void {
    this.appearance.update(current => ({ ...current, [key]: value }));
  }

  protected changeSelect<K extends SelectKey>(key: K, select: HTMLSelectElement): void {
    const values: readonly GithubAppearance[K][] = selectValues[key];
    const value = values.find(item => String(item) === select.value);
    if (value !== undefined) this.update(key, value);
  }

  protected submitToken(event: SubmitEvent, token: HTMLInputElement): void {
    event.preventDefault();
    if (this.authBusy() || !token.value.trim()) return;
    this.signInWithToken.emit(token.value);
    token.value = '';
  }

  protected dismiss(event: Event): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    if (!this.saving()) this.dismissed.emit();
  }
}
