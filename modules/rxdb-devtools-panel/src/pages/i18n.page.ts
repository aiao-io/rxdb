import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConnectionGuardComponent } from '../components/connection-guard.component';
import { I18nStateService } from '../services/i18n-state.service';

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
          <h2 class="text-sm font-semibold">国际化 / I18n</h2>
          <button class="btn btn-ghost btn-xs" [disabled]="state.loading()" (click)="state.refresh()">刷新</button>
        </header>
        @if (state.error()) {
          <div class="alert alert-error text-xs" role="alert">{{ state.error() }}</div>
        }
        @if (state.snapshot(); as snapshot) {
          <div class="flex gap-3 text-xs">
            <span
              >当前语言 <strong data-testid="i18n-current-locale">{{ snapshot.locale }}</strong></span
            ><span>可用语言 {{ snapshot.availableLocales.join(' / ') }}</span>
          </div>
          <h3 class="text-xs font-semibold">目录与来源（{{ snapshot.messages.length }}）</h3>
          <div class="overflow-x-auto">
            <table class="table-xs table">
              <thead>
                <tr>
                  <th>语言</th>
                  <th>命名空间</th>
                  <th>Key</th>
                  <th>来源</th>
                  <th>状态</th>
                  <th>文案</th>
                </tr>
              </thead>
              <tbody>
                @for (message of snapshot.messages; track $index) {
                  <tr [class.opacity-50]="!message.active">
                    <td>{{ message.locale }}</td>
                    <td>{{ message.namespace }}</td>
                    <td class="font-mono">{{ message.key }}</td>
                    <td>{{ message.source }}</td>
                    <td>{{ message.active ? '生效' : '已覆盖' }}</td>
                    <td class="whitespace-pre-wrap">{{ message.value }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold">缺失 Key（{{ snapshot.missingMessages.length }}）</h3>
            @if (snapshot.canClearMissing) {
              <button
                class="btn btn-outline btn-xs"
                [disabled]="state.clearing()"
                (click)="state.clearMissing()"
                data-testid="clear-i18n-missing"
              >
                清空诊断
              </button>
            }
          </div>
          @if (snapshot.missingMessages.length === 0) {
            <p class="text-xs opacity-60">暂无缺失文案诊断</p>
          } @else {
            <table class="table-xs table">
              <thead>
                <tr>
                  <th>语言</th>
                  <th>命名空间</th>
                  <th>Key</th>
                  <th>首次观察</th>
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
          <p class="text-xs opacity-60">读取国际化状态…</p>
        } @else {
          <p class="text-xs opacity-60">被检查的页面未提供国际化检视。</p>
        }
      </section>
    </app-connection-guard>
  `
})
export class I18nPage {
  readonly state = inject(I18nStateService);
}
