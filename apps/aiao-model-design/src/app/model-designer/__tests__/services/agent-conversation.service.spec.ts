import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ChatSessionPersistedState } from '@trigger.dev/sdk/chat';
import type { UIMessage, UIMessageChunk } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleShop } from '../../../../../shared/model-ops/fixtures';
import type { ModelOp, ModelSnapshot } from '../../../../../shared/model-ops/types';
import { AGENT_GATEWAY, type AgentGateway } from '../../interfaces/designer.interface';
import {
  AgentConversationRepository,
  AgentModelStore,
  type AiBranchRecord,
  type ConversationRecord
} from '../../services/agent-conversation-repository';
import {
  AGENT_BRANCH_CONTROL,
  AgentConversationService,
  NEW_SESSION_NAME
} from '../../services/agent-conversation.service';
import {
  AGENT_TRANSPORT_FACTORY,
  type AgentTransport,
  type AgentTransportOptions
} from '../../services/agent-transport';
import { AiChatSessionService } from '../../services/ai-chat-session.service';
import { AiOperationGuardService } from '../../services/ai-operation-guard.service';
import { ModelDesignService } from '../../services/model-design.service';

const removeOrder: ModelOp[] = [{ op: 'removeEntity', entityId: 'e-order' }];

function streamOf(chunks: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk));
      controller.close();
    }
  });
}

function turn(messageId: string, ...parts: UIMessageChunk[][]): UIMessageChunk[] {
  return [
    { type: 'start', messageId },
    { type: 'start-step' },
    ...parts.flat(),
    { type: 'finish-step' },
    { type: 'finish' }
  ];
}

function toolOutput(toolCallId: string, toolName: string, output: unknown): UIMessageChunk[] {
  return [
    { type: 'tool-input-available', toolCallId, toolName, input: {} },
    { type: 'tool-output-available', toolCallId, output }
  ];
}

function text(value: string): UIMessageChunk[] {
  return [
    { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: value },
    { type: 'text-end', id: 'text' }
  ];
}

class FakeTransport implements AgentTransport {
  readonly clientData: Record<string, unknown>[] = [];
  readonly sends: UIMessage[][] = [];
  readonly responses: UIMessageChunk[][] = [];
  replay: UIMessageChunk[] | null = null;
  reconnects = 0;
  stops = 0;

  constructor(readonly options: AgentTransportOptions) {}

  setClientData(data: Record<string, unknown> | undefined): void {
    if (data) this.clientData.push(data);
  }

  async sendMessages(options: { messages: UIMessage[] }): Promise<ReadableStream<UIMessageChunk>> {
    this.sends.push(structuredClone(options.messages));
    return streamOf(this.responses.shift() ?? turn('empty'));
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    this.reconnects++;
    return this.replay ? streamOf(this.replay) : null;
  }

  async stopGeneration(): Promise<boolean> {
    this.stops++;
    return true;
  }

  getSession(): ChatSessionPersistedState {
    return { publicAccessToken: 'pat', lastEventId: `evt-${this.sends.length}`, isStreaming: false };
  }
}

class MemoryRepository {
  #count = 0;
  readonly rows = new Map<string, ConversationRecord>();
  readonly branches = new Map<string, AiBranchRecord>();

  async list(designId: string) {
    return [...this.rows.values()].filter(row => row.modelDesignId === designId).map(row => structuredClone(row));
  }

