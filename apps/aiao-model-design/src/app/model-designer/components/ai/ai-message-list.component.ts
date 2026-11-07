import { DecimalPipe } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  viewChild
} from '@angular/core';
import { Loader2, LucideAngularModule } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { AiOperationState } from '../../services/ai-state.types';
import { AiMessageComponent, type ChatMessageItem } from './ai-message.component';

/**
 * AI 消息列表组件
 *
 * 渲染消息气泡与生成状态指示器，消息列表更新时自动滚动到底部。
 */
@Component({
  selector: 'lib-ai-message-list',
  imports: [DecimalPipe, LucideAngularModule, AiMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-1 flex-col gap-2 overflow-y-auto p-4" #scrollContainer>
      @for (msg of messages(); track msg.id) {
        <lib-ai-message [message]="msg" />
      }
      @if (operationState() === 'generating') {
        <div class="text-base-content/60 flex items-center gap-2 text-sm">
          <lucide-icon class="animate-spin" [img]="Loader2" size="16" />
          <span>{{ isAborting() ? t().ai.stopping : t().ai.generating }}</span>
          @if (streamingCharCount() > 0 && !isAborting()) {
            <span class="badge badge-ghost badge-xs text-base-content/80 font-mono">
              {{
                streamingCharCount() >= 1000 ?
                  (streamingCharCount() / 1000 | number: '1.1-2') + ' K'
                : streamingCharCount()
              }}
              {{ t().ai.chars }}
            </span>
          }
        </div>
      }
    </div>
  `,
  styles: [':host { display: contents; }']
})
export class AiMessageListComponent {
  protected readonly containerEl = viewChild.required<ElementRef<HTMLDivElement>>('scrollContainer');

  protected readonly Loader2 = Loader2;
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);

  /** 消息列表 */
  readonly messages = input<ChatMessageItem[]>([]);

  /** AI 操作状态 */
  readonly operationState = input<AiOperationState>('idle');

  /** 流式传输已接收字符数 */
  readonly streamingCharCount = input(0);

  /** 是否正在中止（由父组件传入） */
  readonly isAborting = input(false);

  constructor() {
    afterRenderEffect(() => {
      // 读取响应式依赖，触发任意变化时滚动到底部
      this.messages();
      this.streamingCharCount();
      this.operationState();

      const el = this.containerEl().nativeElement;
      el.scrollTop = el.scrollHeight;
    });
  }
}
