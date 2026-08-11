import { BroadcastTopic, createBroadcastTopic, LeaderElection } from '@aiao/utils';
import { Subscription } from 'rxjs';
import {
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  isCrossTabEvent,
  RxDBEvent
} from '../rxdb-events.js';
import {
  GATEWAY_MESSAGE_ENTITY_EVENT,
  GATEWAY_MESSAGE_FIRST_CONNECTED_AT,
  GATEWAY_MESSAGE_HELLO,
  GatewayMessage
} from './gateway.interface.js';

/**
 * 网关配置
 */
export interface RxDBTabsGatewayOptions {
  /** 数据库名称（作为频道名称前缀） */
  dbName: string;
  /** 客户端 ID */
  clientId: string;
}

/**
 * 事件派发回调
 */
type EventDispatcher = (event: RxDBEvent) => void;

/**
 * 事件监听器注册函数
 */
type EventListenerRegistrar = (type: string, listener: (event: RxDBEvent) => void) => void;

/**
 * 事件监听器移除函数
 */
type EventListenerRemover = (type: string, listener: (event: RxDBEvent) => void) => void;

/**
 * 校验 BroadcastChannel 收到的数据是否为合法网关消息。
 * 跨 tab 消息属于不可信输入，反序列化后可能是 null 或任意结构，
 * 必须先校验再分发，否则后续 `'entities' in event` 等操作会抛错。
 */
const isGatewayMessage = (value: unknown): value is GatewayMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return typeof msg['type'] === 'string' && typeof msg['clientId'] === 'string' && typeof msg['messageId'] === 'string';
};

/**
 * 校验跨 tab 传来的 event 是否为合法的 RxDBEvent 形状
 */
const isRxDBEventLike = (value: unknown): value is RxDBEvent =>
  typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';

const isolateBinaryViews = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value instanceof Uint8Array) return value.slice();
  if (typeof value !== 'object' || value === null || value instanceof Date || seen.has(value)) return value;

  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      value[index] = isolateBinaryViews(item, seen);
    });
    return value;
  }

  Object.keys(value).forEach(key => {
    Reflect.set(value, key, isolateBinaryViews(Reflect.get(value, key), seen));
  });
  return value;
};

const cloneGatewayEvent = (event: RxDBEvent): RxDBEvent => isolateBinaryViews(structuredClone(event)) as RxDBEvent;

/**
 * RxDB 多 Tab 网关
 *
 * 统一管理多 tab 之间的事件广播和元数据同步：
 * 1. 实体变更事件广播（CREATE/UPDATE/REMOVE）
 * 2. 首次连接时间同步（Leader 响应 Hello）
 *
 * 通过单一 BroadcastChannel 处理所有消息，使用 discriminated union 区分消息类型
 */
export class RxDBTabsGateway {
  /** 已处理 messageId 的去重窗口上限；超出后按接收顺序淘汰最旧的一条 */
  static readonly #MAX_SEEN_MESSAGE_IDS = 256;

  readonly #topic: BroadcastTopic<GatewayMessage>;
  readonly #leaderElection: LeaderElection;
  readonly #clientId: string;
  readonly #subscriptions: Subscription[] = [];
  readonly #seenMessageIds = new Set<string>();

  #removeEventListener?: EventListenerRemover;
  #forwardHandler?: (event: RxDBEvent) => void;

  #initialized = false;
  #destroyed = false;

  #isLeader = false;
  #firstConnectedAt?: Date;
  #messageCounter = 0;

  /**
   * 标记当前是否正在处理远程事件
   * 用于防止将接收到的远程事件再次广播出去
   */
  #processingRemoteEvent = false;

  /**
   * 获取首次连接时间
   */
  get firstConnectedAt(): Date | undefined {
    return this.#firstConnectedAt;
  }

  /**
   * 获取是否为 Leader
   */
  get isLeader(): boolean {
    return this.#isLeader;
  }

  constructor(options: RxDBTabsGatewayOptions) {
    this.#clientId = options.clientId;
    this.#topic = createBroadcastTopic<GatewayMessage>(`${options.dbName}_gateway`);
    this.#leaderElection = new LeaderElection(`${options.dbName}_leader`);
  }

