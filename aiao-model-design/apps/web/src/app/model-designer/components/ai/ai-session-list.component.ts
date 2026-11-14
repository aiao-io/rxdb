import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { LucideAngularModule, MessageSquare, Plus, Search, Trash2 } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';

export interface ChatSessionItem {
  id: string;
  name: string;
  lastUsedAt: string;
  /** 迁移前的旧会话，只能查看 */
  readOnly?: boolean;
}

/**
 * AI 会话列表组件
 *
 * 参考 NextChat 的会话工作流：快速搜索、当前会话高亮、明确的新建和删除入口。
 */
@Component({
  selector: 'lib-ai-session-list',
  imports: [DatePipe, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <label class="border-base-300 bg-base-100 flex items-center gap-2 border-b px-4 py-3">
        <lucide-icon class="text-base-content/45" [img]="SearchIcon" aria-hidden="true" size="15" />
        <input
          class="w-full bg-transparent text-sm outline-none"
          [attr.aria-label]="t().ai.searchSessions"
          [placeholder]="t().ai.searchSessions"
          [value]="searchTerm()"
          (input)="onSearch($event)"
        />
      </label>

      <div class="min-h-0 flex-1 overflow-y-auto py-2">
        @for (session of filteredSessions(); track session.id) {
          <div class="group flex items-stretch gap-1 px-2">
            <button
              class="hover:bg-base-200 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors"
              [attr.aria-current]="activeSessionId() === session.id ? 'page' : null"
              [class.bg-primary/10]="activeSessionId() === session.id"
              [class.text-primary]="activeSessionId() === session.id"
              (click)="selectSession.emit(session.id)"
              type="button"
            >
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                [class.bg-base-200]="activeSessionId() !== session.id"
                [class.bg-primary/15]="activeSessionId() === session.id"
              >
                <lucide-icon [img]="MessageSquareIcon" aria-hidden="true" size="15" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="truncate text-sm font-medium">{{ session.name }}</span>
                <span class="text-base-content/45 flex min-w-0 items-center gap-1.5 text-xs">
                  <span class="truncate">{{ session.lastUsedAt | date: 'M/d HH:mm' }}</span>
                  @if (session.readOnly) {
                    <span class="badge badge-ghost badge-xs shrink-0">{{ t().ai.legacySession }}</span>
                  }
                </span>
              </span>
            </button>
            <button
              class="btn btn-ghost btn-square btn-xs text-error mt-2 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              [attr.aria-label]="t().ai.deleteSession + ' ' + session.name"
              [title]="t().ai.deleteSession"
              (click)="onDelete($event, session.id)"
              type="button"
            >
              <lucide-icon [img]="Trash2Icon" aria-hidden="true" size="14" />
            </button>
          </div>
        } @empty {
          <div class="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
            <lucide-icon class="text-base-content/20" [img]="MessageSquareIcon" aria-hidden="true" size="34" />
            <p class="text-base-content/55 text-sm">
              {{ sessions().length > 0 ? t().ai.noMatchingSessions : t().ai.noSessions }}
            </p>
            @if (sessions().length === 0) {
              <button class="btn btn-primary btn-sm gap-1" (click)="createSession.emit()" type="button">
                <lucide-icon [img]="PlusIcon" aria-hidden="true" size="14" />
                {{ t().ai.newSession }}
              </button>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [':host { display: flex; min-height: 0; flex: 1; flex-direction: column; }']
})
export class AiSessionListComponent {
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly MessageSquareIcon = MessageSquare;
  protected readonly PlusIcon = Plus;
  protected readonly Trash2Icon = Trash2;
  protected readonly SearchIcon = Search;
  protected readonly searchTerm = signal('');
  protected readonly filteredSessions = computed(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase();
    if (!term) return this.sessions();
    return this.sessions().filter(session => session.name.toLocaleLowerCase().includes(term));
  });

  readonly sessions = input<ChatSessionItem[]>([]);
  readonly activeSessionId = input<string>();
  readonly selectSession = output<string>();
  readonly deleteSession = output<string>();
  readonly createSession = output<void>();

  protected onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  protected onDelete(event: Event, sessionId: string): void {
    event.stopPropagation();
    this.deleteSession.emit(sessionId);
  }
}
