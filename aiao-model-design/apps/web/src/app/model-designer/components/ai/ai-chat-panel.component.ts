import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import {
  AlertCircle,
  ArrowLeft,
  Database,
  Loader2,
  LucideAngularModule,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Square
} from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { AgentNotice } from '../../services/agent-conversation.service';
import type { BranchDiff } from '../../services/ai-branch.service';
import type { AiOperationState } from '../../services/ai-state.types';
import { AiMessageListComponent } from './ai-message-list.component';
import { type ChatAnswer, type ChatMessageItem } from './ai-message.component';
import { AiSessionListComponent, type ChatSessionItem } from './ai-session-list.component';
import { BranchManagerComponent, type BranchItem } from './branch-manager.component';

const NOTICE_KEYS = {
  loading: 'noticeLoading',
  unconfigured: 'noticeUnconfigured',
  'signed-out': 'noticeSignedOut',
  unavailable: 'noticeUnavailable',
  'read-only': 'noticeReadOnly'
} as const;

/**
 * AI 对话面板组件
 *
 * 参考 NextChat 的工作流组织聊天：会话列表、上下文标题栏、消息工作区、
 * 快捷提示和多行输入工具栏，同时承接模型生成与变更预览的专属能力。
 */
@Component({
  selector: 'lib-ai-chat-panel',
  imports: [LucideAngularModule, AiMessageListComponent, AiSessionListComponent, BranchManagerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (currentView() === 'list') {
      <section class="bg-base-100 flex min-h-0 flex-1 flex-col">
        <header class="border-base-300 flex items-center justify-between gap-3 border-b px-4 py-3">
          <div class="flex min-w-0 items-center gap-3">
            <div class="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
              <lucide-icon [img]="SparklesIcon" aria-hidden="true" size="18" />
            </div>
            <div class="min-w-0">
              <h2 class="truncate text-sm font-semibold">{{ t().ai.sessionList }}</h2>
              <p class="text-base-content/50 truncate text-xs">{{ t().ai.sessionListHint }}</p>
            </div>
          </div>
          <button
            class="btn btn-primary btn-sm shrink-0 gap-1"
            [attr.aria-label]="t().ai.newSession"
            (click)="createSessionEvent.emit()"
            type="button"
          >
            <lucide-icon [img]="PlusIcon" aria-hidden="true" size="15" />
            <span class="hidden sm:inline">{{ t().ai.newSession }}</span>
          </button>
        </header>

        <div class="border-base-300 bg-base-200/35 border-b px-4 py-3">
          <div class="text-base-content/65 flex items-center gap-2 text-xs">
            <lucide-icon [img]="DatabaseIcon" aria-hidden="true" size="14" />
            <span>{{ t().ai.modelContext }}</span>
            @if (selectedEntityName()) {
              <span class="text-base-content/35">·</span>
              <span class="text-primary truncate font-medium">{{ selectedEntityName() }}</span>
            }
          </div>
        </div>

        <lib-ai-session-list
          class="min-h-0 flex-1"
          [activeSessionId]="activeSessionId()"
          [sessions]="sessions()"
          (createSession)="createSessionEvent.emit()"
          (deleteSession)="deleteSessionEvent.emit($event)"
          (selectSession)="selectSessionEvent.emit($event)"
        />
      </section>
    } @else {
      <section class="bg-base-100 flex min-h-0 flex-1 flex-col">
        <header class="border-base-300 flex min-w-0 items-center gap-2 border-b px-3 py-2.5">
          <button
            class="btn btn-ghost btn-sm btn-square shrink-0"
            [attr.aria-label]="t().ai.backToSessions"
            [title]="t().ai.backToSessions"
            (click)="backToList.emit()"
            type="button"
          >
            <lucide-icon [img]="ArrowLeftIcon" aria-hidden="true" size="16" />
          </button>
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-center gap-2">
              <h2 class="truncate text-sm font-semibold">{{ currentSessionName() }}</h2>
              <span class="badge badge-ghost badge-sm hidden shrink-0 gap-1 sm:inline-flex">
                <lucide-icon [img]="SparklesIcon" aria-hidden="true" size="11" />
                {{ t().ai.agentLabel }}
              </span>
            </div>
            @if (selectedEntityName()) {
              <p class="text-base-content/50 truncate text-xs">
                {{ t().ai.currentEntity }} · {{ selectedEntityName() }}
              </p>
            }
          </div>
          <button
            class="btn btn-ghost btn-sm btn-square shrink-0"
            [attr.aria-label]="t().ai.newSession"
            [title]="t().ai.newSession"
            (click)="createSessionEvent.emit()"
            type="button"
          >
            <lucide-icon [img]="PlusIcon" aria-hidden="true" size="16" />
          </button>
        </header>

        <lib-ai-message-list
          class="min-h-0 flex-1"
          [answerDisabled]="operationState() === 'generating'"
          [emptyDescription]="t().ai.emptyDescription"
          [emptyTitle]="t().ai.emptyTitle"
          [isAborting]="isAborting()"
          [messages]="messages()"
          [operationState]="operationState()"
          [promptSuggestions]="promptSuggestions()"
          (answer)="answerQuestion.emit($event)"
          (selectSuggestion)="onSuggestion($event)"
        />

        @if (operationState() === 'previewing') {
          <div class="border-base-300 bg-base-200/70 max-h-64 overflow-hidden border-t px-3 py-2">
            <lib-branch-manager
              [branchDiff]="branchDiff()"
              [branches]="branches()"
              [currentBranchId]="currentBranchId()"
              (compareBranch)="compareBranch.emit($event)"
              (confirmMerge)="confirmMerge.emit()"
              (discardChanges)="discardChanges.emit()"
              (switchBranch)="onBranchSwitch($event)"
            />
          </div>
        }

        <footer class="border-base-300 bg-base-100 border-t p-3">
          @if (blockingMessage(); as message) {
            <div class="text-warning mb-2 flex flex-wrap items-center gap-2 text-xs" role="status">
              <lucide-icon [img]="AlertCircleIcon" aria-hidden="true" size="14" />
              <span>{{ message }}</span>
              @if (notice() === 'signed-out') {
                <a class="link link-primary" href="/login.html">{{ t().ai.signIn }}</a>
              }
              @if (notice() === 'unavailable') {
                <button class="btn btn-ghost btn-xs" (click)="refreshAgent.emit()" type="button">
                  {{ t().ai.retry }}
                </button>
              }
            </div>
          }
          @if (agentError(); as error) {
            <div class="text-error mb-2 flex items-start gap-2 text-xs" role="alert">
              <lucide-icon class="mt-0.5 shrink-0" [img]="AlertCircleIcon" aria-hidden="true" size="14" />
              <span class="break-words">{{ t().ai.agentError }}{{ error }}</span>
            </div>
          }
          @if (hasError() && operationState() === 'idle') {
            <button class="btn btn-outline btn-sm mb-2 w-full gap-2" (click)="retryRequest.emit()" type="button">
              <lucide-icon [img]="RotateCcwIcon" aria-hidden="true" size="14" />
              {{ t().ai.retry }}
            </button>
          }

          <div class="border-base-300 focus-within:border-primary rounded-2xl border shadow-sm transition-colors">
            <div class="text-base-content/50 flex items-center gap-2 px-3 pt-2 text-[11px]">
              <span class="badge badge-ghost badge-xs gap-1">
                <lucide-icon [img]="SparklesIcon" aria-hidden="true" size="11" />
                {{ t().ai.agentLabel }}
              </span>
              @if (selectedEntityName()) {
                <span class="truncate">{{ t().ai.currentEntity }}: {{ selectedEntityName() }}</span>
              }
              <span class="ml-auto hidden shrink-0 sm:inline">{{ t().ai.inputHint }}</span>
            </div>

            <textarea
              class="max-h-48 min-h-20 w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 outline-none"
              #chatInput
              [attr.aria-label]="t().ai.inputPlaceholder"
              [disabled]="!canInput()"
              [placeholder]="t().ai.inputPlaceholder"
              [value]="inputValue()"
              (compositionend)="onCompositionEnd()"
              (compositionstart)="onCompositionStart()"
              (input)="onInput($event)"
              (keydown.enter)="onEnterKey($event)"
              rows="3"
            ></textarea>

            <div class="text-base-content/50 flex items-center justify-between gap-2 px-3 pb-2">
              <span class="truncate text-[11px]">
                @if (operationState() === 'generating') {
                  {{ isAborting() ? t().ai.stopping : t().ai.generating }}
                } @else {
                  {{ t().ai.inputHint }}
                }
              </span>
              @if (operationState() === 'generating') {
                <button
                  class="btn btn-error btn-sm btn-circle shrink-0"
                  [attr.aria-label]="t().ai.stopGenerating"
                  [disabled]="isAborting()"
                  [title]="t().ai.stopGenerating"
                  (click)="onAbort()"
                  type="button"
                >
                  @if (isAborting()) {
                    <lucide-icon class="animate-spin" [img]="Loader2Icon" aria-hidden="true" size="16" />
                  } @else {
                    <lucide-icon [img]="StopIcon" aria-hidden="true" size="16" />
                  }
                </button>
              } @else {
                <button
                  class="btn btn-primary btn-sm btn-circle shrink-0"
                  [attr.aria-label]="t().ai.send"
                  [disabled]="!canSend()"
                  [title]="t().ai.send"
                  (click)="onSend()"
                  type="button"
                >
                  <lucide-icon [img]="SendIcon" aria-hidden="true" size="16" />
                </button>
              }
            </div>
          </div>
        </footer>
      </section>
    }
  `,
  styles: [':host { display: flex; min-height: 0; height: 100%; flex: 1; flex-direction: column; }']
})
export class AiChatPanelComponent {
  /** 中止请求进行中（本地乐观状态，直到 operationState 离开 generating） */
  readonly #isAborting = signal(false);
  readonly #isComposing = signal(false);
  readonly #textareaEl = signal<HTMLTextAreaElement | null>(null);
  protected readonly textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('chatInput');

  protected readonly SendIcon = Send;
  protected readonly Loader2Icon = Loader2;
  protected readonly AlertCircleIcon = AlertCircle;
  protected readonly ArrowLeftIcon = ArrowLeft;
  protected readonly PlusIcon = Plus;
  protected readonly RotateCcwIcon = RotateCcw;
  protected readonly StopIcon = Square;
  protected readonly SparklesIcon = Sparkles;
  protected readonly DatabaseIcon = Database;
  protected readonly MessageSquareIcon = MessageSquare;
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);

  /** 输入值 */
  protected readonly inputValue = signal('');

  /** 是否正在停止中（仅在 generating 状态下有意义） */
  protected readonly isAborting = computed(() => this.#isAborting() && this.operationState() === 'generating');

  /** 当前视图：列表 or 对话详情（由 activeSessionId 推导） */
  protected readonly currentView = computed(() => (this.activeSessionId() ? 'chat' : 'list'));

  /** 当前会话标题 */
  protected readonly currentSessionName = computed(
    () => this.sessions().find(session => session.id === this.activeSessionId())?.name ?? this.t().ai.newSession
  );

  /** 空会话快捷提示 */
  protected readonly promptSuggestions = computed(() => {
    const ai = this.t().ai;
    return [ai.suggestionGenerateModel, ai.suggestionRefineEntity, ai.suggestionExplainModel];
  });

  /** 是否可以输入 */
  protected readonly canInput = computed(() => {
    if (this.notice() || this.awaitingAnswer()) return false;
    const state = this.operationState();
    return state === 'idle' || state === 'previewing' || this.isAborting();
  });

  /** 阻塞消息 */
  protected readonly blockingMessage = computed(() => {
    const notice = this.notice();
    if (notice) return this.t().ai[NOTICE_KEYS[notice]];
    return this.awaitingAnswer() ? this.t().ai.awaitingAnswer : '';
  });

  /** 是否可以发送（停止中不允许发送） */
  protected readonly canSend = computed(
    () => this.canInput() && this.inputValue().trim().length > 0 && !this.isAborting()
  );

  /** 消息列表 */
  readonly messages = input<ChatMessageItem[]>([]);

  /** AI 操作状态 */
  readonly operationState = input<AiOperationState>('idle');

  /** AI 入口不可用的原因；为空时可以发送 */
  readonly notice = input<AgentNotice>(null);

  /** 当前轮在等用户回答提问 */
  readonly awaitingAnswer = input(false);

  /** 最近一次 AI 操作失败的原因 */
  readonly agentError = input<string | null>(null);

  /** 会话列表 */
  readonly sessions = input<ChatSessionItem[]>([]);

  /** 当前活跃会话 ID */
  readonly activeSessionId = input<string>();

  /** 选中实体名称（注入上下文） */
  readonly selectedEntityName = input<string>();

  /** 是否有最近的错误（显示重试按钮） */
  readonly hasError = input(false);

  /** 分支列表（由编排器提供） */
  readonly branches = input<BranchItem[]>([{ id: 'main', parentId: null }]);

  /** 当前分支 ID */
  readonly currentBranchId = input('main');

  /** 当前分支对比结果（有则展示 BranchDiffView） */
  readonly branchDiff = input<BranchDiff | undefined>(undefined);

  /** 用户发送消息 */
  readonly sendMessage = output<string>();

  /** 确认合并 */
  readonly confirmMerge = output<void>();

  /** 丢弃变更 */
  readonly discardChanges = output<void>();

  /** 重试上次请求 */
  readonly retryRequest = output<void>();

  /** 切换会话 */
  readonly selectSessionEvent = output<string>();

  /** 创建会话 */
  readonly createSessionEvent = output<void>();

  /** 删除会话 */
  readonly deleteSessionEvent = output<string>();

  /** 回答智能体的提问 */
  readonly answerQuestion = output<ChatAnswer>();

  /** 重新确认 AI 服务是否可用 */
  readonly refreshAgent = output<void>();

  /** 中止生成 */
  readonly abortGeneration = output<void>();

  /** 返回会话列表 */
  readonly backToList = output<void>();

  /** 展示分支对比（含分支 ID） */
  readonly compareBranch = output<string>();

  protected onInput(event: Event): void {
    const element = event.target as HTMLTextAreaElement;
    this.#textareaEl.set(element);
    this.inputValue.set(element.value);
    this.#resizeTextarea(element);
  }

  protected onCompositionStart(): void {
    this.#isComposing.set(true);
  }

  protected onCompositionEnd(): void {
    this.#isComposing.set(false);
  }

  protected onEnterKey(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (
      keyboardEvent.isComposing ||
      keyboardEvent.keyCode === 229 ||
      this.#isComposing() ||
      keyboardEvent.shiftKey ||
      keyboardEvent.altKey ||
      keyboardEvent.ctrlKey ||
      keyboardEvent.metaKey
    ) {
      return;
    }
    if (!this.canSend()) return;
    event.preventDefault();
    this.onSend();
  }

  protected onSend(): void {
    const value = this.inputValue().trim();
    if (!value) return;
    this.#isAborting.set(false);
    this.sendMessage.emit(value);
    this.inputValue.set('');
    const element = this.#textareaEl() ?? this.textareaRef()?.nativeElement;
    if (element) {
      element.value = '';
      this.#resizeTextarea(element);
    }
  }

  protected onSuggestion(value: string): void {
    this.inputValue.set(value);
    const element = this.#textareaEl() ?? this.textareaRef()?.nativeElement;
    if (!element) return;
    element.value = value;
    this.#resizeTextarea(element);
    element.focus();
  }

  protected onAbort(): void {
    this.#isAborting.set(true);
    this.abortGeneration.emit();
  }

  /** 切换到 main 分支 = 丢弃 AI 变更 */
  protected onBranchSwitch(branchId: string): void {
    if (branchId === 'main') this.discardChanges.emit();
  }

  #resizeTextarea(element: HTMLTextAreaElement): void {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 192)}px`;
  }
}
