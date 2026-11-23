import type { HistoryItem, HistoryScopeType } from '@aiao/rxdb';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, InjectionToken, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideX } from '@lucide/angular';

const historyLabels = {
  'history.open': '历史记录',
  'history.title': '操作历史',
  'history.close': '关闭历史',
  'history.empty': '暂无操作历史',
  'history.database': '数据库',
  'history.repository': '仓库',
  'history.entity': '实体',
  'history.undone': '已撤销',
  'history.invalidated': '已失效'
} as const;

export interface HistorySidebarPresentation {
  label(key: keyof typeof historyLabels): string;
  formatTime(date: Date): string;
  description(item: HistoryItem): string;
}

export const HISTORY_SIDEBAR_PRESENTATION = new InjectionToken<HistorySidebarPresentation>(
  'History sidebar presentation',
  {
    providedIn: 'root',
    factory: () => ({
      label: key => historyLabels[key],
      formatTime: date => formatDate(date, 'y-MM-dd HH:mm:ss.SSS', 'en-US'),
      description: item => item.description
    })
  }
);

@Component({
  selector: 'ao-history-sidebar',
  imports: [LucideDynamicIcon, ScrollingModule],
  standalone: true,
  template: `
    @let show = this.show();
    @let scope = this.scopeType();
    @let histories = this.histories();
    @let hasHistories = histories.length > 0;
    @if (show) {
      <!-- 移动端遮罩：窄屏下侧栏浮在内容上方（md 以上由 md:hidden 收起） -->
      <div class="bg-base-content/40 fixed inset-0 z-30 md:hidden" (click)="closeClick.emit()" aria-hidden="true"></div>
    }
    <aside
      class="bg-base-100 border-base-300 flex h-full flex-col overflow-hidden shadow-lg transition-all duration-300 max-md:absolute max-md:inset-y-0 max-md:z-40 max-md:shadow-2xl"
      [class.border-l]="borderSide() === 'left'"
      [class.border-r]="borderSide() === 'right'"
      [class.max-md:left-0]="borderSide() === 'left'"
      [class.max-md:right-0]="borderSide() === 'right'"
      [class.w-0]="!show"
      [class.w-48]="show"
      data-testid="history-sidebar"
    >
      <div class="flex h-full min-w-48 flex-col">
        <div class="border-base-300 border-b px-4 py-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold">{{ presentation.label('history.title') }}</h2>
              @if (scope === 'database') {
                <span class="badge badge-xs badge-primary">{{ presentation.label('history.database') }}</span>
              } @else if (scope === 'repository') {
                <span class="badge badge-xs badge-secondary">{{ presentation.label('history.repository') }}</span>
              } @else if (scope === 'entity') {
                <span class="badge badge-xs badge-accent">{{ presentation.label('history.entity') }}</span>
              }
            </div>
            <button
              class="btn btn-circle btn-ghost btn-xs"
              [attr.aria-label]="presentation.label('history.close')"
              (click)="closeClick.emit()"
            >
              <svg [lucideIcon]="closeIcon" size="14"></svg>
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-hidden">
          @if (hasHistories) {
            <cdk-virtual-scroll-viewport class="h-full" [itemSize]="80">
              <ol class="border-base-300 relative border-l-2 px-3">
                <li
                  class="relative h-20 overflow-hidden pt-3 pb-2 pl-4"
                  *cdkVirtualFor="let item of histories; trackBy: trackByFn"
                >
                  <div
                    class="ring-base-100 absolute top-4 -left-[5px] h-2.5 w-2.5 rounded-full ring-2"
                    [class.bg-error]="item.type === 'DELETE'"
                    [class.bg-info]="item.type === 'UPDATE'"
                    [class.bg-primary]="item.type === 'TRANSACTION'"
                    [class.bg-success]="item.type === 'INSERT'"
                    [class.opacity-40]="item.reverted"
                  ></div>
                  <div [class.opacity-50]="item.reverted">
                    <time
                      class="text-base-content/50 mb-1 block text-[10px]"
                      [attr.datetime]="item.createdAt.toISOString()"
                    >
                      {{ presentation.formatTime(item.createdAt) }}
                    </time>
                    <p class="text-base-content mb-1.5 truncate text-xs" [class.line-through]="item.redoInvalidated">
                      <span>#{{ item.changeId }}</span>
                      {{ presentation.description(item) }}
                    </p>
                    <div class="flex flex-wrap gap-1">
                      @switch (scope) {
                        @case ('database') {
                          <span class="badge badge-xs badge-soft badge-ghost">{{ item.namespace }}</span>
                          <span class="badge badge-xs badge-soft badge-primary">{{ item.entity }}</span>
                        }
                      }
                      @if (item.reverted && !item.redoInvalidated) {
                        <span class="badge badge-xs badge-soft badge-warning">{{
                          presentation.label('history.undone')
                        }}</span>
                      }
                      @if (item.redoInvalidated) {
                        <span class="badge badge-xs badge-soft badge-error">{{
                          presentation.label('history.invalidated')
                        }}</span>
                      }
                    </div>
                  </div>
                </li>
              </ol>
            </cdk-virtual-scroll-viewport>
          } @else {
            <div class="text-base-content/40 flex min-h-40 items-center justify-center text-xs">
              {{ presentation.label('history.empty') }}
            </div>
          }
        </div>
      </div>
    </aside>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistorySidebarComponent {
  readonly presentation = inject(HISTORY_SIDEBAR_PRESENTATION);
  readonly closeIcon = LucideX;
  readonly show = input.required<boolean>();
  readonly histories = input.required<HistoryItem[]>();
  readonly scopeType = input.required<HistoryScopeType>();
  readonly borderSide = input<'left' | 'right'>('left');
  readonly closeClick = output<void>();
  readonly trackByFn = (_index: number, item: HistoryItem) => item.fingerprint;
}
