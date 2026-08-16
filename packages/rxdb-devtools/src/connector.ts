import type { EntityType, RxDB, RxDBEvent, RxDBEventMap } from '@aiao/rxdb';

import { EventBuffer } from './buffer.js';
import { SequenceGenerator } from './sequence.js';
import type { DevToolsProviderDescriptor } from './provider/descriptor.js';
import { createSystemClock } from './v2/clock.js';
import { createDevToolsConnectorEndpoint } from './v2/endpoint.js';
import type { DevToolsConnectorEndpoint, DevToolsProviderRegistry } from './v2/endpoint.js';
import type { DevToolsMutationPolicy } from './v2/authorization.js';
import type { DevToolsConnectorNegotiationMessage } from './v2/negotiation-connector.js';
import { maskEncryptedFields, serialize, serializeDevToolsValue } from './serializer.js';
import {
  createMessage,
  DEVTOOLS_PROTOCOL_VERSION,
  isDevToolsCommandMessage,
  isDevToolsMessage,
  RXDB_DEVTOOLS_MESSAGE,
  type AnyDevToolsMessage,
  type DevToolsCapability,
  type DevToolsCommandMessage,
  type DisconnectStatus,
  type QueryEntityPayload,
  type SerializedEvent
} from './types.js';

/**
 * DevTools 实际使用的 RxDB 能力子集。
 *
 * @remarks
 * 从 `@aiao/rxdb` 的 `RxDB` 上 `Pick` 而不是本包再抄一份鸭子接口：
 * 抄来的 `addEventListener(type: string, ...)` 和 callback-only 的 repository
 * 契约根本不等于真实泛型 API，于是三端 demo 全部被迫 `as any` 才能调 {@link DevToolsConnector.init}，
 * 而上游签名演进时本包不会有任何编译期信号。
 *
 * `@aiao/rxdb` 是 **peerDependency + type-only import**：类型在编译期擦除，
 * 不进运行时产物，也不给 devtools 的消费者增加安装拓扑负担。
 */
export type DevToolsRxDB = Pick<
  RxDB,
  | 'addEventListener'
  | 'removeEventListener'
  | 'disconnectAll'
  | 'getAdapter'
  | 'version'
  | 'config'
  | 'entityManager'
  | 'versionManager'
>;

/**
 * DevTools 实际读取的实体元数据子集。
 *
 * @remarks
 * 有意比上游 `EntityMetadata` 宽（`ReadonlyMap<string, unknown>` 而非
 * `Map<string, EntityPropertyMetadata>`）：连接器只取 `keys()` 当作加密字段名单，
 * 不碰值。真实 `EntityMetadata` 可赋值给本类型，该方向由
 * `rxdb-contract.spec.ts` 的编译契约守住。
 */
export interface DevToolsEntityMetadata {
  /** 实体名称。 */
  readonly name: string;
  /** 实体所属 namespace；省略时按 `'public'` 处理。 */
  readonly namespace?: string;
  /** 声明为加密列的字段名集合；只读取键。 */
  readonly encryptedPropertyMap?: ReadonlyMap<string, unknown>;
}

/**
 * 实体元数据读取函数。
 *
 * @remarks
 * 上游 `getEntityMetadata`（fail-fast，未装饰即抛）与 `tryGetEntityMetadata`
 * （返回 `undefined`）都满足本签名，由调用方决定要哪种语义。
 */
export type GetEntityMetadataFn = (entity: EntityType) => DevToolsEntityMetadata | undefined;

interface Subscription {
  unsubscribe(): void;
}

interface Subscribable<T> {
  subscribe(callback: (data: T) => void): Subscription;
}

/**
 * 事件在遮罩 / 序列化路径上的记录视图。
 *
 * @remarks
 * `RxDBEvent` 是一组类实例的联合，TS 不认为它可赋给带索引签名的记录类型。
 * 遮罩逻辑必须按字段名动态读写（`entities` / `conflicts` / `patch` …），
 * 所以这里做一次显式转换并收口在 {@link toEventRecord}，不散落到各处。
 */
type EventRecord = { type: string } & Record<string, unknown>;

const toEventRecord = (event: RxDBEvent): EventRecord => event as unknown as EventRecord;

/** RxDB DevTools 配置选项。 */
export interface DevToolsOptions {
  /**
   * 握手完成前缓存的事件条数上限，超出按 FIFO 丢弃最旧的。
   *
   * @defaultValue 100
   * @throws RangeError 构造时传入非正安全整数
   */
  maxBufferSize?: number;

  /**
   * 是否启用连接器。
   *
   * @defaultValue true
   * @remarks
   * `false` 时 {@link DevToolsConnector.init} 直接返回：不注册 message 监听、
   * 不订阅 RxDB 事件、不挂全局 helper。生产构建里关掉它即可完全消除
   * 「页面消息总线上出现实体数据」这条暴露面。
   */
  enabled?: boolean;

  /**
   * 授予 DevTools 的命令能力档。
   *
   * @defaultValue 'full'
   * @remarks
   * 默认 `'full'` 是为了不破坏已发布的扩展面板（它依赖 SWITCH/CREATE/DELETE_BRANCH）。
   * 生产环境应显式降到 `'readonly'` 或 `'none'` —— 页面消息总线对同源脚本完全开放，
   * 档位决定了伪造命令最多能做到什么。语义见 {@link DevToolsCapability}。
   */
  capabilities?: DevToolsCapability;

  /**
   * 是否允许在 opaque origin（`location.origin === 'null'`）下用 `'*'` 广播消息。
   *
   * @defaultValue false
   * @remarks
   * 连接器一律以 `location.origin` 为 `targetOrigin`。sandbox iframe、`data:`/`blob:`
   * 文档的 origin 是不透明的，`location.origin` 求值为字符串 `'null'`，
   * `postMessage(msg, 'null')` 会静默失败 —— 消息不到、也没有任何报错。
   *
   * 默认策略是**显式失败**：{@link DevToolsConnector.init} 打一次 warning 并保持停用，
   * 而不是偷偷退回 `'*'` 把消息广播给同页所有 frame。确实需要在 sandbox 里调试时，
   * 把本项设为 `true` 显式接受该风险。
   */
  allowOpaqueOrigin?: boolean;
}

const DEFAULT_OPTIONS: Required<DevToolsOptions> = {
  maxBufferSize: 100,
  enabled: true,
  capabilities: 'full',
  allowOpaqueOrigin: false
};

/**
 * 事件订阅清单：键穷尽 `RxDBEventMap`，值表示是否转发到 DevTools。
 *
 * @remarks
 * `satisfies Record<keyof RxDBEventMap, boolean>` 是这份清单的**编译期契约**：
 * 上游新增事件时本文件直接编译失败，而不是像手写字符串数组那样静默漏掉。
 * 此前漏掉的正是 `ENTITY_LOCAL_NEW`、`TRANSACTION_*` 与 `MERGE_BRANCH_*` 八项 ——
 * merge 失败「已部分应用、并未回滚」的诊断完全不到 DevTools。
 *
 * 一处有意排除，必须留在这里而不是"忘了写"：
 *
 * - `REMOTE_CHANGES_PENDING`：上游有这个常量但**不在 `RxDBEventMap` 里**，
 *   因此是结构性排除 —— 想加也加不进来，加了就编译不过。
 */