  /**
   * 初始化网关
   *
   * @param dispatchEvent - 事件派发函数（用于将接收到的事件分发给本地）
   * @param addEventListener - 事件监听器注册函数（用于监听本地事件并广播）
   * @param removeEventListener - 事件监听器移除函数（destroy() 摘除本地转发监听器时使用，必填 ——
   *   缺失会导致 destroy() 永久漏摘监听器，残留监听器在 topic 被回收后再 emit 会抛错并冒泡到保存路径）
   */
  init(
    dispatchEvent: EventDispatcher,
    addEventListener: EventListenerRegistrar,
    removeEventListener: EventListenerRemover
  ): void {
    if (this.#destroyed) {
      throw new Error('RxDBTabsGateway 已被 destroy()，不能重新 init()，请创建新实例');
    }
    if (this.#initialized) {
      throw new Error('RxDBTabsGateway 已经 init() 过，不能重复调用');
    }
    if (typeof removeEventListener !== 'function') {
      throw new TypeError('RxDBTabsGateway.init() 缺少 removeEventListener，destroy() 将无法摘除本地事件转发监听器');
    }

    this.#initialized = true;
    this.#removeEventListener = removeEventListener;
    this.#setupMessageHandler(dispatchEvent);
    this.#setupLocalEventForwarding(addEventListener);
    this.#setupLeaderElection();
    this.#sendHello();
  }

  /**
   * 销毁网关，释放资源；幂等 —— 重复调用是安全的 no-op
   */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;

    this.#subscriptions.forEach(sub => sub.unsubscribe());
    // UTL-009：channel 的所有权不再绑在 observer 计数上（退订不再顺带 close），
    // 所以持有方必须显式关闭，否则 destroy() 之后 channel 泄漏。
    this.#topic.close();
    this.#subscriptions.length = 0;
    this.#leaderElection.dispose();

