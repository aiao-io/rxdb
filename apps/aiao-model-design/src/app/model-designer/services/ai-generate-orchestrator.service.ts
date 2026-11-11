import { RxDB } from '@aiao/rxdb';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { ChatMessageItem } from '../components/ai/ai-message.component';
import type { BranchItem } from '../components/ai/branch-manager.component';
import { AI_API_ADAPTER } from '../interfaces/designer.interface';
import type { AiEntityContext, ChatChangeProposal, ModelGenerationOutput } from '../types/ai-schemas';
import { AiBranchService, type BranchDiff } from './ai-branch.service';
import { AiChatApplyService } from './ai-chat-apply.service';
import { AiChatSessionService } from './ai-chat-session.service';
import { AiContextService } from './ai-context.service';
import { AiModelPopulateService } from './ai-model-populate.service';
import { AiOperationGuardService } from './ai-operation-guard.service';
import type { AiOperationState } from './ai-state.types';
import { parseChatChangeProposals } from './chat-change-parser';
import { DesignEntityService } from './design-entity.service';
import { DesignIndexService } from './design-index.service';
import { DesignPropertyService } from './design-property.service';
import { DesignRelationService } from './design-relation.service';
import { ModelDesignService } from './model-design.service';
import { StreamingEntityParser } from './streaming-entity-parser';

interface GenerationCompletionContext {
  parser: StreamingEntityParser;
  populateService: AiModelPopulateService;
  populateChain: Promise<void>;
  result: unknown;
  resolvedDesignId?: string;
  designId?: string;
  sessionId?: string;
}

/**
 * AI 模型生成编排服务
 *
 * 协调 AI 生成流程：guard → context → fork → stream → populate → confirm/discard。
 */
@Injectable()
export class AiGenerateOrchestratorService {
  readonly #guard = inject(AiOperationGuardService);
  readonly #apiAdapter = inject(AI_API_ADAPTER, { optional: true });
  readonly #chatSession = inject(AiChatSessionService);
  readonly #chatApply = inject(AiChatApplyService);
  readonly #modelDesign = inject(ModelDesignService);
  readonly #entityService = inject(DesignEntityService);
  readonly #propertyService = inject(DesignPropertyService);
  readonly #relationService = inject(DesignRelationService);
  readonly #indexService = inject(DesignIndexService);
  readonly #rxdb = inject(RxDB);
  readonly #aiBranch = new AiBranchService(inject(RxDB).versionManager);

  /** 当前 AI 子分支 ID */
  readonly #currentBranchId = signal<string | null>(null);

  /** 当前 AI 子分支的父分支 ID */
  readonly #parentBranchId = signal<string>('main');

  /** 当前会话积累的变更 diff（用于 BranchDiffView） */
  readonly #sessionDiff = signal<BranchDiff>({ added: [], modified: [], deleted: [] });

  /** 最近一次生成的原始 prompt（用于续传） */
  readonly #lastPrompt = signal<string>('');

  /** 流式解析中的部分实体（用于中断恢复） */
  readonly #partialEntities = signal<Partial<AiEntityContext>[]>([]);

  /** 中断后保留的完整实体（用于续传 existingModel） */
  readonly #retainedEntities = signal<AiEntityContext[]>([]);

  /** 当前流式传输已接收字符数（generating 期间递增，结束后归零） */
  readonly #streamingCharCount = signal(0);

  /** 当前对话请求，用于丢弃切换会话后的迟到回调 */
  #activeChatRequestId: number | null = null;
  #chatRequestSequence = 0;
  #sendInFlight = false;

  /** 当前 AI 子分支 ID（只读，供模板绑定） */
  readonly currentBranchId = this.#currentBranchId.asReadonly();

  /** 当前会话 diff（只读） */
  readonly sessionDiff = this.#sessionDiff.asReadonly();

  /** 分支列表：idle 时仅有 main，previewing 时展示 AI 子分支 */
  readonly branches = computed<BranchItem[]>(() => {
    const branchId = this.#currentBranchId();
    const state = this.operationState();
    if (!branchId || state === 'idle') return [{ id: 'main', parentId: null }];
    return [
      { id: 'main', parentId: null },
      { id: branchId, parentId: 'main' }
    ];
  });

  /** AI 操作状态 */
  readonly operationState = signal<AiOperationState>('idle');

  /** 对话消息列表 */
  readonly messages = signal<ChatMessageItem[]>([]);