const RXDB_EVENT_SUBSCRIPTIONS = {
  ENTITY_LOCAL_NEW: true,
  ENTITY_LOCAL_CREATE: true,
  ENTITY_LOCAL_UPDATE: true,
  ENTITY_LOCAL_REMOVE: true,
  ENTITY_REMOTE_CREATE: true,
  ENTITY_REMOTE_UPDATE: true,
  ENTITY_REMOTE_REMOVE: true,
  TRANSACTION_BEGIN: true,
  TRANSACTION_COMMIT: true,
  TRANSACTION_ROLLBACK: true,
  SWITCH_BRANCH_BEGIN: true,
  SWITCH_BRANCH_COMMIT: true,
  SWITCH_BRANCH_ROLLBACK: true,
  MERGE_BRANCH_BEGIN: true,
  MERGE_BRANCH_COMMIT: true,
  MERGE_BRANCH_FAILED: true,
  SYNC_BEGIN: true,
  SYNC_COMPLETE: true,
  SYNC_ERROR: true,
  CONFLICT_DETECTED: true,
  CONFLICT_PENDING: true,
  REPOSITORY_SYNC_BEGIN: true,
  REPOSITORY_SYNC_COMPLETE: true,
  REPOSITORY_SYNC_ERROR: true
} as const satisfies Record<keyof RxDBEventMap, boolean>;

/** 实际订阅的事件类型（{@link RXDB_EVENT_SUBSCRIPTIONS} 中值为 `true` 的键）。 */
export const RXDB_EVENT_TYPES: readonly (keyof RxDBEventMap)[] = (
  Object.keys(RXDB_EVENT_SUBSCRIPTIONS) as (keyof RxDBEventMap)[]
).filter(type => RXDB_EVENT_SUBSCRIPTIONS[type]);

/**
 * 命令 → 所需最低能力档。
 *
 * @remarks
 * 键取自 {@link DevToolsCommandMessage}，新增命令不在这里登记就编译不过 ——
 * 避免出现"默认放行"的新命令。
 */
const COMMAND_REQUIRED_CAPABILITY = {
  HANDSHAKE_ACK: 'none',
  PING: 'none',
  CLEAR: 'none',
  DISCONNECT: 'none',
  INSPECT_DB: 'readonly',
  QUERY_ENTITY: 'readonly',
  GET_BRANCHES: 'readonly',
  DISCONNECT_RXDB: 'full',
  SWITCH_BRANCH: 'full',
  CREATE_BRANCH: 'full',
  DELETE_BRANCH: 'full'
} as const satisfies Record<DevToolsCommandMessage['type'], DevToolsCapability>;

const CAPABILITY_RANK: Record<DevToolsCapability, number> = { none: 0, readonly: 1, full: 2 };

/**
 * 页内 connector 宣告的 provider descriptor。
 *
 * @remarks
 * 空集是当前的**事实**而不是占位：本包不实现任何原生存储 provider，files / settings
 * 在页内根本不存在，database 的 v2 操作也还没有对着 RxDB 实现。
 * 由 US-904c / US-904d / US-905 各自接上真实 provider 后填充。
 */
const CONNECTOR_PROVIDER_DESCRIPTORS: readonly DevToolsProviderDescriptor[] = [];

/**
 * 页内 connector 的写入开关。
 *
 * @remarks
 * 硬编码为 `'omit'`，而不是开成一个选项：三层授权里 mutationPolicy 管的是「已声明的写操作
 * 要不要放行」，而本页宣告的 provider 集是空的，眼下没有任何写操作可管。开成选项等于让
 * 使用者去配一个当前不产生任何效果的开关，等 US-904c / US-904d / US-905 接上真实 provider
 * 时又得连同默认值一起重新想一遍。届时补上选项即可——默认停在 `'omit'`，
 * 意味着「接上 provider」这一步不会顺带把写路径也悄悄打开。
 */
const CONNECTOR_MUTATION_POLICY: DevToolsMutationPolicy = 'omit';

/**
 * 页内 connector 的 provider 接缝。
 *
 * @remarks
 * 空 descriptor 集让三层授权的第二层拦下每一个操作（`provider_unsupported`），因此
 * {@link DevToolsProviderRegistry.provider} 与 {@link DevToolsProviderRegistry.createChunkSink}
 * 在结构上不可达。两者因此**抛错**而不是返回一个「什么都不支持」的替身：替身会把一处接线
 * 错误变成一条看起来正常的协议应答，而这里需要的是它立刻炸出来。
 */
const CONNECTOR_PROVIDERS: DevToolsProviderRegistry = {
  descriptors: CONNECTOR_PROVIDER_DESCRIPTORS,
  provider: domain => {
    throw new Error(`no in-page devtools provider for domain "${domain}"`);
  },
  createChunkSink: name => {
    throw new Error(`no in-page devtools chunk sink for transfer "${name}"`);
  }
};

const OPAQUE_ORIGIN = 'null' as const;

const DEVTOOLS_GLOBAL_KEY = '__AIAO_RXDB_DEVTOOLS__' as const;
const EVENT_ENTITY_FIELDS = ['patch', 'inversePatch', 'data'] as const;
/** Conflict 里承载变更记录的两侧，各自形如 `IRxDBChange`（带 entity 与 patch/inversePatch）。 */
const CONFLICT_CHANGE_FIELDS = ['local', 'remote'] as const;
const QUERY_SUBSCRIPTION_TIMEOUT_MS = 10_000;

/**
 * `QUERY_ENTITY` 未指定 limit 时的取数上限。
 *
 * @remarks
 * 上游 `Repository.find` 的默认 limit 是 100，对"翻一眼这张表"太小；
 * 但 `assertPageBound` 只拒负数和非安全整数、**没有上限**，
 * 所以这里必须自己定一个 —— 否则一张百万行的表会被整个序列化成 postMessage 载荷。
 * 协议层的 `isQueryEntityPayload` 用同一个数值作为显式 limit 的上界。
 */
const DEFAULT_QUERY_LIMIT = 1000;

/** 分支表的取数上限：分支是人手工建的，量级远小于业务表。 */
const BRANCH_QUERY_LIMIT = 1000;

/** 上游分支实体的注册名（`@aiao/rxdb` 的 `RxDBBranch`）。 */
const BRANCH_ENTITY_NAME = 'RxDBBranch' as const;

/**
 * 实体身份的复合 key。
 *
 * @remarks
 * 上游以 `namespace:name` 唯一标识实体（`SchemaManager` 明确允许不同 namespace 下重名）。
 * 只用 `name` 建索引会后写覆盖前写：查询落到错误 namespace 的仓库，事件遮罩套用
 * 另一个 namespace 的加密字段集 —— 该遮的留明文，不该遮的被遮。
 */
