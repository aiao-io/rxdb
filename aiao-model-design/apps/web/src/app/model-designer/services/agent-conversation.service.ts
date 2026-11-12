import { Chat } from '@ai-sdk/angular';
import { describeChanges, diffSnapshots, hasModelOps, type ModelSnapshot } from '@aiao-model-design/model-ops';
import { RxDB } from '@aiao/rxdb';
import { computed, effect, inject, Injectable, InjectionToken, signal, untracked } from '@angular/core';
import type { ChatSessionPersistedState } from '@trigger.dev/sdk/chat';
import type { UIMessage } from 'ai';
import type { ChatSessionItem } from '../components/ai/ai-session-list.component';
import type { BranchItem } from '../components/ai/branch-manager.component';
import { AGENT_GATEWAY } from '../interfaces/designer.interface';
import { toBranchDiff } from './agent-branch-diff';
import { AgentConversationRepository, AgentModelStore, type ConversationRecord } from './agent-conversation-repository';
import {
  ASK_USER_TOOL,
  pendingQuestion,
  toChatItems,
  unappliedToolOutputs,
  type PendingToolOutput
} from './agent-messages';
import { AGENT_TRANSPORT_FACTORY, watchTransport, type AgentTransport } from './agent-transport';
import { AiBranchService, type BranchDiff } from './ai-branch.service';
import { AiChatSessionService } from './ai-chat-session.service';
import { AiOperationGuardService } from './ai-operation-guard.service';
import type { AiOperationState } from './ai-state.types';
import { ModelDesignService } from './model-design.service';

/** AI 写入只进 AI 分支；合并或丢弃由用户决定。 */
export type AgentBranchControl = Pick<
  AiBranchService,
  'forkAiBranch' | 'mergeAiBranch' | 'discardAiBranch' | 'activeAiBranchId'
>;

/** 分支控制注入令牌，默认绑定 RxDB 的版本管理。 */
export const AGENT_BRANCH_CONTROL = new InjectionToken<AgentBranchControl>('AGENT_BRANCH_CONTROL', {
  providedIn: 'root',
  factory: () => new AiBranchService(inject(RxDB).versionManager)
});

/** AI 入口的可用状态。 */
export type AgentAvailability =
  | { kind: 'loading' }
  | { kind: 'ready'; apiUrl: string; task: string; userId: string }
  | { kind: 'unconfigured' }
  | { kind: 'signed-out' }
  | { kind: 'unavailable'; message: string };

/** 面板上说明「为什么现在不能发送」的提示。 */
export type AgentNotice = 'loading' | 'unconfigured' | 'signed-out' | 'unavailable' | 'read-only' | null;

/** 新会话的默认名称，第一条消息发送后改成消息开头。 */
export const NEW_SESSION_NAME = '新会话';

interface OpenConversation {
  record: ConversationRecord;
  chatId: string;
  transport: AgentTransport;
  chat: Chat<UIMessage>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 只保存续流需要的字段；不存 `isStreaming`，由服务端判断这一轮是否还在进行。 */
function cursorOf(state: ChatSessionPersistedState | undefined | null): ChatSessionPersistedState | null {
  return state ? { publicAccessToken: state.publicAccessToken, lastEventId: state.lastEventId } : null;
}

/**
 * 设计器与建模智能体之间的持久会话。
 *
 * 每轮发送前把当前分支的模型快照与用户的手动修改放进元数据；工具输出里的操作按 `toolCallId`
 * 幂等写进 AI 分支（首次写入时 fork）；每轮结束后与流游标、回读基线一起保存到本地。
 */
@Injectable()
export class AgentConversationService {
  readonly #gateway = inject(AGENT_GATEWAY, { optional: true });
  readonly #store = inject(AgentModelStore);
  readonly #repository = inject(AgentConversationRepository);
  readonly #branch = inject(AGENT_BRANCH_CONTROL);
  readonly #createTransport = inject(AGENT_TRANSPORT_FACTORY);
  readonly #modelDesign = inject(ModelDesignService);
  readonly #legacy = inject(AiChatSessionService);
  readonly #guard = inject(AiOperationGuardService);

  readonly #availability = signal<AgentAvailability>({ kind: 'loading' });
  readonly #records = signal<ConversationRecord[]>([]);
  readonly #opened = new Map<string, OpenConversation>();
  readonly #active = signal<OpenConversation | null>(null);
  readonly #aiBranch = signal<{ branchId: string; parentBranchId: string } | null>(null);
  readonly #forkBase = signal<ModelSnapshot | null>(null);
  readonly #sessionDiff = signal<BranchDiff>({ added: [], modified: [], deleted: [] });
  readonly #error = signal<string | null>(null);
  /** 发送、回答、重试从点下去就算忙：准备这一轮（等写入队列、读快照）时连点也不会重复提交 */
  readonly #preparing = signal(false);
  #queue: Promise<void> = Promise.resolve();
  #loading: Promise<void> = Promise.resolve();
  /** 启动时恢复上次没处理完的 AI 分支；首次写入前要等它，免得在 AI 分支上再 fork 一层 */
  readonly #restoring: Promise<void>;
  readonly #record = computed(() => this.#records().find(record => record.id === this.activeSessionId()));

