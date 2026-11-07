import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** 消息数据结构 */
export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

/**
 * AI 消息气泡组件
 *
 * user 消息右对齐，assistant 消息左对齐。
 * streaming 时显示打字指示器。
 */
@Component({
  selector: 'lib-ai-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex w-full"
      [class.justify-end]="message().role === 'user'"
      [class.justify-start]="message().role === 'assistant'"
    >
      <div
        class="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
        [class.bg-base-200]="message().role === 'assistant'"
        [class.bg-primary]="message().role === 'user'"
        [class.text-base-content]="message().role === 'assistant'"
        [class.text-primary-content]="message().role === 'user'"
      >
        {{ message().content }}
        @if (message().isStreaming) {
          <span class="ml-1 inline-block animate-pulse">▍</span>
        }
      </div>
    </div>
  `,
  styles: [':host { display: block; }']
})
export class AiMessageComponent {
  readonly message = input.required<ChatMessageItem>();
}