  async create(modelDesignId: string, name: string) {
    const record: ConversationRecord = {
      id: `conversation-${++this.#count}`,
      name,
      modelDesignId,
      messages: [],
      appliedToolCallIds: [],
      baseline: null,
      cursor: null,
      lastUsedAt: new Date(2026, 10, this.#count)
    };
    this.rows.set(record.id, structuredClone(record));
    return record;
  }

  async save(record: ConversationRecord) {
    this.rows.set(record.id, structuredClone(record));
  }

  async remove(id: string) {
    this.rows.delete(id);
  }

  async findBranch(branchId: string) {
    const record = this.branches.get(branchId);
    return record ? structuredClone(record) : null;
  }

  async saveBranch(record: AiBranchRecord) {
    this.branches.set(record.branchId, structuredClone(record));
  }

  async removeBranch(branchId: string) {
    this.branches.delete(branchId);
  }
}

describe('AgentConversationService', () => {
  let model: ModelSnapshot;
  let transports: FakeTransport[];
  let repository: MemoryRepository;
  let writes: ModelOp[][];
  let failWrite: Error | null;
  let branch: {
    forkAiBranch: ReturnType<typeof vi.fn>;
    mergeAiBranch: ReturnType<typeof vi.fn>;
    discardAiBranch: ReturnType<typeof vi.fn>;
    activeAiBranchId: ReturnType<typeof vi.fn>;
  };
  let gateway: AgentGateway;
  let legacyDelete: ReturnType<typeof vi.fn>;
  let activeDesign: WritableSignal<{ id: string }>;

  function setup(overrides: { gateway?: AgentGateway | null } = {}) {
    TestBed.configureTestingModule({
      providers: [
        AgentConversationService,
        AiOperationGuardService,
        { provide: AGENT_GATEWAY, useValue: overrides.gateway === undefined ? gateway : overrides.gateway },
        { provide: AgentConversationRepository, useValue: repository },
        {
          provide: AgentModelStore,
          useValue: {
            snapshot: async () => structuredClone(model),
            write: async (_designId: string, ops: ModelOp[]) => {
              if (failWrite) throw failWrite;
              writes.push(ops);
              const removed = new Set(ops.flatMap(op => (op.op === 'removeEntity' ? [op.entityId] : [])));
              const added = ops.flatMap(op =>
                op.op === 'addEntity' ? [{ ...op.entity, properties: [], relations: [], indexes: [] }] : []
              );
              model = { entities: [...model.entities.filter(entity => !removed.has(entity.id)), ...added] };
            }
          }
        },
        { provide: AGENT_BRANCH_CONTROL, useValue: branch },
        {
          provide: AGENT_TRANSPORT_FACTORY,
          useValue: (options: AgentTransportOptions) => transports[transports.push(new FakeTransport(options)) - 1]
        },
        { provide: ModelDesignService, useValue: { activeDesign } },
        {
          provide: AiChatSessionService,
          useValue: {
            sessionsOf: () => signal([{ id: 'legacy-1', name: '旧对话', lastUsedAt: '2026-01-01T00:00:00.000Z' }]),
            messagesOf: () => signal([{ id: 'm1', role: 'user', content: '旧消息' }]),
            deleteSession: legacyDelete
          }
        }
      ]
    });
    const service = TestBed.inject(AgentConversationService);
    TestBed.tick();
    return service;
  }

  async function ready(service: AgentConversationService) {
    await vi.waitFor(() => expect(service.availability().kind).not.toBe('loading'));
  }

  beforeEach(() => {
    model = sampleShop();
    transports = [];
    repository = new MemoryRepository();
    writes = [];
    failWrite = null;
    legacyDelete = vi.fn(async () => undefined);
    activeDesign = signal({ id: 'design-1' });
    branch = {
      forkAiBranch: vi.fn(async () => ({ branchId: 'ai-1', parentBranchId: 'main' })),
      mergeAiBranch: vi.fn(async () => undefined),
      discardAiBranch: vi.fn(async () => undefined),
      activeAiBranchId: vi.fn(async (): Promise<string | null> => null)
    };
    gateway = {
      config: async () => ({ enabled: true, apiUrl: 'https://trigger.example.com', task: 'model-designer' }),
      currentUserId: async () => 'user-1',
      session: async () => ({ publicAccessToken: 'pat' })
    };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it.each([
    ['没有注入网关', null, 'unconfigured'],
    ['Worker 未配置', { ...({} as AgentGateway), config: async () => ({ enabled: false }) }, 'unconfigured'],
    ['未登录', undefined, 'signed-out']
  ] as const)('%s时 AI 入口不可用', async (_name, override, expected) => {
    if (expected === 'signed-out') gateway.currentUserId = async () => null;
    const service = setup({ gateway: override === undefined ? gateway : (override as AgentGateway | null) });
    await ready(service);
    expect(service.notice()).toBe(expected);
  });

  it('网关报错时说明不可用', async () => {
    gateway.config = async () => {
      throw new Error('down');
    };
    const service = setup();
    await ready(service);
    expect(service.availability()).toEqual({ kind: 'unavailable', message: 'down' });
  });

  it('新会话连接本人的 chatId，发送时带上快照，工具输出写进 AI 分支并在轮末保存', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    const transport = transports[0];
    expect(transport.options).toMatchObject({
      apiUrl: 'https://trigger.example.com',
      task: 'model-designer',
      chatId: 'md-user-1-conversation-1'
    });
    transport.responses.push(
      turn(
        'a1',
        toolOutput('c1', 'remove_entities', { ok: true, ops: removeOrder, summary: '已删除实体 Order' }),
        text('好了。')
      )
    );

    await service.send('把订单删掉');

    expect(transport.clientData[0]).toEqual({ model: sampleShop(), edits: [] });
    await vi.waitFor(() => expect(repository.rows.get('conversation-1')?.baseline?.entities).toHaveLength(1));
    expect(writes).toEqual([removeOrder]);
    expect(branch.forkAiBranch).toHaveBeenCalledTimes(1);
    expect(service.operationState()).toBe('previewing');
    expect(service.sessionDiff()).toEqual({ added: [], modified: [], deleted: [{ type: 'entity', name: 'Order' }] });
    const saved = repository.rows.get('conversation-1');
    expect(saved).toMatchObject({
      name: '把订单删掉',
      appliedToolCallIds: ['c1'],
      cursor: { publicAccessToken: 'pat', lastEventId: 'evt-1' }
    });
    expect(saved?.cursor).not.toHaveProperty('isStreaming');
    expect(saved?.messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(service.messages().at(-1)).toMatchObject({ content: '好了。', tools: [{ id: 'c1', state: 'done' }] });
  });

  it('同一工具输出重复到达只写一次，写入后的差异来自 fork 时的快照', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    const output = toolOutput('c1', 'remove_entities', { ok: true, ops: removeOrder, summary: 'x' });
    transports[0].responses.push(turn('a1', output), turn('a2', output));
    await service.send('一');
    await service.send('二');
    await vi.waitFor(() => expect(repository.rows.get('conversation-1')?.messages).toHaveLength(4));
    expect(writes).toEqual([removeOrder]);
    expect(service.sessionDiff().deleted).toEqual([{ type: 'entity', name: 'Order' }]);
  });

  it('下一轮把用户在两轮之间的修改随快照发出', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    await service.send('先看看');
    await vi.waitFor(() => expect(repository.rows.get('conversation-1')?.baseline).not.toBeNull());
    model.entities[1].name = 'PurchaseOrder';
    await service.send('继续');
    expect(transports[0].clientData[1]).toMatchObject({ edits: ['实体 Order 改名为 PurchaseOrder'] });
  });

  it('丢弃 AI 分支后，下一轮把被丢弃的实体回读为用户移除', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    const addInvoice: ModelOp[] = [
      { op: 'addEntity', entity: { id: 'e-invoice', name: 'Invoice', displayName: null, entityNamespace: null } }
    ];
    transports[0].responses.push(
      turn('a1', toolOutput('c1', 'add_entities', { ok: true, ops: addInvoice, summary: 'x' }))
    );
    await service.send('加发票');
    await vi.waitFor(() => expect(repository.rows.get('conversation-1')?.baseline?.entities).toHaveLength(3));
    await service.discard();
    model = sampleShop();
    await service.send('继续');
    expect(transports[0].clientData[1]).toMatchObject({ edits: ['删除实体 Invoice'] });
  });

  it('刷新后待回答的提问仍可作答', async () => {
    await repository.create('design-1', '提问中');
    const persisted = repository.rows.get('conversation-1') as ConversationRecord;
    persisted.cursor = { publicAccessToken: 'pat', lastEventId: 'evt-1' };
    persisted.messages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: '加商品' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-ask_user',
            toolCallId: 'q1',
            state: 'input-available',
            input: {
              question: '怎么关联？',
              options: [
                { id: 'a', label: '直接' },
                { id: 'b', label: '经明细' }
              ]
            }
          }
        ] as UIMessage['parts']
      }
    ];
    const service = setup();
    await ready(service);
    await vi.waitFor(() => expect(service.sessions().map(item => item.id)).toContain('conversation-1'));
    service.selectSession('conversation-1');
    expect(service.awaitingAnswer()).toBe(true);
    expect(service.messages().at(-1)?.question).toMatchObject({ toolCallId: 'q1', answer: undefined });
    await vi.waitFor(() => expect(service.busy()).toBe(false));
    await service.answer('q1', { optionId: 'a', label: '直接' });
    expect(transports[0].sends).toHaveLength(1);
    expect(service.awaitingAnswer()).toBe(false);
  });

  it('连点选项时只提交一次：准备这一轮期间就算忙', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    transports[0].responses.push([
      { type: 'start', messageId: 'a1' },
      { type: 'start-step' },
      {
        type: 'tool-input-available',
        toolCallId: 'q1',
        toolName: 'ask_user',
        input: { question: '怎么关联？', options: [{ id: 'a', label: '直接' }] }
      },
      { type: 'finish-step' },
      { type: 'finish' }
    ]);
    await service.send('加商品');
    const first = service.answer('q1', { optionId: 'a', label: '直接' });
    expect(service.busy()).toBe(true);
    await Promise.all([first, service.answer('q1', { optionId: 'a', label: '直接' })]);
    expect(transports[0].sends).toHaveLength(2);
    expect(service.busy()).toBe(false);
  });

  it('连按两次发送只发出一条', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    await Promise.all([service.send('加商品'), service.send('加商品')]);
    expect(transports[0].sends).toHaveLength(1);
  });

  it('回答提问后回填工具结果并开始下一轮', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    transports[0].responses.push([
      { type: 'start', messageId: 'a1' },
      { type: 'start-step' },
      {
        type: 'tool-input-available',
        toolCallId: 'q1',
        toolName: 'ask_user',
        input: {
          question: '怎么关联？',
          options: [
            { id: 'a', label: '直接' },
            { id: 'b', label: '经明细' }
          ]
        }
      },
      { type: 'finish-step' },
      { type: 'finish' }
    ]);
    await service.send('加商品');
    expect(service.awaitingAnswer()).toBe(true);
    await service.send('被忽略');
    expect(transports[0].sends).toHaveLength(1);

    await service.answer('q1', { optionId: 'b', label: '经明细' });

    expect(transports[0].sends).toHaveLength(2);
    const lastPart = transports[0].sends[1].at(-1)?.parts.at(-1) as { state: string; output: unknown };
    expect(lastPart).toMatchObject({ state: 'output-available', output: { optionId: 'b', label: '经明细' } });
    expect(transports[0].clientData).toHaveLength(2);
    expect(service.awaitingAnswer()).toBe(false);
  });

  it('重新打开有游标的会话时续流，并补写之前没写入的工具输出', async () => {
    await repository.create('design-1', '旧轮');
    const persisted = repository.rows.get('conversation-1') as ConversationRecord;
    persisted.cursor = { publicAccessToken: 'pat', lastEventId: 'evt-3' };
    persisted.messages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: '删订单' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-remove_entities',
            toolCallId: 'c1',
            state: 'output-available',
            input: {},
            output: { ok: true, ops: removeOrder, summary: 'x' }
          }
        ] as UIMessage['parts']
      }
    ];
    const service = setup();
    await ready(service);
    await vi.waitFor(() => expect(service.sessions().map(item => item.id)).toContain('conversation-1'));
    service.selectSession('conversation-1');
    expect(transports[0].options.cursor).toEqual({ publicAccessToken: 'pat', lastEventId: 'evt-3' });
    await vi.waitFor(() => expect(writes).toEqual([removeOrder]));
    expect(transports[0].reconnects).toBe(1);
    service.backToList();
    service.selectSession('conversation-1');
    expect(transports).toHaveLength(1);
  });

  it('合并与丢弃 AI 分支', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    transports[0].responses.push(
      turn('a1', toolOutput('c1', 'remove_entities', { ok: true, ops: removeOrder, summary: 'x' }))
    );
    await service.send('删');
    await vi.waitFor(() => expect(service.currentBranchId()).toBe('ai-1'));
    await service.confirmMerge();
    expect(branch.mergeAiBranch).toHaveBeenCalledWith('ai-1', 'main');
    expect(service.operationState()).toBe('idle');
    await service.discard();
    expect(branch.discardAiBranch).not.toHaveBeenCalled();
  });

  it('丢弃时切回父分支', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    transports[0].responses.push(
      turn('a1', toolOutput('c1', 'remove_entities', { ok: true, ops: removeOrder, summary: 'x' }))
    );
    await service.send('删');
    await vi.waitFor(() => expect(service.currentBranchId()).toBe('ai-1'));
    await service.discard();
    expect(branch.discardAiBranch).toHaveBeenCalledWith('ai-1', 'main');
    expect(service.branches()).toEqual([{ id: 'main', parentId: null }]);
  });

  it('写入失败时记录原因，不会反复重试', async () => {
    failWrite = new Error('对象 e-order 不存在');
    const service = setup();
    await ready(service);
    await service.createSession();
    transports[0].responses.push(
      turn('a1', toolOutput('c1', 'remove_entities', { ok: true, ops: removeOrder, summary: 'x' }))
    );
    await service.send('删');
    await vi.waitFor(() => expect(service.error()).toBe('对象 e-order 不存在'));
    await vi.waitFor(() => expect(repository.rows.get('conversation-1')?.appliedToolCallIds).toEqual(['c1']));
  });

  it('发送前读不出快照时显示原因，不发送也不抛出', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    const store = TestBed.inject(AgentModelStore);
    store.snapshot = async () => {
      throw new Error('关系 Order.legacy 的取值 HAS_MANY 不受支持');
    };
    await service.send('继续');
    expect(service.error()).toBe('关系 Order.legacy 的取值 HAS_MANY 不受支持');
    expect(transports[0].sends).toHaveLength(0);
  });

  it('删除会话后，迟到的保存不会把它写回来', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    await service.deleteSession('conversation-1');
    transports[0].options.onSession({ publicAccessToken: 'late', lastEventId: 'evt-9' });
    await Promise.resolve();
    expect(repository.rows.size).toBe(0);
  });

  it('轮末读不出快照时显示原因，本轮对话与续流位置照样保存', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    const store = TestBed.inject(AgentModelStore);
    const read = store.snapshot.bind(store);
    let reads = 0;
    store.snapshot = async designId => {
      if (++reads > 1) throw new Error('读不出模型');
      return read(designId);
    };
    transports[0].responses.push(turn('a1', text('好的')));
    await service.send('你好');
    await vi.waitFor(() => expect(service.error()).toBe('读不出模型'));
    const saved = repository.rows.get('conversation-1');
    expect(saved?.messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(saved?.cursor).toEqual({ publicAccessToken: 'pat', lastEventId: 'evt-1' });
  });

  it('保存会话失败时显示原因', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    repository.save = async () => {
      throw new Error('磁盘已满');
    };
    await service.send('你好');
    await vi.waitFor(() => expect(service.error()).toBe('磁盘已满'));
  });

  it('读不出会话列表时显示原因，不留着上一个设计的会话', async () => {
    await repository.create('design-1', '上一个设计的会话');
    const service = setup();
    await ready(service);
    await vi.waitFor(() => expect(service.sessions().map(item => item.name)).toContain('上一个设计的会话'));
    repository.list = async () => {
      throw new Error('数据库未就绪');
    };
    activeDesign.set({ id: 'design-2' });
    TestBed.tick();
    await vi.waitFor(() => expect(service.error()).toBe('数据库未就绪'));
    expect(service.sessions().map(item => item.name)).not.toContain('上一个设计的会话');
  });

  it('停止失败时显示原因', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    transports[0].stopGeneration = async () => {
      throw new Error('网络断开');
    };
    await service.stop();
    expect(service.error()).toBe('网络断开');
  });

  it('合并失败时显示原因，AI 分支保留以便重试', async () => {
    branch.mergeAiBranch = vi.fn(async () => {
      throw new Error('分支已不存在');
    });
    const service = setup();
    await ready(service);
    await service.createSession();
    transports[0].responses.push(
      turn('a1', toolOutput('c1', 'remove_entities', { ok: true, ops: removeOrder, summary: 'x' }))
    );
    await service.send('删');
    await vi.waitFor(() => expect(service.currentBranchId()).toBe('ai-1'));
    await service.confirmMerge();
    expect(service.error()).toBe('分支已不存在');
    expect(service.currentBranchId()).toBe('ai-1');
  });

  it('fork 时记下 AI 分支与 fork 前的模型，合并后删掉这条记录', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    transports[0].responses.push(
      turn('a1', toolOutput('c1', 'remove_entities', { ok: true, ops: removeOrder, summary: 'x' }))
    );
    await service.send('删');
    await vi.waitFor(() => expect(repository.branches.get('ai-1')).toBeDefined());
    expect(repository.branches.get('ai-1')).toEqual({
      branchId: 'ai-1',
      parentBranchId: 'main',
      modelDesignId: 'design-1',
      forkBase: sampleShop()
    });
    await service.confirmMerge();
    expect(repository.branches.size).toBe(0);
  });

  it('刷新后数据库仍停在 AI 分支上时恢复预览，后续写入接着这条分支', async () => {
    const forkBase = sampleShop();
    model = { entities: forkBase.entities.filter(entity => entity.id !== 'e-order') };
    branch.activeAiBranchId.mockResolvedValue('ai-7');
    await repository.saveBranch({ branchId: 'ai-7', parentBranchId: 'main', modelDesignId: 'design-1', forkBase });
    const service = setup();
    await ready(service);
    await vi.waitFor(() => expect(service.currentBranchId()).toBe('ai-7'));
    expect(service.operationState()).toBe('previewing');
    expect(service.sessionDiff().deleted).toEqual([{ type: 'entity', name: 'Order' }]);
    expect(TestBed.inject(AiOperationGuardService).pendingBranchId()).toBe('design-1');
    await service.createSession();
    const addTag: ModelOp[] = [
      { op: 'addEntity', entity: { id: 'e-tag', name: 'Tag', displayName: null, entityNamespace: null } }
    ];
    transports[0].responses.push(turn('a1', toolOutput('c1', 'add_entities', { ok: true, ops: addTag, summary: 'x' })));
    await service.send('加标签');
    await vi.waitFor(() => expect(writes).toEqual([addTag]));
    expect(branch.forkAiBranch).not.toHaveBeenCalled();
    await service.confirmMerge();
    expect(branch.mergeAiBranch).toHaveBeenCalledWith('ai-7', 'main');
    expect(repository.branches.size).toBe(0);
  });

  it('停在 AI 分支上却找不到 fork 记录时说明原因，不恢复预览', async () => {
    branch.activeAiBranchId.mockResolvedValue('ai-9');
    const service = setup();
    await ready(service);
    await vi.waitFor(() => expect(service.error()).toContain('ai-9'));
    expect(service.currentBranchId()).toBeNull();
  });

  it('旧会话只读展示，删除走旧会话服务', async () => {
    const service = setup();
    await ready(service);
    expect(service.sessions().at(-1)).toMatchObject({ id: 'legacy-1', readOnly: true });
    service.selectSession('legacy-1');
    expect(service.readOnly()).toBe(true);
    expect(service.notice()).toBe('read-only');
    expect(service.messages()).toEqual([{ id: 'm1', role: 'user', content: '旧消息' }]);
    await service.send('不能发');
    expect(transports).toHaveLength(0);
    await service.deleteSession('legacy-1');
    expect(legacyDelete).toHaveBeenCalledWith('legacy-1');
    expect(service.activeSessionId()).toBeUndefined();
  });

  it('停止当前轮并删除会话', async () => {
    const service = setup();
    await ready(service);
    await service.createSession();
    await service.stop();
    expect(transports[0].stops).toBe(1);
    await service.deleteSession('conversation-1');
    expect(repository.rows.size).toBe(0);
    expect(service.sessions().map(item => item.id)).toEqual(['legacy-1']);
    expect(NEW_SESSION_NAME).toBe('新会话');
  });

  it('登录后重新确认可用状态并打开已选会话', async () => {
    gateway.currentUserId = async () => null;
    const service = setup();
    await ready(service);
    await repository.create('design-1', '待登录');
    gateway.currentUserId = async () => 'user-1';
    await service.refreshAvailability();
    expect(service.notice()).toBeNull();
  });
});