  /** 当前活跃会话 ID */
  readonly activeSessionId = signal<string | undefined>(undefined);
  readonly availability = this.#availability.asReadonly();
  /** 最近一次 AI 操作失败的原因：发送前构建快照失败，或写入 AI 分支失败 */
  readonly error = this.#error.asReadonly();
  readonly sessionDiff = this.#sessionDiff.asReadonly();

  /** 当前会话是迁移前的旧会话（只读） */
  readonly readOnly = computed(() => this.activeSessionId() !== undefined && this.#record() === undefined);
  readonly status = computed(() => this.#active()?.chat.status ?? 'ready');
  readonly busy = computed(() => this.#preparing() || this.status() === 'submitted' || this.status() === 'streaming');
  readonly hasError = computed(() => this.#active()?.chat.error !== undefined);
  /** 当前轮在等用户回答提问 */
  readonly awaitingAnswer = computed(() => pendingQuestion(this.#active()?.chat.messages ?? []) !== undefined);
  readonly currentBranchId = computed(() => this.#aiBranch()?.branchId ?? null);
  readonly operationState = computed<AiOperationState>(() => {
    if (this.busy()) return 'generating';
    return this.#aiBranch() ? 'previewing' : 'idle';
  });

  readonly branches = computed<BranchItem[]>(() => {
    const branch = this.#aiBranch();
    if (!branch) return [{ id: 'main', parentId: null }];
    return [
      { id: branch.parentBranchId, parentId: null },
      { id: branch.branchId, parentId: branch.parentBranchId }
    ];
  });

  readonly sessions = computed<ChatSessionItem[]>(() => {
    const designId = this.#modelDesign.activeDesign()?.id;
    const agent = this.#records().map(record => ({
      id: record.id,
      name: record.name,
      lastUsedAt: record.lastUsedAt.toISOString()
    }));
    const legacy =
      designId ?
        this.#legacy
          .sessionsOf(designId)()
          .map(item => ({ ...item, readOnly: true }))
      : [];
    return [...agent, ...legacy].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  });

  readonly messages = computed(() => {
    const active = this.#active();
    if (active) return toChatItems(active.chat.messages, active.chat.status);
    const record = this.#record();
    if (record) return toChatItems(record.messages, 'ready');
    const id = this.activeSessionId();
    return id ? this.#legacy.messagesOf(id)() : [];
  });

  readonly notice = computed<AgentNotice>(() => {
    if (this.readOnly()) return 'read-only';
    const availability = this.#availability().kind;
    return availability === 'ready' ? null : availability;
  });

  constructor() {
    effect(() => {
      const designId = this.#modelDesign.activeDesign()?.id;
      untracked(() => (this.#loading = this.#background(this.#loadRecords(designId))));
    });
    this.#restoring = this.#background(this.#restoreBranch());
    void this.refreshAvailability();
  }

  /** 重新确认 Worker 配置与登录状态。 */
  async refreshAvailability(): Promise<void> {
    this.#availability.set(await this.#resolveAvailability());
    const record = this.#record();
    if (record && !this.#active()) this.#open(record);
  }

  async createSession(): Promise<void> {
    await this.#loading;
    const designId = this.#modelDesign.activeDesign()?.id;
    if (!designId) return;
    await this.#guarded(async () => {
      const record = await this.#repository.create(designId, NEW_SESSION_NAME);
      this.#records.update(list => [record, ...list]);
      this.selectSession(record.id);
    });
  }

  selectSession(id: string): void {
    this.#active.set(null);
    this.activeSessionId.set(id);
    const record = this.#record();
    if (record) this.#open(record);
  }

  backToList(): void {
    this.#active.set(null);
    this.activeSessionId.set(undefined);
  }

  async deleteSession(id: string): Promise<void> {
    if (this.activeSessionId() === id) this.backToList();
    await this.#guarded(async () => {
      if (!this.#records().some(record => record.id === id)) return this.#legacy.deleteSession(id);
      const open = this.#opened.get(id);
      this.#opened.delete(id);
      if (open?.chat.status === 'streaming' || open?.chat.status === 'submitted') await open.chat.stop();
      await this.#repository.remove(id);
      this.#records.update(list => list.filter(record => record.id !== id));
    });
  }

  async send(text: string): Promise<void> {
    const active = this.#active();
    const value = text.trim();
    if (!active || !value || this.busy() || this.awaitingAnswer()) return;
    await this.#startTurn(async () => {
      await this.#prepareTurn(active);
      if (active.record.name === NEW_SESSION_NAME)
        active.record.name = value.length > 30 ? `${value.slice(0, 30)}…` : value;
      await active.chat.sendMessage({ text: value });
    });
  }

  /**
   * 回答智能体的提问并开始下一轮。
   *
   * 不用 AI SDK 的自动续轮：它对服务端执行的工具同样成立，一轮恰好以工具调用收尾时会反复重发。
   */
  async answer(toolCallId: string, option: { optionId: string; label: string }): Promise<void> {
    const active = this.#active();
    if (!active || this.busy()) return;
    await this.#startTurn(async () => {
      await this.#prepareTurn(active);
      await active.chat.addToolOutput({ tool: ASK_USER_TOOL, toolCallId, output: option });
      await active.chat.sendMessage();
    });
  }