  /** 是否为对话模式 */
  readonly chatMode = signal(false);

  /** 当前模型设计下的会话列表（响应式，由 RxDB 驱动） */
  readonly sessions = computed(() => {
    const design = this.#modelDesign.activeDesign();
    if (!design) return [];
    return this.#chatSession.sessionsOf(design.id)();
  });

  /** 当前活跃会话 ID */
  readonly activeSessionId = signal<string | undefined>(undefined);

  /** 当前待确认的变更提案 */
  readonly activeProposal = signal<ChatChangeProposal | undefined>(undefined);

  /** 中断后保留的实体数量 */
  readonly retainedEntityCount = signal(0);

  /** 流式解析中已完成的实体（仅展示，不保存） */
  readonly streamingEntities = signal<Record<string, unknown>[]>([]);

  /** 最近请求是否有错误（显示重试） */
  readonly hasError = signal(false);

  readonly streamingCharCount = this.#streamingCharCount.asReadonly();

  constructor() {
    effect(() => {
      const design = this.#modelDesign.activeDesign();
      if (design) {
        this.activeSessionId.set(undefined);
        this.messages.set([]);
      }
    });
    // 响应式同步 RxDB 消息：首次进入会话时 wa-sqlite 查询可能未就绪，
    // 通过追踪 messagesOf 信号，待数据到位后自动补全。
    effect(() => {
      const id = this.activeSessionId();
      if (!id) return;
      const dbMessages = this.#chatSession.messagesOf(id)();
      untracked(() => {
        if (this.operationState() === 'idle') {
          this.messages.set(dbMessages);
        }
      });
    });
  }

