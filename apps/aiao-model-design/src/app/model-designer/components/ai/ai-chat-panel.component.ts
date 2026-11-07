import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { AlertCircle, ArrowLeft, Loader2, LucideAngularModule, Plus, RotateCcw, Send, Square } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { BranchDiff } from '../../services/ai-branch.service';
import type { AiOperationState } from '../../services/ai-state.types';
import type { ChatChangeProposal } from '../../types/ai-schemas';
import { AiDiffPreviewComponent } from './ai-diff-preview.component';
import { AiMessageListComponent } from './ai-message-list.component';
import { type ChatMessageItem } from './ai-message.component';
import { AiSessionListComponent, type ChatSessionItem } from './ai-session-list.component';
import { BranchManagerComponent, type BranchItem } from './branch-manager.component';

/**
 * AI 对话面板组件
 *
 * Copilot 风格：列表视图展示历史会话，点击进入对话详情，可返回列表。
 */
@Component({
  selector: 'lib-ai-chat-panel',
  imports: [
    LucideAngularModule,
    AiMessageListComponent,
    AiSessionListComponent,
    AiDiffPreviewComponent,
    BranchManagerComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (currentView() === 'list') {
      <!-- 会话列表视图 -->
      <div class="border-base-300 flex items-center justify-between border-b px-3 py-2">
        <span class="text-sm font-medium">{{ t().ai.sessionList }}</span>
        <button class="btn btn-ghost btn-xs gap-1" (click)="createSessionEvent.emit()">
          <lucide-icon [img]="PlusIcon" size="14" />
          {{ t().ai.newSession }}
        </button>
      </div>
      <lib-ai-session-list
        [sessions]="sessions()"
        (createSession)="createSessionEvent.emit()"
        (deleteSession)="deleteSessionEvent.emit($event)"
        (selectSession)="selectSessionEvent.emit($event)"
      />
    } @else {
      <!-- 对话详情视图 -->
      <div class="border-base-300 flex items-center gap-2 border-b px-3 py-1.5">
        <button class="btn btn-ghost btn-xs gap-1" (click)="backToList.emit()">
          <lucide-icon [img]="ArrowLeftIcon" size="14" />
          {{ t().ai.backToSessions }}
        </button>
        @if (selectedEntityName()) {
          <span class="badge badge-outline badge-sm">{{ selectedEntityName() }}</span>
        }
      </div>

      <!-- Diff 预览 -->
      @if (activeProposal()) {
        <lib-ai-diff-preview
          [proposal]="activeProposal()"
          (cancelPreview)="cancelProposal.emit()"
          (confirm)="confirmProposal.emit()"
        />
      }

      <!-- 消息列表 -->
      <lib-ai-message-list
        [isAborting]="isAborting()"
        [messages]="messages()"
        [operationState]="operationState()"
        [streamingCharCount]="streamingCharCount()"
      />

      <!-- 确认操作栏：钉在底部，有最大高度 -->
      @if (operationState() === 'previewing') {
        <div class="border-base-300 bg-base-200 max-h-2xl overflow-hidden border-t">
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

      <!-- 中断操作栏 -->
      @if (operationState() === 'interrupted') {
        <div class="border-base-300 bg-warning/10 flex flex-col gap-2 border-t p-3">
          <div class="text-warning flex items-center gap-2 text-sm">
            <lucide-icon [img]="AlertCircle" size="14" />
            <span>{{ t().ai.interrupted }} — {{ retainedEntityCount() }} {{ t().ai.retainedEntities }}</span>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-primary btn-sm flex-1" (click)="continueGeneration.emit()">
              {{ t().ai.continueGenerating }}
            </button>
            <button class="btn btn-ghost btn-sm flex-1" (click)="acceptPartial.emit()">
              {{ t().ai.acceptPartial }}
            </button>
            <button class="btn btn-error btn-sm flex-1" (click)="discardChanges.emit()">
              {{ t().ai.discard }}
            </button>
          </div>
        </div>
      }

      <!-- 输入区 -->
      <div class="border-base-300 border-t p-3">
        @if (hasError() && operationState() === 'idle') {
          <button class="btn btn-outline btn-sm mb-2 w-full gap-2" (click)="retryRequest.emit()">
            <lucide-icon [img]="RotateCcw" size="14" />
            {{ t().ai.retry }}
          </button>
        }
        <div class="flex items-end gap-2">
          <textarea
            class="textarea max-h-40 min-h-[32px] flex-1 resize-none text-sm"
            [disabled]="!canInput()"
            [placeholder]="chatMode() ? t().ai.chatPlaceholder : t().ai.inputPlaceholder"
            [value]="inputValue()"
            (input)="onInput($event)"
            (keydown.enter)="onEnterKey($event)"
            rows="1"
          ></textarea>
          @if (operationState() === 'generating') {
            <button class="btn btn-error btn-sm" [disabled]="isAborting()" (click)="onAbort()">
              @if (isAborting()) {
                <lucide-icon class="animate-spin" [img]="Loader2" size="16" />
              } @else {
                <lucide-icon [img]="StopIcon" size="16" />
              }
            </button>
          } @else {
            <button class="btn btn-primary btn-sm" [disabled]="!canSend()" (click)="onSend()">
              <lucide-icon [img]="Send" size="16" />
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [':host { display: flex; flex-direction: column; height: 100%; }']
})
export class AiChatPanelComponent {
  /** 中止请求进行中（本地乐观状态，直到 operationState 离开 generating） */
  readonly #isAborting = signal(false);

  readonly #textareaEl = signal<HTMLTextAreaElement | null>(null);

  protected readonly Send = Send;
  protected readonly Loader2 = Loader2;
  protected readonly AlertCircle = AlertCircle;
  protected readonly ArrowLeftIcon = ArrowLeft;
  protected readonly PlusIcon = Plus;
  protected readonly RotateCcw = RotateCcw;
  protected readonly StopIcon = Square;
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);

  /** 输入值 */
  protected readonly inputValue = signal('');

  /** 是否正在停止中（仅在 generating 状态下有意义） */
  protected readonly isAborting = computed(() => this.#isAborting() && this.operationState() === 'generating');

  /** 当前视图：列表 or 对话详情（由 activeSessionId 推导） */
  protected readonly currentView = computed(() => (this.activeSessionId() ? 'chat' : 'list'));

  /** 是否可以输入 */
  protected readonly canInput = computed(() => {
    if (this.isOffline()) return false;
    if (!this.canStartOperation()) return false;
    const state = this.operationState();
    // 停止请求进行中时允许提前输入下一条消息；previewing 时继续输入即为继续在当前分支编辑
    return state === 'idle' || state === 'previewing' || this.isAborting();
  });

  /** 阻塞消息 */
  protected readonly blockingMessage = computed(() => {
    if (this.isOffline()) return this.t().ai.offline;
    if (!this.canStartOperation()) return this.t().ai.pendingChanges;
    return '';
  });

  /** 是否可以发送（停止中不允许发送） */
  protected readonly canSend = computed(
    () => this.canInput() && this.inputValue().trim().length > 0 && !this.isAborting()
  );

  /** 消息列表 */
  readonly messages = input<ChatMessageItem[]>([]);

  /** AI 操作状态 */
  readonly operationState = input<AiOperationState>('idle');

  /** 是否可以启动 AI 操作 */
  readonly canStartOperation = input(true);

  /** 是否离线 */
  readonly isOffline = input(false);

  /** 是否为对话模式（区别于生成模式） */
  readonly chatMode = input(false);

  /** 会话列表 */
  readonly sessions = input<ChatSessionItem[]>([]);

  /** 当前活跃会话 ID */
  readonly activeSessionId = input<string>();

  /** 选中实体名称（注入上下文） */
  readonly selectedEntityName = input<string>();

  /** 当前待确认的变更提案 */
  readonly activeProposal = input<ChatChangeProposal>();

  /** 中断后保留的实体数量 */
  readonly retainedEntityCount = input(0);

  /** 是否有最近的错误（显示重试按钮） */
  readonly hasError = input(false);

  /** 流式传输已接收字符数 */
  readonly streamingCharCount = input(0);
  /** 分支列表（由编排器提供） */
  readonly branches = input<BranchItem[]>([{ id: 'main', parentId: null }]);

  /** 当前分支 ID */
  readonly currentBranchId = input('main');

  /** 当前分支对比结果（有偈则展示 BranchDiffView） */
  readonly branchDiff = input<BranchDiff | undefined>(undefined);
  /** 用户发送消息 */
  readonly sendMessage = output<string>();

  /** 确认合并 */
  readonly confirmMerge = output<void>();

  /** 丢弃变更 */
  readonly discardChanges = output<void>();

  /** 续传生成 */
  readonly continueGeneration = output<void>();

  /** 接受部分结果 */
  readonly acceptPartial = output<void>();

  /** 重试上次请求 */
  readonly retryRequest = output<void>();

  /** 切换会话 */
  readonly selectSessionEvent = output<string>();

  /** 创建会话 */
  readonly createSessionEvent = output<void>();

  /** 删除会话 */
  readonly deleteSessionEvent = output<string>();

  /** 确认变更提案 */
  readonly confirmProposal = output<void>();

  /** 取消变更提案 */
  readonly cancelProposal = output<void>();

  /** 中止生成 */
  readonly abortGeneration = output<void>();

  /** 返回会话列表 */
  readonly backToList = output<void>();
  /** 展示分支对比（含分支 ID） */
  readonly compareBranch = output<string>();
  protected onInput(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    this.#textareaEl.set(el);
    this.inputValue.set(el.value);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  protected onEnterKey(event: Event) {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey && this.canSend()) {
      event.preventDefault();
      this.onSend();
    }
  }

  protected onSend() {
    const value = this.inputValue().trim();
    if (!value) return;
    this.#isAborting.set(false);
    this.sendMessage.emit(value);
    this.inputValue.set('');
    const el = this.#textareaEl();
    if (el) el.style.height = 'auto';
  }

  protected onAbort() {
    this.#isAborting.set(true);
    this.abortGeneration.emit();
  }

  /** 切换到 main 分支 = 丢弃 AI 变更 */
  protected onBranchSwitch(branchId: string) {
    if (branchId === 'main') {
      this.discardChanges.emit();
    }
  }
}
