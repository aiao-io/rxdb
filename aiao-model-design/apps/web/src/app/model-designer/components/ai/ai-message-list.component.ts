import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { ArrowDown, Bot, Loader2, LucideAngularModule } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { AiOperationState } from '../../services/ai-state.types';
import { AiMessageComponent, type ChatAnswer, type ChatMessageItem } from './ai-message.component';

/**
 * AI 消息列表组件
 *
 * 提供欢迎态、流式状态和可控自动滚动。用户向上阅读时保留当前位置，
 * 新内容到达后通过底部按钮提示回到底部。
 */
@Component({
  selector: 'lib-ai-message-list',
  imports: [LucideAngularModule, AiMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5" #scrollContainer (scroll)="onScroll()">
        @if (messages().length === 0 && operationState() !== 'generating') {
          <div class="m-auto flex w-full max-w-sm flex-col items-center gap-3 px-4 py-8 text-center">
            <div class="bg-primary/10 text-primary flex h-14 w-14 items-center justify-center rounded-2xl">
              <lucide-icon [img]="BotIcon" aria-hidden="true" size="28" />
            </div>
            <h2 class="text-base font-semibold">{{ emptyTitle() }}</h2>
            <p class="text-base-content/55 text-sm leading-6">{{ emptyDescription() }}</p>
            @if (promptSuggestions().length > 0) {
              <div class="mt-2 flex w-full flex-col gap-2">
                @for (suggestion of promptSuggestions(); track suggestion) {
                  <button
                    class="border-base-300 hover:border-primary hover:bg-primary/5 w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors"
                    (click)="selectSuggestion.emit(suggestion)"
                    type="button"
                  >
                    {{ suggestion }}
                  </button>
                }
              </div>
            }
          </div>
        }

        @for (msg of messages(); track msg.id) {
          <lib-ai-message [answerDisabled]="answerDisabled()" [message]="msg" (answer)="answer.emit($event)" />
        }

        @if (operationState() === 'generating') {
          <div class="text-base-content/60 flex items-center gap-2 px-1 text-sm" aria-live="polite" role="status">
            <lucide-icon class="animate-spin" [img]="Loader2" aria-hidden="true" size="16" />
            <span>{{ isAborting() ? t().ai.stopping : t().ai.generating }}</span>
          </div>
        }
      </div>

      @if (showScrollToBottom()) {
        <button
          class="bg-base-100 border-base-300 hover:border-primary absolute right-5 bottom-4 flex h-9 w-9 items-center justify-center rounded-full border shadow-lg transition-colors"
          [attr.aria-label]="t().ai.scrollToBottom"
          [title]="t().ai.scrollToBottom"
          (click)="scrollToBottom()"
          type="button"
        >
          <lucide-icon [img]="ArrowDownIcon" aria-hidden="true" size="16" />
        </button>
      }
    </div>
  `,
  styles: [':host { display: flex; min-height: 0; flex: 1; }']
})
export class AiMessageListComponent {
  readonly #autoScroll = signal(true);
  readonly #showScrollToBottom = signal(false);
  protected readonly containerEl = viewChild.required<ElementRef<HTMLDivElement>>('scrollContainer');

  protected readonly Loader2 = Loader2;
  protected readonly BotIcon = Bot;
  protected readonly ArrowDownIcon = ArrowDown;
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly showScrollToBottom = this.#showScrollToBottom.asReadonly();

  /** 消息列表 */
  readonly messages = input<ChatMessageItem[]>([]);

  /** AI 操作状态 */
  readonly operationState = input<AiOperationState>('idle');

  /** 是否正在中止（由父组件传入） */
  readonly isAborting = input(false);

  /** 空会话标题 */
  readonly emptyTitle = input('');

  /** 空会话说明 */
  readonly emptyDescription = input('');

  /** 空会话快捷提示 */
  readonly promptSuggestions = input<readonly string[]>([]);

  /** 用户选择快捷提示 */
  readonly selectSuggestion = output<string>();

  /** 生成中时禁用提问的选项 */
  readonly answerDisabled = input(false);

  /** 用户回答了智能体的提问 */
  readonly answer = output<ChatAnswer>();

  constructor() {
    afterRenderEffect(() => {
      this.messages();
      this.operationState();
      this.#autoScroll();

      if (this.#autoScroll()) this.#scrollToBottom('auto');
    });
  }

  protected onScroll(): void {
    const element = this.containerEl().nativeElement;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    this.#autoScroll.set(distance < 48);
    this.#showScrollToBottom.set(distance >= 96);
  }

  protected scrollToBottom(): void {
    this.#autoScroll.set(true);
    this.#showScrollToBottom.set(false);
    this.#scrollToBottom('smooth');
  }

  #scrollToBottom(behavior: ScrollBehavior): void {
    const element = this.containerEl().nativeElement;
    element.scrollTo({ top: element.scrollHeight, behavior });
  }
}