  async stop(): Promise<void> {
    const active = this.#active();
    if (!active) return;
    await this.#guarded(async () => {
      await active.transport.stopGeneration(active.chatId);
      await active.chat.stop();
    });
  }

  async retry(): Promise<void> {
    const active = this.#active();
    if (!active || this.busy()) return;
    await this.#startTurn(async () => {
      await this.#prepareTurn(active);
      active.chat.clearError();
      await active.chat.regenerate();
    });
  }

  async confirmMerge(): Promise<void> {
    const branch = this.#aiBranch();
    if (!branch) return;
    await this.#guarded(async () => {
      await this.#queue;
      await this.#branch.mergeAiBranch(branch.branchId, branch.parentBranchId);
      this.#clearBranch();
      await this.#repository.removeBranch(branch.branchId);
    });
  }

  async discard(): Promise<void> {
    const branch = this.#aiBranch();
    if (!branch) return;
    await this.#guarded(async () => {
      await this.#queue;
      await this.#branch.discardAiBranch(branch.branchId, branch.parentBranchId);
      this.#clearBranch();
      await this.#repository.removeBranch(branch.branchId);
    });
  }

  async #resolveAvailability(): Promise<AgentAvailability> {
    if (!this.#gateway) return { kind: 'unconfigured' };
    try {
      const config = await this.#gateway.config();
      if (!config.enabled) return { kind: 'unconfigured' };
      const userId = await this.#gateway.currentUserId();
      return userId ? { kind: 'ready', apiUrl: config.apiUrl, task: config.task, userId } : { kind: 'signed-out' };
    } catch (error) {
      return { kind: 'unavailable', message: messageOf(error) };
    }
  }

  async #loadRecords(designId: string | undefined): Promise<void> {
    this.backToList();
    this.#records.set([]);
    if (designId) this.#records.set(await this.#repository.list(designId));
  }

  #open(record: ConversationRecord): void {
    const availability = this.#availability();
    if (availability.kind !== 'ready') return;
    const existing = this.#opened.get(record.id);
    if (existing) return this.#active.set(existing);
    const chatId = `md-${availability.userId}-${record.id}`;
    const open = { record, chatId } as OpenConversation;
    const base = this.#createTransport({
      apiUrl: availability.apiUrl,
      task: availability.task,
      chatId,
      cursor: record.cursor,
      token: async id => (await this.#session(id)).publicAccessToken,
      onSession: state => this.#firstCursor(open, state)
    });
    open.transport = watchTransport(base, {
      sent: messages => {
        open.record.messages = messages;
        void this.#background(this.#persist(open));
      },
      toolOutput: (toolCallId, output) => {
        if (hasModelOps(output)) this.#enqueue(open, [{ toolCallId, ops: output.ops }]);
      }
    });
    open.chat = new Chat<UIMessage>({
      id: chatId,
      messages: record.messages,
      transport: open.transport,
      onFinish: () => void this.#background(this.#afterTurn(open)),
      onError: () => void this.#background(this.#afterTurn(open))
    });
    this.#opened.set(record.id, open);
    this.#active.set(open);
    this.#enqueue(open, unappliedToolOutputs(record.messages, new Set(record.appliedToolCallIds)));
    if (record.cursor) void open.chat.resumeStream();
  }

  #session(chatId: string): Promise<{ publicAccessToken: string }> {
    if (!this.#gateway) throw new Error('Agent gateway is not provided');
    return this.#gateway.session(chatId);
  }

  /** 第一轮还没结束就刷新时，也要能从会话开头续流。 */
  #firstCursor(open: OpenConversation, state: ChatSessionPersistedState | null): void {
    if (open.record.cursor || !state) return;
    open.record.cursor = cursorOf(state);
    void this.#background(this.#persist(open));
  }

  async #prepareTurn(open: OpenConversation): Promise<void> {
    await this.#queue;
    const model = await this.#store.snapshot(open.record.modelDesignId);
    const edits = open.record.baseline ? describeChanges(diffSnapshots(open.record.baseline, model)) : [];
    open.transport.setClientData({ model, edits });
  }

  #enqueue(open: OpenConversation, outputs: PendingToolOutput[]): void {
    if (!outputs.length) return;
    this.#queue = this.#background(this.#queue.then(() => this.#apply(open, outputs)));
  }

  async #apply(open: OpenConversation, outputs: PendingToolOutput[]): Promise<void> {
    const applied = new Set(open.record.appliedToolCallIds);
    const fresh = outputs.filter(output => !applied.has(output.toolCallId));
    if (!fresh.length) return;
    const designId = open.record.modelDesignId;
    for (const output of fresh) {
      await this.#ensureBranch(designId);
      await this.#store.write(designId, output.ops).catch(error => this.#error.set(messageOf(error)));
      applied.add(output.toolCallId);
    }
    open.record.appliedToolCallIds = [...applied];
    await this.#persist(open);
    await this.#refreshDiff(designId);
  }

  async #refreshDiff(designId: string): Promise<void> {
    const base = this.#forkBase();
    if (base) this.#sessionDiff.set(toBranchDiff(diffSnapshots(base, await this.#store.snapshot(designId))));
  }

  /** 首次写入时 fork，并把分支与 fork 前的模型记下来，刷新页面后据此恢复。 */
  async #ensureBranch(designId: string): Promise<void> {
    await this.#restoring;
    if (this.#aiBranch()) return;
    const forkBase = await this.#store.snapshot(designId);
    const branch = await this.#branch.forkAiBranch(designId);
    this.#aiBranch.set(branch);
    this.#forkBase.set(forkBase);
    this.#guard.setPendingBranch(designId);
    await this.#repository.saveBranch({ ...branch, modelDesignId: designId, forkBase });
  }

  /** 刷新页面后数据库仍停在 AI 分支上：按 fork 记录恢复预览，后续写入接着这条分支。 */
  async #restoreBranch(): Promise<void> {
    const branchId = await this.#branch.activeAiBranchId();
    if (!branchId) return;
    const record = await this.#repository.findBranch(branchId);
    if (!record)
      throw new Error(`当前停在 AI 分支 ${branchId} 上，但找不到它的 fork 记录，请在版本管理里合并或删除这条分支`);
    this.#aiBranch.set({ branchId, parentBranchId: record.parentBranchId });
    this.#forkBase.set(record.forkBase);
    this.#guard.setPendingBranch(record.modelDesignId);
    await this.#refreshDiff(record.modelDesignId);
  }

  /** 先保存本轮对话与续流位置，再记下轮末的模型作为下一轮的基线；读模型失败不会丢掉本轮对话。 */
  async #afterTurn(open: OpenConversation): Promise<void> {
    await this.#queue;
    open.record.messages = open.chat.messages;
    open.record.cursor = cursorOf(open.transport.getSession(open.chatId)) ?? open.record.cursor;
    open.record.lastUsedAt = new Date();
    await this.#persist(open);
    open.record.baseline = await this.#store.snapshot(open.record.modelDesignId);
    await this.#persist(open);
  }

  /** 用户发起的操作：开始前清掉上一次的错误，失败时把原因显示在面板上。 */
  async #guarded(task: () => Promise<void>): Promise<void> {
    this.#error.set(null);
    await this.#background(task());
  }

  /** 开始一轮的操作（发送、回答、重试）：从调用起就算忙，结束（含失败）后才放开。 */
  async #startTurn(task: () => Promise<void>): Promise<void> {
    this.#preparing.set(true);
    await this.#guarded(task);
    this.#preparing.set(false);
  }

  /** 后台收尾（保存会话、写入工具输出、加载会话列表）失败时，同样把原因显示在面板上。 */
  #background(task: Promise<void>): Promise<void> {
    return task.catch(error => this.#error.set(messageOf(error)));
  }

  /** 会话被删除后，后台仍在收尾的那一轮不再写回。 */
  async #persist(open: OpenConversation): Promise<void> {
    if (!this.#opened.has(open.record.id)) return;
    await this.#repository.save(open.record);
    this.#records.update(list => list.map(record => (record.id === open.record.id ? { ...open.record } : record)));
  }

  #clearBranch(): void {
    this.#aiBranch.set(null);
    this.#forkBase.set(null);
    this.#sessionDiff.set({ added: [], modified: [], deleted: [] });
    this.#error.set(null);
    this.#guard.clearPendingBranch();
  }
}
