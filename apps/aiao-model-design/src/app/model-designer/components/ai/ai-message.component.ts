import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { AlertCircle, Bot, Check, Copy, Loader2, LucideAngularModule, User } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import { renderAiMarkdown } from './ai-markdown';

/** 一次工具调用在消息里的卡片 */
export interface ChatToolCard {
  id: string;
  /** 工具名，界面按翻译表显示 */
  name: string;
  state: 'running' | 'done' | 'failed';
  /** 成功时的摘要或失败原因 */
  summary: string;
}

/** 智能体向用户提出的问题 */
export interface ChatQuestion {
  toolCallId: string;
  question: string;
  options: { id: string; label: string; description?: string }[];
  /** 已选择的选项文字；未回答时为空 */
  answer?: string;
}

/** 用户对提问的回答 */
export interface ChatAnswer {
  toolCallId: string;
  optionId: string;
  label: string;
}

/** 消息数据结构 */
export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  isStreaming?: boolean;
  tools?: ChatToolCard[];
  question?: ChatQuestion;
}

/**
 * AI 消息组件
 *
 * 使用角色头像、Markdown 内容和消息级复制操作，流式消息保留实时光标。
 */
@Component({
  selector: 'lib-ai-message',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="group flex w-full gap-3"
      [attr.aria-label]="isUser() ? t().ai.userRole : t().ai.assistantRole"
      [class.flex-row-reverse]="isUser()"
    >
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        [class.bg-base-200]="!isUser()"
        [class.bg-primary]="isUser()"
        [class.text-primary-content]="isUser()"
        [class.text-primary]="!isUser()"
      >
        @if (isUser()) {
          <lucide-icon [img]="UserIcon" aria-hidden="true" size="16" />
        } @else {
          <lucide-icon [img]="BotIcon" aria-hidden="true" size="16" />
        }
      </div>

      <div class="flex max-w-[92%] min-w-0 flex-1 flex-col" [class.items-end]="isUser()">
        <div class="text-base-content/50 mb-1 flex items-center gap-2 px-1 text-[11px]">
          <span class="font-medium">{{ isUser() ? t().ai.userRole : t().ai.assistantRole }}</span>
          @if (messageTime(); as time) {
            <time [attr.datetime]="message().createdAt">{{ time }}</time>
          }
        </div>

        @if (message().content || message().isStreaming) {
          <div
            class="min-w-0 rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm"
            [attr.aria-live]="message().isStreaming ? 'polite' : null"
            [class.bg-base-200]="!isUser()"
            [class.bg-primary]="isUser()"
            [class.rounded-tl-md]="!isUser()"
            [class.rounded-tr-md]="isUser()"
            [class.text-primary-content]="isUser()"
          >
            @if (message().content) {
              <div class="ai-message-content" [innerHTML]="renderedContent()"></div>
            } @else {
              <span class="inline-flex items-center gap-1" aria-label="{{ t().ai.generating }}">
                <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]"></span>
                <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]"></span>
                <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-current"></span>
              </span>
            }
            @if (message().isStreaming && message().content) {
              <span class="ml-1 inline-block animate-pulse align-baseline">▍</span>
            }
          </div>
        }

        @if (message().tools?.length) {
          <ul class="mt-2 flex w-full flex-col gap-1" [attr.aria-label]="t().ai.toolCalls">
            @for (tool of message().tools; track tool.id) {
              <li
                class="border-base-300 bg-base-100 flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                [attr.data-state]="tool.state"
              >
                @switch (tool.state) {
                  @case ('running') {
                    <lucide-icon class="mt-0.5 shrink-0 animate-spin" [img]="LoaderIcon" aria-hidden="true" size="13" />
                  }
                  @case ('done') {
                    <lucide-icon class="text-success mt-0.5 shrink-0" [img]="CheckIcon" aria-hidden="true" size="13" />
                  }
                  @case ('failed') {
                    <lucide-icon class="text-error mt-0.5 shrink-0" [img]="AlertIcon" aria-hidden="true" size="13" />
                  }
                }
                <div class="min-w-0">
                  <span class="font-medium">{{ t().ai.tools[tool.name] ?? tool.name }}</span>
                  @if (tool.summary) {
                    <p class="text-base-content/65 break-words whitespace-pre-line">{{ tool.summary }}</p>
                  }
                </div>
              </li>
            }
          </ul>
        }

        @if (message().question; as question) {
          <fieldset
            class="border-primary/30 bg-primary/5 mt-2 w-full rounded-xl border p-3"
            [disabled]="!!question.answer || answerDisabled()"
          >
            <legend class="px-1 text-sm font-medium">{{ question.question }}</legend>
            <div class="flex flex-col gap-2">
              @for (option of question.options; track option.id) {
                <button
                  class="btn btn-sm h-auto min-h-9 flex-col items-start gap-0 py-1.5 text-left"
                  [class.btn-outline]="question.answer !== option.label"
                  [class.btn-primary]="question.answer === option.label"
                  (click)="answer.emit({ toolCallId: question.toolCallId, optionId: option.id, label: option.label })"
                  type="button"
                >
                  <span>{{ option.label }}</span>
                  @if (option.description) {
                    <span class="text-xs font-normal opacity-70">{{ option.description }}</span>
                  }
                </button>
              }
            </div>
          </fieldset>
        }

        @if (message().content && !message().isStreaming) {
          <div
            class="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          >
            <button
              class="btn btn-ghost btn-xs text-base-content/60 h-7 min-h-7 gap-1 px-2"
              [attr.aria-label]="copied() ? t().ai.copiedMessage : t().ai.copyMessage"
              [title]="copied() ? t().ai.copiedMessage : t().ai.copyMessage"
              (click)="onCopy()"
              type="button"
            >
              @if (copied()) {
                <lucide-icon [img]="CheckIcon" aria-hidden="true" size="13" />
                {{ t().ai.copiedMessage }}
              } @else {
                <lucide-icon [img]="CopyIcon" aria-hidden="true" size="13" />
                {{ t().ai.copyMessage }}
              }
            </button>
          </div>
        }
      </div>
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .ai-message-content :where(p) {
        margin: 0 0 0.65rem;
      }

      .ai-message-content :where(p:last-child) {
        margin-bottom: 0;
      }

      .ai-message-content :where(h3) {
        margin: 0 0 0.5rem;
        font-size: 0.95rem;
        font-weight: 700;
        line-height: 1.45;
      }

      .ai-message-content :where(ul, ol) {
        margin: 0.35rem 0 0.65rem 1.25rem;
        padding: 0;
      }

      .ai-message-content :where(ul) {
        list-style: disc;
      }

      .ai-message-content :where(ol) {
        list-style: decimal;
      }

      .ai-message-content :where(li + li) {
        margin-top: 0.25rem;
      }

      .ai-message-content :where(blockquote) {
        margin: 0.5rem 0;
        border-left: 3px solid color-mix(in srgb, currentColor 35%, transparent);
        padding-left: 0.75rem;
        opacity: 0.85;
      }

      .ai-message-content :where(code) {
        border-radius: 0.35rem;
        background: color-mix(in srgb, currentColor 12%, transparent);
        padding: 0.12rem 0.35rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.88em;
      }

      .ai-message-content :where(pre) {
        max-width: 100%;
        overflow-x: auto;
        border-radius: 0.65rem;
        background: color-mix(in srgb, currentColor 10%, transparent);
        padding: 0.75rem;
      }

      .ai-message-content :where(pre code) {
        display: block;
        overflow-x: auto;
        background: transparent;
        padding: 0;
        white-space: pre;
      }

      .ai-message-content :where(a) {
        text-decoration: underline;
        text-underline-offset: 2px;
      }
    `
  ]
})
export class AiMessageComponent {
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly UserIcon = User;
  protected readonly BotIcon = Bot;
  protected readonly CopyIcon = Copy;
  protected readonly CheckIcon = Check;
  protected readonly LoaderIcon = Loader2;
  protected readonly AlertIcon = AlertCircle;
  protected readonly copied = signal(false);

  protected readonly isUser = computed(() => this.message().role === 'user');
  protected readonly renderedContent = computed(() => renderAiMarkdown(this.message().content));
  protected readonly messageTime = computed(() => {
    const createdAt = this.message().createdAt;
    if (!createdAt) return '';
    const date = new Date(createdAt);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  readonly message = input.required<ChatMessageItem>();

  /** 生成中或已提交时禁用提问的选项 */
  readonly answerDisabled = input(false);

  /** 用户选择了提问的一个选项 */
  readonly answer = output<ChatAnswer>();

  protected onCopy(): void {
    void this.#copyMessage();
  }

  async #copyMessage(): Promise<void> {
    const content = this.message().content;
    if (!content || typeof navigator === 'undefined' || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(content);
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 1500);
    } catch {
      this.copied.set(false);
    }
  }
}