  /**
   * 统一发送入口——自动创建会话，根据 chatMode 分发到 generate 或对话式 chat
   */
  async send(prompt: string): Promise<void> {
    const value = prompt.trim();
    if (!value || this.#sendInFlight || this.operationState() === 'generating') return;

    this.#sendInFlight = true;
    try {
      if (!this.activeSessionId()) await this.createSession();
      if (!this.activeSessionId()) return;
      if (this.chatMode()) {
        await this.#chatSend(value);
      } else {
        await this.generate(value);
      }
    } finally {
      this.#sendInFlight = false;
    }
  }

  /**
   * 执行 AI 生成流程
   */
  async generate(prompt: string): Promise<void> {
    if (!this.#guard.canStartAiOperation()) return;
    if (!this.#apiAdapter) return;
    if (this.operationState() === 'generating') return;

    const design = this.#modelDesign.activeDesign();
    if (!design) return;

    const sessionId = this.activeSessionId();
    if (!sessionId) return;

    this.operationState.set('generating');
    this.messages.update(msgs => [
      ...msgs,
      { id: crypto.randomUUID(), role: 'user' as const, content: prompt, createdAt: new Date().toISOString() }
    ]);
    this.#lastPrompt.set(prompt);
    this.hasError.set(false);
    await this.#updateSessionName(prompt);
    await Promise.all([
      this.#chatSession.addMessage(sessionId, 'user', prompt),
      this.#chatSession.touchSession(sessionId)
    ]);

    const contextEntities = this.#buildFullEntityContext();
    const ctx = new AiContextService(contextEntities, this.#selectedEntityId()).buildGenerateContext();
    await this.#executeGenerate(ctx.entities ? ctx : undefined, design.id);
  }

  /**
   * 续传生成——重发原始 prompt，已生成实体注入 existingModel
   */
  async continueGeneration(): Promise<void> {
    if (!this.#apiAdapter) return;
    const retained = this.#retainedEntities();
    if (retained.length === 0) return;
    await this.#executeGenerate({ entityNames: retained.map(e => e.name), entities: retained });
  }

  /** 接受部分结果——进入 previewing 状态 */
  acceptPartial(): void {
    const design = this.#modelDesign.activeDesign();
    if (design) this.#guard.setPendingBranch(design.id);
    this.#retainedEntities.set([]);
    this.retainedEntityCount.set(0);
    this.operationState.set('previewing');
  }

  /** 丢弃中断结果——回到 idle */
  async discardInterrupted(): Promise<void> {
    const branchId = this.#currentBranchId();
    const parentBranchId = this.#parentBranchId();
    if (branchId) {
      await this.#aiBranch.discardAiBranch(branchId, parentBranchId);
    }
    this.#retainedEntities.set([]);
    this.retainedEntityCount.set(0);
    this.#partialEntities.set([]);
    this.#clearBranchState();
  }

  /** 确认合并 AI 生成结果 */
  async confirmMerge(): Promise<void> {
    const branchId = this.#currentBranchId();
    const parentBranchId = this.#parentBranchId();
    if (branchId) {
      await this.#aiBranch.mergeAiBranch(branchId, parentBranchId);
    }
    this.#clearBranchState();
  }

  /** 丢弃 AI 生成结果 */
  async discard(): Promise<void> {
    const branchId = this.#currentBranchId();
    const parentBranchId = this.#parentBranchId();
    if (branchId) {
      await this.#aiBranch.discardAiBranch(branchId, parentBranchId);
    }
    this.#clearBranchState();
  }

  selectSession(sessionId: string): void {
    this.#cancelChatRequest();
    this.activeSessionId.set(sessionId);
  }

  async createSession(): Promise<void> {
    const design = this.#modelDesign.activeDesign();
    if (!design) return;
    const session = await this.#chatSession.createSession(design.id, '新会话');
    this.activeSessionId.set(session.id);
    this.messages.set([]);
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (this.activeSessionId() === sessionId) this.#cancelChatRequest();
    await this.#chatSession.deleteSession(sessionId);
    if (this.activeSessionId() === sessionId) {
      this.activeSessionId.set(undefined);
      this.messages.set([]);
    }
  }

  /** 返回会话列表 */
  backToList(): void {
    this.#cancelChatRequest();
    this.activeSessionId.set(undefined);
    this.messages.set([]);
  }

  /** 确认对话变更提案并应用到当前 ModelDesign */
  async confirmProposal(): Promise<void> {
    const proposal = this.activeProposal();
    if (!proposal) return;
    await this.#chatApply.applyProposal(proposal);
    this.activeProposal.set(undefined);
  }

  /** 取消对话变更提案（不写入模型） */
  cancelProposal(): void {
    this.activeProposal.set(undefined);
  }

  /** 中止当前 AI 请求 */
  abort(): void {
    if (!this.#cancelChatRequest()) this.#apiAdapter?.abort();
  }

  /** 重试上次请求 */
  async retryLastRequest(): Promise<void> {
    this.hasError.set(false);
    const prompt = this.#lastPrompt();
    if (!prompt) return;
    await (this.chatMode() ? this.#chatSend(prompt) : this.generate(prompt));
  }

  async #executeGenerate(
    existingModel?: { entityNames: string[]; entities?: unknown[] },
    designId?: string
  ): Promise<void> {
    const apiAdapter = this.#apiAdapter;
    if (!apiAdapter) return;
    this.operationState.set('generating');
    this.#streamingCharCount.set(0);
    this.#partialEntities.set([]);

    const sessionId = this.activeSessionId();
    const resolvedDesignId = designId ?? this.#modelDesign.activeDesign()?.id;

    // 首次生成时 fork 真实 RxDB 分支；续传时复用现有分支，不重置 diff
    if (!this.#currentBranchId()) {
      const { branchId, parentBranchId } = await this.#aiBranch.forkAiBranch(resolvedDesignId ?? 'design');
      this.#currentBranchId.set(branchId);
      this.#parentBranchId.set(parentBranchId);
      this.#sessionDiff.set({ added: [], modified: [], deleted: [] });
    }
    const populateService = new AiModelPopulateService(
      this.#entityService,
      this.#propertyService,
      this.#relationService,
      this.#indexService,
      this.#rxdb.entityManager
    );

    // 跟踪已发起 shell 创建的 AI 实体 ID，避免重复写入
    const progressedEntityIds = new Set<string>();
    // 跟踪每个实体中已触发逐步创建的属性 AI UUID，避免重复写入
    const progressedPropertyIds = new Map<string, Set<string>>();
    // 顺序执行 populate 操作，避免并发读写信号冲突
    let populateChain = Promise.resolve<void>(undefined);
    const enqueuePopulate = (entities: AiEntityContext[]) => {
      populateChain = populateChain
        .then(() => populateService.populate(entities, resolvedDesignId))
        .catch(err => console.error('[stream] populate error:', err));
    };

    const parser = new StreamingEntityParser({
      onThinking: text => this.#upsertAssistantMessage(text),
      onEntityProgress: partial => {
        const name = partial['name'] as string | undefined;
        const id = partial['id'] as string | undefined;
        if (!name || !id) return;

        // 实体名首次出现时立即写入空 shell，让画布先展示节点
        if (!progressedEntityIds.has(id)) {
          progressedEntityIds.add(id);
          enqueuePopulate([
            {
              id,
              name,
              displayName: partial['displayName'] as string | undefined,
              properties: [],
              relations: [],
              indexes: []
            }
          ]);
        }

        // 逐步创建已完整解析的属性（在实体 closing `}` 到来之前提前写入）
        const rawProps = partial['properties'] as unknown[] | undefined;
        if (!Array.isArray(rawProps) || rawProps.length === 0) return;

        const enqueuedProps = progressedPropertyIds.get(id) ?? new Set<string>();
        progressedPropertyIds.set(id, enqueuedProps);

        const newProps = (rawProps as Record<string, unknown>[]).filter(prop => {
          const propId = prop['id'];
          if (typeof propId !== 'string' || enqueuedProps.has(propId)) return false;
          if (typeof prop['name'] !== 'string' || !prop['name']) return false;
          if (typeof prop['propertyType'] !== 'string') return false;
          // 三个布尔字段全部存在才视为完整
          if (typeof prop['isRequired'] !== 'boolean') return false;
          if (typeof prop['isNullable'] !== 'boolean') return false;
          if (typeof prop['isUnique'] !== 'boolean') return false;
          // defaultValue 键必须存在（null 也算）
          if (!('defaultValue' in prop)) return false;
          // enum 类型必须有非空 enumValues
          if (prop['propertyType'] === 'enum') {
            return Array.isArray(prop['enumValues']) && (prop['enumValues'] as unknown[]).length > 0;
          }
          return true;
        }) as AiEntityContext['properties'];

        if (newProps.length === 0) return;
        newProps.forEach(p => enqueuedProps.add(p.id));
        enqueuePopulate([
          {
            id,
            name,
            displayName: partial['displayName'] as string | undefined,
            properties: newProps,
            relations: [],
            indexes: []
          }
        ]);
      },
      onEntityComplete: entity => {
        // 实体完整后补充属性/关系/索引（populate 检测到已存在则走 update 路径，只追加属性）
        enqueuePopulate([entity as unknown as AiEntityContext]);
        this.#partialEntities.set(parser.getResult().entities as Partial<AiEntityContext>[]);

        // 积累 session diff（供 BranchDiffViewComponent 展示）
        const ent = entity as unknown as AiEntityContext;
        this.#sessionDiff.update(d => {
          const added = [...d.added, { type: 'entity', name: ent.name }];
          for (const prop of ent.properties ?? []) {
            added.push({ type: 'property', name: prop.name, entityId: ent.name });
          }
          for (const rel of ent.relations ?? []) {
            added.push({ type: 'relation', name: rel.name, entityId: ent.name });
          }
          return { ...d, added };
        });
      }
    });
    this.streamingEntities.set([]);

    let terminalAction = Promise.resolve();
    try {
      await apiAdapter.generate(this.#lastPrompt(), existingModel, {
        onTextChunk: (chunk: string) => {
          this.#streamingCharCount.update(n => n + chunk.length);
          parser.write(chunk);
        },
        onPartial: (partial: unknown) => {
          const gen = partial as Partial<ModelGenerationOutput>;
          if (gen.entities) this.#partialEntities.set([...gen.entities]);
          if (gen.thinking) this.#upsertAssistantMessage(gen.thinking);
        },
        onComplete: (result: unknown) => {
          terminalAction = this.#completeGeneration({
            parser,
            populateService,
            populateChain,
            result,
            resolvedDesignId,
            designId,
            sessionId
          });
          return terminalAction;
        },
        onError: error => {
          terminalAction = this.#finishGenerationError(parser, populateService, error.message, sessionId);
          return terminalAction;
        }
      });
      await terminalAction;
    } catch (error) {
      if (this.#currentBranchId()) await this.#discardGenerationBranch();
      throw error;
    }
  }

  /**
   * 对话式 chat 发送
   */
  async #chatSend(prompt: string): Promise<void> {
    if (!this.#guard.canStartAiOperation()) return;
    if (!this.#apiAdapter) return;
    if (this.#activeChatRequestId !== null || this.operationState() === 'generating') return;

    const sessionId = this.activeSessionId();
    if (!sessionId) return;

    const requestId = ++this.#chatRequestSequence;
    this.#activeChatRequestId = requestId;
    this.#streamingCharCount.set(0);
    this.hasError.set(false);
    this.activeProposal.set(undefined);
    this.operationState.set('generating');
    this.messages.update(msgs => [
      ...msgs,
      { id: crypto.randomUUID(), role: 'user' as const, content: prompt, createdAt: new Date().toISOString() }
    ]);

    try {
      await this.#updateSessionName(prompt);
      await Promise.all([
        this.#chatSession.addMessage(sessionId, 'user', prompt),
        this.#chatSession.touchSession(sessionId)
      ]);
      if (this.#activeChatRequestId !== requestId) return;

      const contextEntities = this.#buildFullEntityContext();
      const modelContext = new AiContextService(contextEntities, this.#selectedEntityId()).buildChatContext();

      // 构建滑动窗口消息（最近 30 条）
      const historyMessages = this.messages()
        .slice(-30)
        .map(m => ({ role: m.role, content: m.content }));

      await this.#apiAdapter.chat(historyMessages, modelContext, {
        onPartial: (text: string) => {
          if (this.#activeChatRequestId !== requestId) return;
          this.#streamingCharCount.set(text.length);
          this.#upsertAssistantMessage(text);
        },
        onComplete: async (fullText: string) => {
          if (this.#activeChatRequestId !== requestId) return;
          this.#upsertAssistantMessage(fullText, false);
          await Promise.all([
            this.#chatSession.addMessage(sessionId, 'assistant', fullText),
            this.#chatSession.touchSession(sessionId)
          ]);
          if (this.#activeChatRequestId !== requestId) return;
          this.operationState.set('idle');

          // 检测变更提案
          const proposals = parseChatChangeProposals(fullText);
          if (proposals.length > 0) {
            this.activeProposal.set(proposals[0]);
          }
        },
        onError: async error => {
          if (this.#activeChatRequestId !== requestId) return;
          if (error.message === 'AbortError') {
            this.operationState.set('idle');
            return;
          }
          this.#upsertAssistantMessage(`Error: ${error.message}`, false);
          this.hasError.set(true);
          this.operationState.set('idle');
          const errorMsg = this.messages().at(-1);
          if (errorMsg) await this.#chatSession.addMessage(sessionId, 'assistant', errorMsg.content);
        }
      });
    } catch {
      if (this.#activeChatRequestId === requestId) {
        this.#upsertAssistantMessage('Error: AI request failed', false);
        this.hasError.set(true);
        this.operationState.set('idle');
      }
    } finally {
      if (this.#activeChatRequestId === requestId) {
        this.#activeChatRequestId = null;
        this.#streamingCharCount.set(0);
      }
    }
  }

  async #completeGeneration(context: GenerationCompletionContext): Promise<void> {
    const { parser, populateService, populateChain, result, resolvedDesignId, designId, sessionId } = context;
    parser.end();
    const parsed = parser.getResult();
    if (parsed.thinking) this.#upsertAssistantMessage(parsed.thinking, false);
    this.#markAssistantMessageComplete();
    this.#partialEntities.set([]);
    this.#retainedEntities.set([]);
    this.retainedEntityCount.set(0);
    this.streamingEntities.set([]);

    await populateChain;
    const fallbackEntities =
      parsed.entities.length ?
        (parsed.entities as unknown as AiEntityContext[])
      : (result as ModelGenerationOutput)?.entities;
    if (fallbackEntities?.length) await populateService.populate(fallbackEntities, resolvedDesignId);

    const lastMsg = this.messages().at(-1);
    if (sessionId && lastMsg?.role === 'assistant') {
      await Promise.all([
        this.#chatSession.addMessage(sessionId, 'assistant', lastMsg.content),
        this.#chatSession.touchSession(sessionId)
      ]);
    }

    if (this.#sessionDiff().added.length === 0) {
      await this.#discardGenerationBranch();
      return;
    }

    this.operationState.set('previewing');
    if (designId) this.#guard.setPendingBranch(designId);
  }

  async #finishGenerationError(
    parser: StreamingEntityParser,
    populateService: AiModelPopulateService,
    errorMessage: string,
    sessionId?: string
  ): Promise<void> {
    parser.end();
    this.#markAssistantMessageComplete();
    this.streamingEntities.set([]);
    if (errorMessage === 'AbortError') {
      await this.#discardGenerationBranch();
      return;
    }
    const retainedCount = this.#handleInterruption(populateService, errorMessage, sessionId);
    if (retainedCount === 0) await this.#discardGenerationBranch();
  }

  #handleInterruption(populateService: AiModelPopulateService, errorMessage: string, sessionId?: string): number {
    const partial = this.#partialEntities();
    const retained = populateService.retainCompleteEntities(partial);
    this.#retainedEntities.set(retained);
    this.retainedEntityCount.set(retained.length);
    this.hasError.set(true);

    if (retained.length > 0) {
      this.#upsertAssistantMessage(`Interrupted — ${retained.length} entities retained`, false);
      this.operationState.set('interrupted');
    } else {
      this.#upsertAssistantMessage(`Error: ${errorMessage}`, false);
    }
    this.#partialEntities.set([]);
    const lastMsg = this.messages().at(-1);
    if (sessionId && lastMsg?.role === 'assistant') {
      this.#chatSession.addMessage(sessionId, 'assistant', lastMsg.content).catch(console.error);
    }
    return retained.length;
  }

  async #discardGenerationBranch(): Promise<void> {
    const branchId = this.#currentBranchId();
    if (branchId) await this.#aiBranch.discardAiBranch(branchId, this.#parentBranchId());
    this.#retainedEntities.set([]);
    this.retainedEntityCount.set(0);
    this.#partialEntities.set([]);
    this.streamingEntities.set([]);
    this.#clearBranchState();
  }

  #clearBranchState(): void {
    this.#guard.clearPendingBranch();
    this.#currentBranchId.set(null);
    this.#sessionDiff.set({ added: [], modified: [], deleted: [] });
    this.operationState.set('idle');
  }

  /** 构建完整实体上下文（含属性、关系、索引），所有对象携带 UUID */
  #buildFullEntityContext(): AiEntityContext[] {
    const entities = this.#entityService.entities();
    return entities.map(e => {
      const properties = this.#propertyService.propertiesOf(e.id)();
      const relations = this.#relationService.relationsOf(e.id)();
      const indexes = this.#indexService.indexesOf(e.id)();

      return {
        id: e.id,
        name: e.name,
        displayName: e.displayName ?? undefined,
        properties: properties.map(p => ({
          id: p.id,
          name: p.name,
          propertyType: p.propertyType,
          displayName: p.displayName ?? undefined,
          isRequired: p.isRequired,
          isNullable: p.isNullable,
          isUnique: p.isUnique,
          defaultValue: p.defaultValue ?? undefined,
          enumValues: p.enumValues ?? undefined
        })),
        relations: relations.map(r => ({
          id: r.id,
          name: r.name,
          relationKind: r.relationKind,
          mappedEntityId: r.mappedEntityId ?? '',
          mappedPropertyId: r.mappedPropertyId ?? undefined,
          onDeleteAction: r.onDeleteAction ?? undefined
        })),
        indexes: indexes.map(idx => ({
          id: idx.id,
          propertyIds: idx.propertyIds ?? [],
          isUnique: idx.isUnique
        }))
      };
    });
  }

  #selectedEntityId(): string | undefined {
    const selected = this.#entityService.selectedEntityIds();
    if (selected.size !== 1) return undefined;
    return [...selected][0];
  }

  #cancelChatRequest(): boolean {
    if (this.#activeChatRequestId === null) return false;
    this.#activeChatRequestId = null;
    this.#apiAdapter?.abort();
    this.#markAssistantMessageComplete();
    this.operationState.set('idle');
    this.#streamingCharCount.set(0);
    return true;
  }

  #markAssistantMessageComplete(): void {
    this.messages.update(msgs => {
      const last = msgs[msgs.length - 1];
      if (last?.role !== 'assistant' || !last.isStreaming) return msgs;
      return [...msgs.slice(0, -1), { ...last, isStreaming: false }];
    });
  }

  #upsertAssistantMessage(content: string, isStreaming = true): void {
    this.messages.update(msgs => {
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        return [...msgs.slice(0, -1), { ...last, content, isStreaming }];
      }
      return [
        ...msgs,
        {
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content,
          createdAt: new Date().toISOString(),
          isStreaming
        }
      ];
    });
  }

  /** 用第一条用户消息更新会话名称 */
  async #updateSessionName(prompt: string): Promise<void> {
    const sessionId = this.activeSessionId();
    if (!sessionId) return;
    const session = this.sessions().find(s => s.id === sessionId);
    if (session?.name !== '新会话') return;
    const name = prompt.slice(0, 30) + (prompt.length > 30 ? '...' : '');
    await this.#chatSession.renameSession(sessionId, name);
  }
}