    if (this.#forwardHandler) {
      this.#removeEventListener?.(ENTITY_LOCAL_CREATE_EVENT, this.#forwardHandler);
      this.#removeEventListener?.(ENTITY_LOCAL_UPDATE_EVENT, this.#forwardHandler);
      this.#removeEventListener?.(ENTITY_LOCAL_REMOVE_EVENT, this.#forwardHandler);
    }
  }

  /**
   * 生成唯一消息 ID
   */
  #generateMessageId(): string {
    return `${this.#clientId}:${Date.now()}:${this.#messageCounter++}`;
  }

  /**
   * 判断 messageId 是否已处理过；首次见到时记入去重窗口。
   * 窗口按 Set 插入顺序 FIFO 淘汰，避免长会话下无界增长。
   */
  #isDuplicateMessage(messageId: string): boolean {
    if (this.#seenMessageIds.has(messageId)) return true;

    this.#seenMessageIds.add(messageId);
    if (this.#seenMessageIds.size > RxDBTabsGateway.#MAX_SEEN_MESSAGE_IDS) {
      const oldest = this.#seenMessageIds.values().next().value;
      if (oldest !== undefined) this.#seenMessageIds.delete(oldest);
    }
    return false;
  }

  /**
   * 广播实体事件
   * 只有本地产生的事件才会被广播，远程接收的事件不会再次广播
   */
  #broadcastEntityEvent(event: RxDBEvent): void {
    // 如果当前正在处理远程事件，则不广播（防止循环）
    if (this.#processingRemoteEvent) return;
    // 事务期间入队的远端事件，重放时已经脱离上面那个瞬时标志的覆盖范围，
    // 只能靠事件自身的 cross-tab 标记拦住 —— 否则会把别的 tab 的写入回灌给包括源 tab 在内的所有 tab
    if (isCrossTabEvent(event)) return;

    this.#topic.emit({
      type: GATEWAY_MESSAGE_ENTITY_EVENT,
      messageId: this.#generateMessageId(),
      clientId: this.#clientId,
      event
    });
  }

  /**
   * 发送 Hello 消息请求元数据
   */
  #sendHello(): void {
    this.#topic.emit({
      type: GATEWAY_MESSAGE_HELLO,
      messageId: this.#generateMessageId(),
      clientId: this.#clientId
    });
  }

  /**
   * 响应 Hello 消息，广播首次连接时间
   */
  #respondFirstConnectedAt(): void {
    if (!this.#firstConnectedAt) return;

    this.#topic.emit({
      type: GATEWAY_MESSAGE_FIRST_CONNECTED_AT,
      messageId: this.#generateMessageId(),
      clientId: this.#clientId,
      firstConnectedAt: this.#firstConnectedAt.toISOString()
    });
  }

  /**
   * 设置消息处理器
   */
  #setupMessageHandler(dispatchEvent: EventDispatcher): void {
    const sub = this.#topic.message$.subscribe(message => {
      // 跨 tab 消息为不可信输入，先做结构校验
      if (!isGatewayMessage(message)) return;
      // 忽略自己发出的消息
      if (message.clientId === this.#clientId) return;
      // 重叠订阅窗口（如生命周期交接期间）或上游重放可能重复投递同一条消息，
      // messageId 是 clientId:timestamp:counter 的全局唯一值，按此去重
      if (this.#isDuplicateMessage(message.messageId)) return;

      switch (message.type) {
        case GATEWAY_MESSAGE_ENTITY_EVENT:
          if (!isRxDBEventLike(message.event)) break;
          // 标记正在处理远程事件，防止 dispatchEvent 触发的监听器再次广播
          this.#processingRemoteEvent = true;
          try {
            dispatchEvent(this.#markEventAsCrossTab(message.event));
          } finally {
            this.#processingRemoteEvent = false;
          }
          break;

        case GATEWAY_MESSAGE_HELLO:
          // Leader 响应 Hello 请求
          if (this.#isLeader) {
            this.#respondFirstConnectedAt();
          }
          break;

        case GATEWAY_MESSAGE_FIRST_CONNECTED_AT:
          if (typeof message.firstConnectedAt !== 'string') break;
          this.#updateFirstConnectedAt(new Date(message.firstConnectedAt));
          break;
      }
    });

    this.#subscriptions.push(sub);
  }

  /**
   * 设置本地事件转发（监听本地事件并广播）
   */
  #setupLocalEventForwarding(addEventListener: EventListenerRegistrar): void {
    const forward = (event: RxDBEvent) => this.#broadcastEntityEvent(event);
    this.#forwardHandler = forward;

    addEventListener(ENTITY_LOCAL_CREATE_EVENT, forward);
    addEventListener(ENTITY_LOCAL_UPDATE_EVENT, forward);
    addEventListener(ENTITY_LOCAL_REMOVE_EVENT, forward);
  }

  /**
   * 设置 Leader 选举
   */
  #setupLeaderElection(): void {
    this.#leaderElection.elect(isLeader => {
      this.#isLeader = isLeader;
      if (!isLeader) return;

      // 成为 Leader 时，如果首次连接时间未设置，则设置为当前时间
      if (!this.#firstConnectedAt) {
        this.#updateFirstConnectedAt(new Date());
      }
      // 主动广播，确保其他 tab（可能在选举完成前发送了 Hello）能收到
      this.#respondFirstConnectedAt();
    });
  }

  #updateFirstConnectedAt(candidate: Date): void {
    if (Number.isNaN(candidate.getTime())) return;
    if (!this.#firstConnectedAt || candidate.getTime() < this.#firstConnectedAt.getTime()) {
      this.#firstConnectedAt = candidate;
    }
  }

  #markEventAsCrossTab(event: RxDBEvent): RxDBEvent {
    const clonedEvent = cloneGatewayEvent(event);
    if (!('entities' in clonedEvent) || !Array.isArray(clonedEvent.entities)) {
      return clonedEvent;
    }

    const entities = clonedEvent.entities.map(entity => ({ ...entity, origin: 'cross-tab' as const }));
    // BroadcastChannel 反序列化后，event.constructor 是 Object（不是原始类）。
    // 使用对象展开保留序列化后的 `type` 字段，不调用 new EventCtor()。
    return { ...clonedEvent, entities } as RxDBEvent;
  }
}
