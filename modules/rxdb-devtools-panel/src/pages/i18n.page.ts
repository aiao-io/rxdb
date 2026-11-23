import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConnectionGuardComponent } from '../components/connection-guard.component';
import { I18nStateService } from '../services/i18n-state.service';
import { PanelI18nService } from '../services/panel-i18n.service';

/** 国际化目录与缺失文案检视面板。 */
@Component({
  selector: 'app-i18n-page',
  imports: [ConnectionGuardComponent],
  providers: [I18nStateService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-connection-guard>
      <section class="flex h-full flex-col gap-3 overflow-auto p-3" data-testid="i18n-panel">
        <header class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">{{ t('i18n.title') }}</h2>
          <button class="btn btn-ghost btn-xs" [disabled]="state.loading()" (click)="state.refresh()">{{ t('common.refresh') }}</button>
        </header>
        @if (state.error()) {
          <div class="alert alert-error text-xs" role="alert">{{ state.error() }}</div>
        }
        @if (state.snapshot(); as snapshot) {
          <div class="flex gap-3 text-xs">
            <span
              >{{ t('i18n.currentLocale') }} <strong data-testid="i18n-current-locale">{{ snapshot.locale }}</strong></span
            ><span>{{ t('i18n.availableLocales') }} {{ snapshot.availableLocales.join(' / ') }}</span>
          </div>
          <h3 class="text-xs font-semibold">{{ t('i18n.catalogSources', { count: snapshot.messages.length }) }}</h3>
          <div class="overflow-x-auto">
            <table class="table-xs table">
              <thead>
                <tr>
                  <th>{{ t('i18n.localeColumn') }}</th>
                  <th>{{ t('i18n.namespaceColumn') }}</th>
                  <th>Key</th>
                  <th>{{ t('i18n.sourceColumn') }}</th>
                  <th>{{ t('i18n.statusColumn') }}</th>
                  <th>{{ t('i18n.messageColumn') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (message of snapshot.messages; track $index) {
                  <tr [class.opacity-50]="!message.active">
                    <td>{{ message.locale }}</td>
                    <td>{{ message.namespace }}</td>
                    <td class="font-mono">{{ message.key }}</td>
                    <td>{{ message.source }}</td>
                    <td>{{ message.active ? t('i18n.active') : t('i18n.overridden') }}</td>
                    <td class="whitespace-pre-wrap">{{ message.value }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold">{{ t('i18n.missingKeys', { count: snapshot.missingMessages.length }) }}</h3>
            @if (snapshot.canClearMissing) {
              <button
                class="btn btn-outline btn-xs"
                [disabled]="state.clearing()"
                (click)="state.clearMissing()"
                data-testid="clear-i18n-missing"
              >
                {{ t('i18n.clearDiagnostics') }}
              </button>
            }
          </div>
          @if (snapshot.missingMessages.length === 0) {
            <p class="text-xs opacity-60">{{ t('i18n.noMissing') }}</p>
          } @else {
            <table class="table-xs table">
              <thead>
                <tr>
                  <th>{{ t('i18n.localeColumn') }}</th>
                  <th>{{ t('i18n.namespaceColumn') }}</th>
                  <th>Key</th>
                  <th>{{ t('i18n.firstObserved') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (missing of snapshot.missingMessages; track missing.id) {
                  <tr>
                    <td>{{ missing.locale }}</td>
                    <td>{{ missing.namespace }}</td>
                    <td class="font-mono">{{ missing.key }}</td>
                    <td>{{ missing.updatedAt }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        } @else if (state.loading()) {
          <p class="text-xs opacity-60">{{ t('i18n.loading') }}</p>
        } @else {
          <p class="text-xs opacity-60">{{ t('i18n.unavailable') }}</p>
        }
      </section>
    </app-connection-guard>
  `
})
export class I18nPage {
  readonly state = inject(I18nStateService);
  protected readonly t = inject(PanelI18nService).t;
}
