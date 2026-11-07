import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { LucideAngularModule, MessageSquare, Plus, Trash2 } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';

export interface ChatSessionItem {
  id: string;
  name: string;
  lastUsedAt: string;
}

/**
 * AI 会话列表组件
 *
 * 全高列表视图，展示 ChatSession 列表，支持新建/删除/切换会话。
 */
@Component({
  selector: 'lib-ai-session-list',
  imports: [DatePipe, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-1 flex-col overflow-y-auto">
      @for (session of sessions(); track session.id) {
        <div
          class="group border-base-200 hover:bg-base-200 flex cursor-pointer items-center justify-between border-b px-3 py-3 transition-colors"
          (click)="selectSession.emit(session.id)"
          (keydown.enter)="selectSession.emit(session.id)"
          (keydown.space)="selectSession.emit(session.id)"
          role="button"
          tabindex="0"
        >
          <div class="flex items-center gap-2 overflow-hidden">
            <lucide-icon class="text-base-content/40 shrink-0" [img]="MessageSquareIcon" size="14" />
            <div class="flex flex-col gap-0.5 overflow-hidden">
              <span class="truncate text-sm">{{ session.name }}</span>
              <span class="text-base-content/40 text-xs">{{ session.lastUsedAt | date }}</span>
            </div>
          </div>
          <button
            class="btn btn-ghost btn-xs text-error opacity-0 transition-opacity group-hover:opacity-100"
            (click)="onDelete($event, session.id)"
          >
            <lucide-icon [img]="Trash2Icon" size="12" />
          </button>
        </div>
      } @empty {
        <div class="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <lucide-icon class="text-base-content/20" [img]="MessageSquareIcon" size="32" />
          <p class="text-base-content/50 text-sm">{{ t().ai.noSessions }}</p>
          <button class="btn btn-primary btn-sm gap-1" (click)="createSession.emit()">
            <lucide-icon [img]="PlusIcon" size="14" />
            {{ t().ai.newSession }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [':host { display: flex; flex-direction: column; flex: 1; min-height: 0; }']
})
export class AiSessionListComponent {
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly MessageSquareIcon = MessageSquare;
  protected readonly PlusIcon = Plus;
  protected readonly Trash2Icon = Trash2;

  readonly sessions = input<ChatSessionItem[]>([]);
  readonly activeSessionId = input<string>();
  readonly selectSession = output<string>();
  readonly deleteSession = output<string>();
  readonly createSession = output<void>();

  protected onDelete(event: Event, sessionId: string): void {
    event.stopPropagation();
    this.deleteSession.emit(sessionId);
  }
}