const entityKey = (namespace: string, name: string): string => `${namespace}:${name}`;

const metadataKeyFromConflictKey = (conflictKey: unknown): string | undefined => {
  if (typeof conflictKey !== 'string') return undefined;
  const [namespace, name] = conflictKey.split(':', 2);
  return namespace && name ? entityKey(namespace, name) : undefined;
};

type DisconnectResult = { success: boolean; error: string | null; status: DisconnectStatus };
type ForceReleaseResult = { success: boolean; error: string | null };

type EntityInfo = {
  name: string;
  namespace: string;
  encryptedFields: string[];
  entityType: EntityType;
};

interface SubscribeOnceOptions {
  timeoutMs?: number;
  register?: (handle: Subscription) => void;
  unregister?: (handle: Subscription) => void;
}

function subscribeOnce<T>(
  observable: Subscribable<T>,
  callback: (value: T) => void,
  errorCallback: (error: unknown) => void,
  options: SubscribeOnceOptions = {}
): void {
  let subscription: Subscription | null = null;
  let unsubscribeAfterSubscribe = false;
  let handled = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const settle = (): void => {
    handled = true;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    options.unregister?.(handle);
  };

  const handle: Subscription = {
    unsubscribe(): void {
      if (handled) return;
      settle();
      subscription?.unsubscribe();
    }
  };

  const next = (value: T): void => {
    if (handled) return;
    settle();
    callback(value);

    if (subscription) {
      subscription.unsubscribe();
      return;
    }
    unsubscribeAfterSubscribe = true;
  };

  const error = (cause: unknown): void => {
    if (handled) return;
    settle();
    errorCallback(cause);
    subscription?.unsubscribe();
  };

  if (options.timeoutMs !== undefined) {
    timeoutId = setTimeout(() => {
      if (handled) return;
      settle();
      subscription?.unsubscribe();
      errorCallback(new Error(`query timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);
  }

  // subscribe() 可能同步抛错。timer 在它之前就建好了，不接住的话：定时器泄漏，
  // 且调用方要等满超时才收到一条误导性的 "timed out" —— 真实原因被上层 catch 吞掉。
  // 走 error() 统一收口：它会 settle()（清 timer）并把真实 cause 报出去（RDT-019）
  try {
    if (typeof (observable as { pipe?: unknown }).pipe === 'function') {
      subscription = (
        observable as unknown as { subscribe(observer: { next: typeof next; error: typeof error }): Subscription }
      ).subscribe({
        next,
        error
      });
    } else {
      subscription = observable.subscribe(next);
    }
  } catch (cause) {
    error(cause);
    return;
  }
  if (unsubscribeAfterSubscribe) {
    subscription.unsubscribe();
    return;
  }
  if (!handled) options.register?.(handle);
}

function getDocumentId(document: unknown): unknown {
  try {
    return isRecord(document) ? document['id'] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 把查询结果文档转成 wire 值。
 *
 * @remarks
 * 与事件路径共用同一个 serializer，因此环引用、BigInt、Map/Set、嵌套 Date
 * 的降级语义**逐字段一致**：只有成环的那个节点变成 `'[Circular]'`，同级字段照常保留。
 *
 * 曾经这里额外做一次 `hasCircularReference` 全树预检，命中就把整条文档换成
 * `{ id, _error }` —— 一个自引用的 `parent` 字段就能让整行数据在 DevTools 里消失。
 * 现在只有 `toJSON()` 自己抛错（文档根本读不出来）才走结构化错误占位。
 */
function serializeDocument(document: unknown, mask: (value: unknown) => unknown): unknown {
  try {
    const value =
      document && typeof document === 'object' && 'toJSON' in document ?
        (document as { toJSON(): unknown }).toJSON()
      : document;
    return serializeDevToolsValue(mask(value));
  } catch {
    return serializeDevToolsValue({ id: getDocumentId(document), _error: 'Cannot serialize' });
  }
}

/**
 * 取错误的可读描述，保证非空。
 *
 * @remarks
 * 非空是协议要求：`DISCONNECT_RXDB_RESULT` 的 `status: 'failed'` 必须配非空 `error`
 * （见 `isDisconnectResultPayload` 的语义矩阵）。`new Error('')` 的 `message` 是空串，
 * 直接透出去会让本包自己的 guard 拒掉自己发的消息。
 */
function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 0 ? message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 结构性识别 `Worker`：`instanceof Worker` 在 worker / Node 宿主里会直接 ReferenceError。 */
function isTerminable(value: unknown): value is { terminate(): void } {
  return isRecord(value) && typeof value['terminate'] === 'function';
}

/** 结构性识别 `SharedWorker`：只关心能不能关掉它的 port。 */
function isClosablePortHolder(value: unknown): value is { port: { close(): void } } {
  if (!isRecord(value)) return false;
  const port = value['port'];
  return isRecord(port) && typeof port['close'] === 'function';
}

/**
 * RxDB DevTools 连接器。
 *
 * 当前协议只支持一个 RxDB 实例；同实例重复初始化是幂等操作。
 */
export class DevToolsConnector {
  #options: Required<DevToolsOptions>;
  #connected = false;
  #buffer: EventBuffer;
  #sequence: SequenceGenerator;
  #rxdbInstance: DevToolsRxDB | null = null;
  #eventListeners: Map<keyof RxDBEventMap, (event: RxDBEvent) => void> = new Map();
  #messageHandler: ((event: MessageEvent) => void) | null = null;
  #endpoint: DevToolsConnectorEndpoint | null = null;
  #hasEntityMetadata = false;
  #entityInfo: EntityInfo[] = [];
  #entityTypeMap: Map<string, EntityType> = new Map();
  #encryptedFieldsMap: Map<string, string[]> = new Map();
  #pendingSubscriptions: Set<Subscription> = new Set();
  #branchQueryInFlight = false;
  #disconnectInFlight: Promise<DisconnectResult> | null = null;
  #opaqueOriginWarned = false;

  /**
   * DevTools 是否已确认握手。
   *
   * @remarks
   * `false` 时事件进 buffer 而不是发到消息总线；收到 `HANDSHAKE_ACK` 后
   * buffer 会一次性冲出。{@link disconnect} 与 `DISCONNECT` 命令都会把它置回 `false`。
   */
  get connected(): boolean {
    return this.#connected;
  }

  /**
   * 连接器是否启用。
   *
   * @remarks
   * 构造时由 {@link DevToolsOptions.enabled} 决定；opaque origin 下未显式开启
   * {@link DevToolsOptions.allowOpaqueOrigin} 时，{@link init} 会把它降为 `false`。
   */
  get enabled(): boolean {
    return this.#options.enabled;
  }

  /**
   * 本页授予 DevTools 的命令能力档。
   *
   * @remarks
   * 语义见 {@link DevToolsCapability}；握手时随 payload 一并告知 DevTools。
   */
  get capabilities(): DevToolsCapability {
    return this.#options.capabilities;
  }

  /**
   * @param options - 连接器配置，缺省项见 {@link DevToolsOptions} 各成员的 `@defaultValue`
   * @throws RangeError 当 `options.maxBufferSize` 不是正安全整数时（由 `EventBuffer` 抛出）
   */
  constructor(options: DevToolsOptions = {}) {
    this.#options = { ...DEFAULT_OPTIONS, ...options };
    this.#buffer = new EventBuffer(this.#options.maxBufferSize);
    this.#sequence = new SequenceGenerator();
  }

  /**
   * 初始化连接器并注册唯一的 RxDB 实例。
   *
   * @param rxdb - 要观测的 RxDB 实例；`@aiao/rxdb` 的 `RxDB` 可直接传入，无需断言
   * @param getEntityMetadata - 实体元数据读取函数（通常是 `@aiao/rxdb` 的
   *   `getEntityMetadata`）。省略时连接器不知道任何实体，`INSPECT_DB` 回 `null`、
   *   `QUERY_ENTITY` 回"实体不存在"，且**加密字段不会被遮罩**（无从得知哪些字段是密文）
   * @throws Error 当已注册了另一个 RxDB 实例时；同实例重复调用是幂等的
   * @throws 由 `getEntityMetadata` 透传 —— 上游 `getEntityMetadata` 对未装饰的类 fail-fast
   *
   * @remarks
   * `enabled === false`、非浏览器环境（`window === undefined`）时直接返回，
   * 不注册任何监听。opaque origin 且未开启 {@link DevToolsOptions.allowOpaqueOrigin}
   * 时打一次 warning 并把连接器降为停用 —— 详见 {@link DevToolsOptions.allowOpaqueOrigin}。
   *
   * 副作用：注册 `window` 的 message 监听、订阅 {@link RXDB_EVENT_TYPES} 全部事件、
   * 在 `window.__AIAO_RXDB_DEVTOOLS__` 上挂断开 helper、并立刻发出一次握手。
   * 全部由 {@link disconnect} 撤销。
   */
  init(rxdb: DevToolsRxDB, getEntityMetadata?: GetEntityMetadataFn): void {
    if (!this.#options.enabled || typeof window === 'undefined') return;
    if (!this.#assertUsableOrigin()) return;
    if (this.#rxdbInstance === rxdb) return;
    if (this.#rxdbInstance) {
      throw new Error('DevToolsConnector supports a single RxDB instance');
    }

    const entityInfo = getEntityMetadata ? this.#collectEntityInfo(rxdb, getEntityMetadata) : [];
    this.#rxdbInstance = rxdb;
    this.#hasEntityMetadata = getEntityMetadata !== undefined;
    this.#setEntityInfo(entityInfo);
    this.#setupMessageListener();
    this.#startNegotiation();
    this.#syncGlobalHelper();
    this.#subscribeToEvents(rxdb);
  }

  /**
   * 断开 connector 通信并清理本地监听。
   *
   * @remarks
   * **不会**调用 `RxDB.disconnectAll()` —— 那是 `DISCONNECT_RXDB` 命令的职责。
   * 本方法只撤销 {@link init} 的副作用：发一条 `DISCONNECT`、摘掉 message 监听与
   * 全部事件监听、取消在途查询订阅、删掉全局 helper、清空 buffer 并把 sequence 归零。
   * 调用后可以再次 {@link init}（sequence 从 0 重新开始，属于新会话）。
   */
  disconnect(): void {
    if (typeof window === 'undefined') return;

    this.#postMessage(createMessage('DISCONNECT', 'page-to-devtools', null, this.#sequence.next()));
    if (this.#messageHandler) {
      window.removeEventListener('message', this.#messageHandler);
      this.#messageHandler = null;
    }
    if (this.#rxdbInstance) this.#unsubscribeFromEvents(this.#rxdbInstance);
    this.#endpoint?.dispose();
    this.#endpoint = null;

    this.#rxdbInstance = null;
    this.#clearEntityInfo();
    this.#clearPendingSubscriptions();
    this.#syncGlobalHelper();
    this.#connected = false;
    this.#buffer.clear();
    this.#sequence.reset();
  }

  /**
   * opaque origin 下的显式策略：要么被显式允许，要么停用并 warn 一次。
   *
   * @returns 可以继续初始化时为 `true`
   */
  #assertUsableOrigin(): boolean {
    if (location.origin !== OPAQUE_ORIGIN || this.#options.allowOpaqueOrigin) return true;

    this.#options = { ...this.#options, enabled: false };
    if (!this.#opaqueOriginWarned) {
      this.#opaqueOriginWarned = true;
      console.warn(
        `[${RXDB_DEVTOOLS_MESSAGE}] 当前文档处于 opaque origin（location.origin === 'null'），` +
          `以它为 targetOrigin 的 postMessage 会静默失败，连接器已停用。` +
          `确需在此环境调试请显式设置 DevToolsOptions.allowOpaqueOrigin = true（消息将以 '*' 广播）。`
      );
    }
    return false;
  }

  #clearPendingSubscriptions(): void {
    for (const subscription of this.#pendingSubscriptions) subscription.unsubscribe();
    this.#pendingSubscriptions.clear();
    this.#branchQueryInFlight = false;
  }

  #collectEntityInfo(rxdb: DevToolsRxDB, getEntityMetadata: GetEntityMetadataFn): EntityInfo[] {
    const entityInfo: EntityInfo[] = [];
    for (const entityType of rxdb.config.entities) {
      const metadata = getEntityMetadata(entityType);
      if (!metadata?.name) continue;
      entityInfo.push({
        name: metadata.name,
        namespace: metadata.namespace || 'public',
        encryptedFields: metadata.encryptedPropertyMap ? [...metadata.encryptedPropertyMap.keys()] : [],
        entityType
      });
    }
    return entityInfo;
  }

  #setEntityInfo(entityInfo: EntityInfo[]): void {
    this.#entityInfo = entityInfo;
    // 以 `namespace:name` 为 key：上游允许不同 namespace 下实体重名，
    // 用裸 name 建 key 会后写覆盖前写 —— 查询落到错误 namespace 的仓库，
    // 事件遮罩也会套用另一个 namespace 的加密字段集（明文泄漏）。
    this.#entityTypeMap = new Map(entityInfo.map(info => [entityKey(info.namespace, info.name), info.entityType]));
    this.#encryptedFieldsMap = new Map(
      entityInfo.map(info => [entityKey(info.namespace, info.name), info.encryptedFields])
    );
  }

  /**
   * 按名称（可选 namespace）解析实体身份。
   *
   * @returns 命中时返回复合 key；名称存在歧义且未指定 namespace 时返回 `{ ambiguous: true }`
   */
  #resolveEntityKey(entityName: string, namespace?: string): { key?: string; ambiguous?: boolean } {
    if (namespace) return { key: entityKey(namespace, entityName) };
    const matches = this.#entityInfo.filter(info => info.name === entityName);
    if (matches.length === 1) return { key: entityKey(matches[0].namespace, matches[0].name) };
    if (matches.length > 1) return { ambiguous: true };
    return {};
  }

  #clearEntityInfo(): void {
    this.#hasEntityMetadata = false;
    this.#entityInfo = [];
    this.#entityTypeMap.clear();
    this.#encryptedFieldsMap.clear();
  }

  #setupMessageListener(): void {
    if (this.#messageHandler) return;
    this.#messageHandler = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.origin && event.origin !== location.origin) return;
      // v1 优先且语义不变：`isDevToolsMessage` 是对已知 v1 `type` 的闭集判断，
      // `PROTOCOL_HELLO` 会被它判否——不分流的话 v2 协商永远起不来。
      if (isDevToolsMessage(event.data)) {
        if (isDevToolsCommandMessage(event.data)) this.#handleMessage(event.data);
        return;
      }
      this.#endpoint?.receive(event.data);
    };
    window.addEventListener('message', this.#messageHandler);
  }

  /**
   * 命令是否在本页授予的能力档之内。
   *
   * @remarks
   * 被拒绝的命令**静默丢弃**：回一条错误等于给伪造方一个存在性探针
   * （"这条命令确实存在，只是我没权限"），也会让 DevToolsPanel 把
   * 权限问题误报成运行时故障。DevTools 侧应当读握手里的 `capabilities`
   * 自行禁用按钮，而不是靠试探。
   */
  #isAllowed(type: DevToolsCommandMessage['type']): boolean {
    return CAPABILITY_RANK[this.#options.capabilities] >= CAPABILITY_RANK[COMMAND_REQUIRED_CAPABILITY[type]];
  }

  #handleMessage(message: DevToolsCommandMessage): void {
    if (!this.#isAllowed(message.type)) return;

    switch (message.type) {
      case 'HANDSHAKE_ACK':
        this.#onHandshakeAck();
        break;
      case 'PING':
        this.#sendHandshake();
        break;
      case 'CLEAR':
        // 只清 buffer，**不** reset sequence：sequence 是 wire 上的全局定序键，
        // 会话中途归零会让两条不同事件共用一个序号，DevTools 侧的去重与乱序重排
        // 都会把后来的事件当成重复丢掉。清空历史与重排序号是两件事。
        this.#buffer.clear();
        break;
      case 'DISCONNECT':
        this.#connected = false;
        break;
      case 'DISCONNECT_RXDB':
        void this.#handleDisconnectRxdb(message.payload);
        break;
      case 'INSPECT_DB':
        this.#handleInspectDb();
        break;
      case 'QUERY_ENTITY':
        this.#handleQueryEntity(message.payload);
        break;
      case 'GET_BRANCHES':
        this.#handleGetBranches();
        break;
      case 'SWITCH_BRANCH':
        this.#handleSwitchBranch(message.payload);
        break;
      case 'CREATE_BRANCH':
        this.#handleCreateBranch(message.payload);
        break;
      case 'DELETE_BRANCH':
        this.#handleDeleteBranch(message.payload);
        break;
    }
  }

  async #handleDisconnectRxdb(payload: { requestId: string }): Promise<void> {
    const result = await this.#disconnectRxdbInstance();
    this.#postMessage(
      createMessage(
        'DISCONNECT_RXDB_RESULT',
        'page-to-devtools',
        {
          requestId: payload.requestId,
          success: result.success,
          error: result.error,
          status: result.status
        },
        this.#sequence.next()
      )
    );
  }

  /**
   * 断开被观测的 RxDB 实例。
   *
   * @remarks
   * 并发调用会**合流到同一次断开**：`DISCONNECT_RXDB` 命令、全局 helper 和
   * 面板重试可以同时到达，各自独立跑一遍意味着对同一个 adapter 连发 N 次
   * `disconnectAll()` + N 次 `terminate()`，第二次起在已释放的句柄上抛错，
   * 于是"成功的断开"被后到的失败结果覆盖。
   *
   * 失败（`status === 'failed'`）时清掉闩锁：此时实例与监听按约定被保留，
   * 调用方可以显式重试；成功路径上实例已置空，后续调用走 `not-connected` 快路径。
   */
  #disconnectRxdbInstance(timeoutMs = 3000): Promise<DisconnectResult> {
    this.#disconnectInFlight ??= this.#runDisconnect(timeoutMs).finally(() => {
      this.#disconnectInFlight = null;
    });
    return this.#disconnectInFlight;
  }

  async #runDisconnect(timeoutMs: number): Promise<DisconnectResult> {
    const rxdb = this.#rxdbInstance;
    if (!rxdb) return { success: true, error: null, status: 'not-connected' };

    const result = await this.#disconnectSingleRxdb(rxdb, timeoutMs);
    if (result.status === 'failed') return result;

    this.#unsubscribeFromEvents(rxdb);
    if (this.#rxdbInstance === rxdb) this.#rxdbInstance = null;
    this.#clearEntityInfo();
    this.#clearPendingSubscriptions();
    this.#syncGlobalHelper();
    return result;
  }

  async #disconnectSingleRxdb(rxdb: DevToolsRxDB, timeoutMs: number): Promise<DisconnectResult> {
    const gracefulError = await this.#tryGracefulDisconnect(rxdb, timeoutMs);
    if (gracefulError === null) return { success: true, error: null, status: 'graceful' };

    const forced = await this.#forceReleaseLocalAdapter(rxdb);
    if (forced.success) return { success: true, error: null, status: 'forced' };

    const forceError = forced.error ? `; ${forced.error}` : '';
    return { success: false, error: `${gracefulError}${forceError}`, status: 'failed' };
  }

  async #tryGracefulDisconnect(rxdb: DevToolsRxDB, timeoutMs: number): Promise<string | null> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('等待 RxDB 断开超时')), timeoutMs);
      });
      await Promise.race([rxdb.disconnectAll(), timeout]);
      return null;
    } catch (error) {
      return getErrorMessage(error);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  /**
   * 优雅断开失败后的兜底：直接掐掉本地 adapter 持有的 worker 句柄。
   *
   * @remarks
   * `IRxDBAdapter` 接口本身没有 `options` —— worker 句柄是各 SQLite 适配器
   * 私有配置里的可选字段（`rxdb-adapter-sqlite` / `-sqlite-wasm` 的
   * `workerInstance` / `sharedWorkerInstance`）。因此这里只能在运行时结构性探测，
   * 探不到就如实回 `{ success: false }`，由调用方合成 `status: 'failed'`。
   * 不做任何"假装成功"的兜底：DevTools 报了断开成功而 worker 还活着，
   * 比报失败更糟。
   */
  async #forceReleaseLocalAdapter(rxdb: DevToolsRxDB): Promise<ForceReleaseResult> {
    const localAdapterName = rxdb.config.sync.local?.adapter;
    if (!localAdapterName) return { success: false, error: null };

    try {
      const adapter = await rxdb.getAdapter(localAdapterName);
      const options = isRecord(adapter) ? adapter['options'] : undefined;
      if (!isRecord(options)) return { success: false, error: null };

      const workerInstance = options['workerInstance'];
      if (isTerminable(workerInstance)) {
        workerInstance.terminate();
        return { success: true, error: null };
      }

      const sharedWorker = options['sharedWorkerInstance'];
      if (isClosablePortHolder(sharedWorker)) {
        sharedWorker.port.close();
        return { success: true, error: null };
      }
      return { success: false, error: null };
    } catch (error) {
      return { success: false, error: getErrorMessage(error) };
    }
  }

  #syncGlobalHelper(): void {
    if (typeof window === 'undefined') return;

    type DevtoolsWindow = Window & {
      [DEVTOOLS_GLOBAL_KEY]?: {
        disconnectRxdb: (timeoutMs?: number) => Promise<DisconnectResult>;
      };
    };

    const devtoolsWindow = window as DevtoolsWindow;
    if (!this.#rxdbInstance) {
      delete devtoolsWindow[DEVTOOLS_GLOBAL_KEY];
      return;
    }
    devtoolsWindow[DEVTOOLS_GLOBAL_KEY] = {
      disconnectRxdb: (timeoutMs?: number) => this.#disconnectRxdbInstance(timeoutMs)
    };
  }

  /**
   * 发一次握手，附带协议版本与本页授予的能力档。
   *
   * @remarks
   * `capabilities` 只是**告知**，不是权限来源 —— 真正的判定在 {@link #isAllowed}，
   * 页面侧独立执行。DevTools 读它是为了把不可用的按钮直接禁掉，
   * 而不是发出去等一个永远不会来的回复。
   */
  #buildLegacyHandshake(): AnyDevToolsMessage {
    return createMessage(
      'HANDSHAKE',
      'page-to-devtools',
      { protocolVersion: DEVTOOLS_PROTOCOL_VERSION, capabilities: this.#options.capabilities },
      this.#sequence.next()
    );
  }

  #sendHandshake(): void {
    this.#postMessage(this.#buildLegacyHandshake());
  }

  /**
   * 起一个 v2 端点，并由它发出 eager legacy 握手。
   *
   * @remarks
   * 接的是**端点**而不是光秃秃的协商机：协商机只认识 HELLO / HANDSHAKE / ACK 三帧，
   * 数据面的 REQUEST、TRANSFER_* 会直接掉在地上——面板要等满 15 秒请求时限才知道没人答，
   * 而 wire 上分不清那是超时、是归属不符，还是这条能力根本不存在。session 归属校验、
   * 三层授权、请求与传输预算、格式错误的结构化拒绝，全都长在端点上；协商机一个都没有。
   *
   * legacy 握手仍是**第一条**出站消息：`start()` 只做这一件事，v2 要约要等对端
   * `PROTOCOL_HELLO` 到达才发。顺序不能反——只支持 v1 的面板收到未知 `type` 会直接丢弃，
   * 而它需要那条握手才知道页面上有 connector。
   *
   * 本轮仍宣告空 descriptor 集（见 {@link CONNECTOR_PROVIDERS}）：页内还没有接上任何
   * v2 provider，声明服务不了的 operation 等于让面板据此点亮按钮。真实 descriptor 随
   * US-904c / US-904d / US-905 的 provider 一起接上。
   */
  #startNegotiation(): void {
    const endpoint = createDevToolsConnectorEndpoint({
      send: (message: DevToolsConnectorNegotiationMessage) => this.#postMessage(message),
      clock: createSystemClock(),
      capability: this.#options.capabilities,
      mutationPolicy: CONNECTOR_MUTATION_POLICY,
      providers: CONNECTOR_PROVIDERS,
      legacyHandshake: this.#buildLegacyHandshake()
    });
    this.#endpoint = endpoint;
    endpoint.start();
  }

  #onHandshakeAck(): void {
    this.#connected = true;
    this.#flushBuffer();
  }

  #handleInspectDb(): void {
    const rxdb = this.#rxdbInstance;
    if (!rxdb || !this.#hasEntityMetadata) {
      this.#postMessage(createMessage('DB_INFO', 'page-to-devtools', null, this.#sequence.next()));
      return;
    }

    const dbInfo = {
      version: rxdb.version,
      dbName: rxdb.config.dbName,
      capabilities: this.#options.capabilities,
      entities: this.#entityInfo.map(info => ({
        name: info.name,
        namespace: info.namespace,
        encryptedFields: info.encryptedFields
      }))
    };
    this.#postMessage(createMessage('DB_INFO', 'page-to-devtools', dbInfo, this.#sequence.next()));
  }

  #replyEntityData(
    entityName: string,
    error: string | null,
    data: unknown[],
    meta?: { encryptedFields?: string[]; errorCode?: string },
    namespace?: string
  ): void {
    this.#postMessage(
      createMessage(
        'ENTITY_DATA',
        'page-to-devtools',
        { entityName, ...(namespace ? { namespace } : {}), error, data, ...(meta ? { _meta: meta } : {}) },
        this.#sequence.next()
      )
    );
  }

  #handleQueryEntity(payload: QueryEntityPayload): void {
    const rxdb = this.#rxdbInstance;
    // 只判「有没有 init 过」。`entityManager` 在真实 `RxDB` 上是构造期就赋值的必填成员，
    // 再加一层 `!rxdb.entityManager` 是给鸭子类型留的兜底 —— 而 init 的入参现在就是真类型。
    if (!rxdb) {
      this.#replyEntityData(payload.entityName, 'RxDB 未初始化', [], undefined, payload.namespace);
      return;
    }

    const resolved = this.#resolveEntityKey(payload.entityName, payload.namespace);
    if (resolved.ambiguous) {
      this.#replyEntityData(
        payload.entityName,
        `实体 ${payload.entityName} 在多个 namespace 下重名（ambiguous）；请在 QUERY_ENTITY 中指定 namespace`,
        [],
        undefined,
        payload.namespace
      );
      return;
    }

    const entityType = resolved.key ? this.#entityTypeMap.get(resolved.key) : undefined;
    if (!entityType) {
      this.#replyEntityData(payload.entityName, `实体 ${payload.entityName} 不存在`, [], undefined, payload.namespace);
      return;
    }

    const encryptedFields = (resolved.key && this.#encryptedFieldsMap.get(resolved.key)) || [];
    try {
      // 必须是 `find` 不是 `findAll`：`findAll` 的选项类型里根本没有 limit，
      // 传进去会被静默忽略 —— DevTools 请求 10 条，整张表被拉进内存并序列化。
      // `find` 会把 limit 归一化后带进查询指纹，真正下发到适配器。
      const observable = rxdb.entityManager.getRepository(entityType).find({
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'id', sort: 'desc' }],
        limit: payload.limit ?? DEFAULT_QUERY_LIMIT
      });
      subscribeOnce(
        observable,
        documents => {
          const data = documents.map(document =>
            serializeDocument(document, value => this.#maskEncryptedDocument(value, encryptedFields))
          );
          const meta = encryptedFields.length > 0 ? { encryptedFields } : undefined;
          this.#replyEntityData(payload.entityName, null, data, meta, payload.namespace);
        },
        error => this.#replyQueryError(payload.entityName, encryptedFields, error, payload.namespace),
        {
          timeoutMs: QUERY_SUBSCRIPTION_TIMEOUT_MS,
          register: subscription => this.#pendingSubscriptions.add(subscription),
          unregister: subscription => this.#pendingSubscriptions.delete(subscription)
        }
      );
    } catch (error) {
      this.#replyQueryError(payload.entityName, encryptedFields, error, payload.namespace);
    }
  }

  #replyQueryError(entityName: string, encryptedFields: string[], error: unknown, namespace?: string): void {
    const message = getErrorMessage(error);
    if (error instanceof Error && (error.name === 'EncryptedLockedError' || message.includes('keyring is locked'))) {
      this.#replyEntityData(entityName, message, [], { errorCode: 'KEYRING_LOCKED', encryptedFields }, namespace);
      return;
    }
    console.error('[RxDB DevTools Connector] Query error:', error);
    this.#replyEntityData(entityName, message, [], undefined, namespace);
  }

  #handleGetBranches(): void {
    if (this.#branchQueryInFlight) return;
    this.#branchQueryInFlight = true;
    this.#queryBranches();
  }

  #queryBranches(): void {
    const rxdb = this.#rxdbInstance;
    const branchKey = this.#resolveEntityKey(BRANCH_ENTITY_NAME).key;
    const branchEntityType = branchKey ? this.#entityTypeMap.get(branchKey) : undefined;
    if (!rxdb || !branchEntityType) {
      this.#branchQueryInFlight = false;
      this.#postMessage(createMessage('BRANCHES', 'page-to-devtools', [], this.#sequence.next()));
      return;
    }

    try {
      const observable = rxdb.entityManager.getRepository(branchEntityType).find({
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'id', sort: 'desc' }],
        limit: BRANCH_QUERY_LIMIT
      });
      subscribeOnce(
        observable,
        branches => {
          const branchData = branches.map(branch => {
            if (!isRecord(branch)) return { id: '', activated: false };
            return {
              id: typeof branch['id'] === 'string' ? branch['id'] : '',
              activated: branch['activated'] === true
            };
          });
          this.#branchQueryInFlight = false;
          this.#postMessage(
            createMessage(
              'BRANCHES',
              'page-to-devtools',
              serializeDevToolsValue(branchData) as unknown[],
              this.#sequence.next()
            )
          );
        },
        error => {
          this.#branchQueryInFlight = false;
          console.error('[RxDB DevTools Connector] Get branches error:', error);
          this.#postMessage(createMessage('BRANCHES', 'page-to-devtools', [], this.#sequence.next()));
        },
        {
          timeoutMs: QUERY_SUBSCRIPTION_TIMEOUT_MS,
          register: subscription => this.#pendingSubscriptions.add(subscription),
          unregister: subscription => this.#pendingSubscriptions.delete(subscription)
        }
      );
    } catch (error) {
      this.#branchQueryInFlight = false;
      console.error('[RxDB DevTools Connector] Get branches error:', error);
      this.#postMessage(createMessage('BRANCHES', 'page-to-devtools', [], this.#sequence.next()));
    }
  }

  /**
   * 跑一次分支操作，无论成败都刷新分支列表。
   *
   * @param run - 实际操作，拿到 `versionManager` 后调用
   * @param logLabel - 失败时打进 console 的操作名
   *
   * @remarks
   * 接回调而不是 `versionManager[opName](arg)` 索引式调用：三个方法的返回类型
   * 并不一致（`createBranch` 回 `Promise<RxDBBranch>`，另两个回 `Promise<void>`），
   * 联合索引签名会把它们塌成 `never` 参数。
   */
  #runBranchOp(run: (versionManager: DevToolsRxDB['versionManager']) => Promise<unknown>, logLabel: string): void {
    const rxdb = this.#rxdbInstance;
    // 同 `#handleQueryEntity`：`versionManager` 在真实 `RxDB` 上必然存在，
    // 唯一真实的失败态是「命令先于 init 到达」。
    if (!rxdb) {
      console.error('[RxDB DevTools Connector] RxDB 未初始化');
      this.#handleGetBranches();
      return;
    }

    run(rxdb.versionManager)
      .catch((error: unknown) => {
        console.error(`[RxDB DevTools Connector] ${logLabel} error:`, error);
      })
      .finally(() => {
        this.#handleGetBranches();
      });
  }

  #handleSwitchBranch(branchId: string): void {
    this.#runBranchOp(versionManager => versionManager.switchBranch(branchId), 'Switch branch');
  }

  #handleCreateBranch(branchName: string): void {
    this.#runBranchOp(versionManager => versionManager.createBranch(branchName), 'Create branch');
  }

  #handleDeleteBranch(branchId: string): void {
    this.#runBranchOp(versionManager => versionManager.removeBranch(branchId), 'Delete branch');
  }

  #flushBuffer(): void {
    for (const event of this.#buffer.flush()) this.#sendEvent(event);
  }

  /**
   * 订阅 RxDB 事件。
   *
   * @remarks
   * `none` 档直接返回：该档位的要求不是「拒绝入站命令」而是**零泄漏**——不建订阅、
   * 不写 buffer、不发任何业务数据。只在出站处拦截的话，事件仍会进 buffer，
   * 一条 `HANDSHAKE_ACK` 就能把它们整批冲出去。
   *
   * @param rxdb - 已注册的实例。
   */
  #subscribeToEvents(rxdb: DevToolsRxDB): void {
    if (this.#options.capabilities === 'none') return;

    for (const eventType of RXDB_EVENT_TYPES) {
      const listener = (event: RxDBEvent): void => this.#onRxDBEvent(event);
      rxdb.addEventListener(eventType, listener);
      this.#eventListeners.set(eventType, listener);
    }
  }

  #unsubscribeFromEvents(rxdb: DevToolsRxDB): void {
    for (const [eventType, listener] of this.#eventListeners) {
      rxdb.removeEventListener(eventType, listener);
    }
    this.#eventListeners.clear();
  }

  #onRxDBEvent(event: RxDBEvent): void {
    const record = toEventRecord(event);
    const serialized = serialize(this.#maskEncryptedEvent(record), this.#sequence.next());
    if (this.#connected) this.#sendEvent(serialized);
    else this.#buffer.push(serialized);

    if (this.#connected && this.#shouldRefreshBranches(record)) this.#handleGetBranches();
  }

  /**
   * 这条事件是否可能改变分支列表。
   *
   * @remarks
   * 删除类事件必须**先确认删的就是分支实体**再刷新。之前只看事件类型，
   * 于是任意业务实体的每一次删除都触发一次全表分支查询 ——
   * 批量删 500 条业务数据 = 500 次与分支毫不相干的查询。
   *
   * 身份判定走 {@link #resolveEntityKey} 而不是硬编码 `namespace === 'rxdb'`：
   * 分支实体的注册身份来自 `rxdb.config.entities` 里那份元数据，
   * 上游改 namespace 时这里自动跟随；同时也支持事件不带 namespace 的场景
   * （只有一个 `RxDBBranch` 时可无歧义解析）。
   */
  #shouldRefreshBranches(event: EventRecord): boolean {
    if (event.type === 'SWITCH_BRANCH_COMMIT') return true;
    if (event.type !== 'ENTITY_LOCAL_REMOVE' && event.type !== 'ENTITY_REMOTE_REMOVE') return false;

    const branchKey = this.#resolveEntityKey(BRANCH_ENTITY_NAME).key;
    if (!branchKey) return false;

    const entities = event['entities'];
    if (!Array.isArray(entities)) return false;
    return entities.some(entity => {
      if (!isRecord(entity) || typeof entity['entity'] !== 'string') return false;
      const namespace = typeof entity['namespace'] === 'string' ? entity['namespace'] : undefined;
      return this.#resolveEntityKey(entity['entity'], namespace).key === branchKey;
    });
  }

  // 按「已知携带实体的字段」遮罩，而不是按事件形状：CONFLICT_* 的载荷是 conflicts[]，
  // 每个 conflict 的 local/remote 带变更，base 则是实体快照，
  // 只认 `{ entities: [...] }` 会让这些明文补丁直接广播出去。
  #maskEncryptedEvent(event: EventRecord): EventRecord {
    const entities = event['entities'];
    const conflicts = event['conflicts'];
    if (!Array.isArray(entities) && !Array.isArray(conflicts)) return event;

    const data: EventRecord = { ...event };
    if (Array.isArray(entities)) {
      data['entities'] = entities.map(entity => this.#maskEncryptedEventEntity(entity));
    }
    if (Array.isArray(conflicts)) {
      data['conflicts'] = conflicts.map(conflict => this.#maskEncryptedConflict(conflict));
    }
    return data;
  }

  #maskEncryptedConflict(value: unknown): unknown {
    if (!isRecord(value)) return value;

    const masked = { ...value };
    for (const side of CONFLICT_CHANGE_FIELDS) {
      if (Object.hasOwn(value, side)) masked[side] = this.#maskEncryptedEventEntity(value[side]);
    }
    if (Object.hasOwn(value, 'base')) {
      const metadataKey = metadataKeyFromConflictKey(value['entityKey']);
      const encryptedFields = (metadataKey && this.#encryptedFieldsMap.get(metadataKey)) || [];
      masked['base'] = maskEncryptedFields(value['base'], encryptedFields);
    }
    return masked;
  }

  #maskEncryptedEventEntity(value: unknown): unknown {
    if (!isRecord(value) || typeof value['entity'] !== 'string') return value;
    // 必须用事件自带的 namespace 定位 metadata；只按 entity 名取会套用别的 namespace 的规则，
    // 结果是本该遮罩的字段留明文、无关字段反被遮罩。
    const eventNamespace = typeof value['namespace'] === 'string' ? value['namespace'] : undefined;
    const resolved = this.#resolveEntityKey(value['entity'], eventNamespace);
    const encryptedFields = (resolved.key && this.#encryptedFieldsMap.get(resolved.key)) || [];

    const masked = { ...value };
    for (const field of EVENT_ENTITY_FIELDS) {
      if (!Object.hasOwn(value, field)) continue;
      const redacted = maskEncryptedFields(value[field], encryptedFields);
      masked[field] = this.#maskEmbeddedChangeValue(redacted);
    }
    return masked;
  }

  #maskEncryptedDocument(value: unknown, encryptedFields: readonly string[]): unknown {
    return this.#maskEmbeddedChangeValue(maskEncryptedFields(value, encryptedFields));
  }

  #maskEmbeddedChangeValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(item => this.#maskEmbeddedChangeValue(item));
    if (!isRecord(value) || value instanceof Date || value instanceof Uint8Array) return value;

    let masked = value;
    const entityName = typeof value['entity'] === 'string' ? value['entity'] : undefined;
    if (entityName) {
      const namespace = typeof value['namespace'] === 'string' ? value['namespace'] : undefined;
      const resolved = this.#resolveEntityKey(entityName, namespace);
      const encryptedFields = (resolved.key && this.#encryptedFieldsMap.get(resolved.key)) || [];
      masked = { ...value };
      for (const field of EVENT_ENTITY_FIELDS) {
        if (Object.hasOwn(value, field)) masked[field] = maskEncryptedFields(value[field], encryptedFields);
      }
    }

    const changes = value['changes'];
    if (!Array.isArray(changes)) return masked;
    if (masked === value) masked = { ...value };
    masked['changes'] = changes.map(change => this.#maskEmbeddedChangeValue(change));
    return masked;
  }

  #sendEvent(event: SerializedEvent): void {
    this.#postMessage(createMessage('EVENT', 'page-to-devtools', event, event.sequence));
  }

  /**
   * 把消息投到本页的 message 总线。
   *
   * @remarks
   * `targetOrigin` 用 `location.origin` 而不是 `'*'`。这些载荷里带着
   * 实体名、加密字段清单、乃至查询结果的明文文档 —— `'*'` 意味着
   * 同页任何跨源 iframe（广告位、第三方挂件）都能原样收到整份数据。
   * 收发都在同一个文档内，精确 origin 完全够用。
   *
   * 唯一的例外是 opaque origin（`'null'`）：那里 `location.origin` 不是
   * 合法的 targetOrigin，只有显式设了 {@link DevToolsOptions.allowOpaqueOrigin}
   * 才退回 `'*'`，否则 {@link init} 早就把连接器停用了。
   */
  #postMessage(message: DevToolsConnectorNegotiationMessage): void {
    if (typeof window === 'undefined') return;
    const targetOrigin = location.origin === OPAQUE_ORIGIN ? '*' : location.origin;
    try {
      window.postMessage(message, targetOrigin);
    } catch (error) {
      console.warn(`[${RXDB_DEVTOOLS_MESSAGE}] Failed to post message:`, error);
    }
  }
}

let globalConnector: DevToolsConnector | null = null;

/** 获取或创建全局 RxDB DevTools 连接器。 */
export function getDevToolsConnector(options?: DevToolsOptions): DevToolsConnector {
  if (!globalConnector) globalConnector = new DevToolsConnector(options);
  return globalConnector;
}

/** 重置全局 RxDB DevTools 连接器。 */
export function resetDevToolsConnector(): void {
  if (!globalConnector) return;
  globalConnector.disconnect();
  globalConnector = null;
}
