import type { RxDBEvent, RxDBEventMap } from '@aiao/rxdb';

import { EventBuffer } from './buffer.js';
import {
  createEntityRegistry,
  EMPTY_ENTITY_INDEX,
  resolveEntityKey,
  type EntityIndex,
  type EntityRegistry
} from './connector-entity-info.js';
import { RXDB_EVENT_TYPES, toEventRecord, type EventRecord } from './connector-events.js';
import { maskEncryptedDocument, maskEncryptedEvent, type ConnectorMaskContext } from './connector-mask.js';
import {
  CONNECTOR_MUTATION_POLICY,
  createConnectorProviders,
  resolveBrowserOpfsRoot,
  saveFileThroughPage,
  type ConnectorProviderPorts,
  type ConnectorProviderRegistry
} from './connector-providers.js';
import {
  forceReleaseLocalAdapter,
  getErrorMessage,
  serializeDocument,
  tryGracefulDisconnect,
  type DisconnectResult,
  type ForceReleaseResult
} from './connector-runtime.js';
import { subscribeOnce, type Subscription } from './connector-subscribe-once.js';
import type { DevToolsOptions, DevToolsRxDB, GetEntityMetadataFn } from './connector-types.js';
import { isRecord } from './internal/guards.js';
import { SequenceGenerator } from './sequence.js';
import { serialize, serializeDevToolsValue } from './serializer.js';
import {
  createMessage,
  DEVTOOLS_PROTOCOL_VERSION,
  isDevToolsCommandMessage,
  isDevToolsMessage,
  RXDB_DEVTOOLS_MESSAGE,
  type AnyDevToolsMessage,
  type DevToolsCapability,
  type DevToolsCommandMessage,
  type DevToolsEntityErrorCode,
  type QueryEntityPayload,
  type SerializedEvent
} from './types.js';
import { satisfiesCapability } from './v2/capability.js';
import { createSystemClock } from './v2/clock.js';
import type { DevToolsConnectorEndpoint } from './v2/endpoint.js';
import { createDevToolsConnectorEndpoint } from './v2/endpoint.js';
import type { DevToolsConnectorNegotiationMessage } from './v2/negotiation-connector.js';

export type { DevToolsEntityMetadata, DevToolsOptions, DevToolsRxDB, GetEntityMetadataFn } from './connector-types.js';
export { RXDB_EVENT_TYPES };

const DEFAULT_OPTIONS: Required<DevToolsOptions> = {
  maxBufferSize: 100,
  enabled: true,
  capabilities: 'full',
  mutationPolicy: CONNECTOR_MUTATION_POLICY,
  allowOpaqueOrigin: false
};

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

const OPAQUE_ORIGIN = 'null' as const;

/**
 * 握手之后仍然允许从共享 `window` 总线进入的命令。
 *
 * @remarks
 * 只有 `PING` —— 它是「你还在吗」的探活，不读也不改任何东西，而对端在拿到端口之前
 * 只能靠它确认页面已经装了连接器。其余命令一律只认私有端口，从 `window` 来的直接丢弃
 * 并给一次诊断（见 {@link RxDBDevToolsConnector.#warnWindowBusCommand}）。
 */
const WINDOW_BUS_ALLOWED_COMMAND = 'PING' as const satisfies DevToolsCommandMessage['type'];

const DEVTOOLS_GLOBAL_KEY = '__AIAO_RXDB_DEVTOOLS__' as const;
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
  /**
   * 握手时建立的私有信道的己方端口，握手之后的收发全部走它。
   *
   * @remarks
   * `null` 表示还没握过手（或已 {@link disconnect}）。此时出站消息退回
   * `window.postMessage` —— 握手本身就必须这么发，没有别的路可走。
   */
  #port: MessagePort | null = null;
  #endpoint: DevToolsConnectorEndpoint | null = null;
  /**
   * 实体注册表；`null` 表示 {@link init} 没拿到 `getEntityMetadata`（或已断开）。
   *
   * @remarks
   * 不缓存实体清单本身 —— `config.entities` 是活数组，注册表按需重算。
   */
  #entityRegistry: EntityRegistry | null = null;
  /**
   * {@link init} 拿到的元数据读取函数。
   *
   * @remarks
   * 单独留一份而不是从 {@link #entityRegistry} 里回取：v2 的 `database` provider 要自己建
   * 索引（实例可能被换掉），拿到的必须是同一个函数，而注册表只对外给算好的索引。
   */
  #getEntityMetadata: GetEntityMetadataFn | null = null;
  /** 本次会话的 v2 provider 装配；`disconnect()` 时连同订阅一起回收。 */
  #providers: ConnectorProviderRegistry | null = null;
  #pendingSubscriptions: Set<Subscription> = new Set();
  #branchQueryInFlight = false;
  #disconnectInFlight: Promise<DisconnectResult> | null = null;
  #opaqueOriginWarned = false;
  #windowBusCommandWarned = false;

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

    this.#rxdbInstance = rxdb;
    this.#getEntityMetadata = getEntityMetadata ?? null;
    this.#entityRegistry = getEntityMetadata ? createEntityRegistry(rxdb, getEntityMetadata) : null;
    // 立刻收集一次：`getEntityMetadata` 对未装饰的类抛错，这里让它在 init 上抛，
    // 而不是推迟到第一条事件——那时候异常会淹没在事件转发链里。
    this.#syncEntities();
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
   *
   * `DISCONNECT` 在关端口**之前**发，且刻意走当前信道（还握着手就走私有端口）——
   * 先关端口的话这条告别消息会被丢进已关闭的信道，对端只能等超时。
   */
  disconnect(): void {
    if (typeof window === 'undefined') return;

    this.#postMessage(createMessage('DISCONNECT', 'page-to-devtools', null, this.#sequence.next()));
    this.#closePort();
    if (this.#messageHandler) {
      window.removeEventListener('message', this.#messageHandler);
      this.#messageHandler = null;
    }
    if (this.#rxdbInstance) this.#unsubscribeFromEvents(this.#rxdbInstance);
    this.#endpoint?.dispose();
    this.#endpoint = null;
    // 端点拆了不等于订阅拆了：v2 的 database provider 自己在实例上挂着监听。
    this.#providers?.dispose();
    this.#providers = null;

    this.#rxdbInstance = null;
    this.#getEntityMetadata = null;
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

  /**
   * 取当前实体视图 —— 所有读实体的地方唯一的入口。
   *
   * @remarks
   * `config.entities` 未变时是一次 O(n) 指针扫描并原样返回上次的对象。
   * **事件路径也必须走这里**：`#maskContext` 拿到的 `encryptedFieldsMap`
   * 决定哪些字段被换成 `[encrypted]`，若只在命令路径重算，则 init 之后才注册的
   * 加密实体在遮罩表里永远缺席 → 字段集算成空 → 密文列原样发上页面消息总线。
   */
  #syncEntities(): EntityIndex {
    if (!this.#rxdbInstance || !this.#entityRegistry) return EMPTY_ENTITY_INDEX;
    return this.#entityRegistry.sync();
  }

  #maskContext(): ConnectorMaskContext {
    return this.#syncEntities();
  }

  #clearEntityInfo(): void {
    this.#entityRegistry = null;
  }

  /**
   * 注册 `window` 总线监听。
   *
   * @remarks
   * 握手之后命令走私有端口，这条监听只留给 {@link WINDOW_BUS_ALLOWED_COMMAND}：
   * 对端在拿到端口之前只有 `PING` 可用。其余命令从这里进来说明对端还在按旧协议发，
   * 丢弃并给一次诊断 —— 静默丢弃会让升级期变成"点了按钮没反应"。
   */
  #setupMessageListener(): void {
    if (this.#messageHandler) return;
    this.#messageHandler = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.origin && event.origin !== location.origin) return;
      // v1 优先且语义不变：`isDevToolsMessage` 是对已知 v1 `type` 的闭集判断，
      // `PROTOCOL_HELLO` 会被它判否——不分流的话 v2 协商永远起不来。
      if (isDevToolsMessage(event.data)) {
        if (!isDevToolsCommandMessage(event.data)) return;
        // v1 命令仍受总线白名单约束：握手之后它们只能走私有端口。
        // v2 协商帧不在这条闭集里，走下面的端点分支，与本白名单互不影响。
        if (event.data.type !== WINDOW_BUS_ALLOWED_COMMAND) {
          this.#warnWindowBusCommand(event.data.type);
          return;
        }
        this.#handleMessage(event.data);
        return;
      }
      this.#endpoint?.receive(event.data);
      this.#syncLegacyConnectionToSession();
    };
    window.addEventListener('message', this.#messageHandler);
  }

  /**
   * v2 会话一旦打开，v1 事件流也算已连接。
   *
   * @remarks
   * `#connected` 原先只由 legacy `HANDSHAKE_ACK` 置位。但两端都会说 v2 时协商直接落到 v2，
   * 面板**永远不会**发那条 legacy ACK（ACK 所有权归面板，v2 分支只发 v2 ACK），于是事件
   * 无限期滞留在 buffer 里——症状是 Database / Events 两页全空，且看起来像页面没有事件。
   *
   * 这不是「v1 该退场了」：阶段 C2 只把 `files` 迁到了 v2，数据库能力仍由 v1 消息承载
   * （`database` 领域有意不宣告 descriptor，见 {@link createConnectorProviders}）。
   * 两代协议在同一条链路上并存期间，**连接判定必须认两种证据**。
   *
   * 只升不降：这里不因 `sessionOpen` 转 `false` 而断开 v1。v2 session 结束有它自己的
   * 终态处理，而 v1 的断开由 `DISCONNECT` 命令负责；让一处状态去关另一处的门会让
   * 「谁把我断开的」不可追溯。
   */
  #syncLegacyConnectionToSession(): void {
    if (this.#connected) return;
    if (this.#endpoint?.sessionOpen !== true) return;
    this.#onHandshakeAck();
  }

  /**
   * 建立本次会话的私有信道，返回要移交给对端的那一端。
   *
   * @remarks
   * 每次握手都新建一对端口，旧端口立刻关掉：`PING` 会触发重新握手，
   * 复用旧端口的话上一次会话的对端仍然连着，权限撤销与断开都作用不到它。
   */
  #createSessionPort(): MessagePort {
    this.#closePort();
    const channel = new MessageChannel();
    this.#port = channel.port1;
    this.#port.onmessage = (event: MessageEvent) => {
      // 端口是点对点的，没有 source/origin 可查 —— 能往里发消息的只有握手时
      // 拿到 port2 的那一方。结构校验照做：对端一样可能发畸形消息。
      if (!isDevToolsMessage(event.data) || !isDevToolsCommandMessage(event.data)) return;
      this.#handleMessage(event.data);
    };
    this.#port.start();
    return channel.port2;
  }

  #closePort(): void {
    if (!this.#port) return;
    this.#port.onmessage = null;
    this.#port.close();
    this.#port = null;
  }

  #warnWindowBusCommand(type: DevToolsCommandMessage['type']): void {
    if (this.#windowBusCommandWarned) return;
    this.#windowBusCommandWarned = true;
    console.warn(
      `[${RXDB_DEVTOOLS_MESSAGE}] 收到从 window 总线发来的 ${type} 命令并已丢弃。` +
        `协议 v${DEVTOOLS_PROTOCOL_VERSION} 起，握手之后的命令必须走 HANDSHAKE 消息随附的 MessagePort。` +
        `请升级 DevTools 扩展。`
    );
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
    return satisfiesCapability(this.#options.capabilities, COMMAND_REQUIRED_CAPABILITY[type]);
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
    return tryGracefulDisconnect(() => rxdb.disconnectAll(), timeoutMs);
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
    return forceReleaseLocalAdapter(() => rxdb.getAdapter(localAdapterName));
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
   * 发一次握手：协议版本 + 本页授予的能力档，并移交本次会话的私有端口。
   *
   * @remarks
   * `capabilities` 只是**告知**，不是权限来源 —— 真正的判定在 {@link #isAllowed}，
   * 页面侧独立执行。DevTools 读它是为了把不可用的按钮直接禁掉，
   * 而不是发出去等一个永远不会来的回复。
   *
   * 端口是在 `#postMessage` **之前**建好并挂上 `onmessage` 的：`transfer` 一交出去，
   * 对端可能同一个 task 就回 `HANDSHAKE_ACK`，此时己方端口必须已经在收。
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
    const remotePort = this.#createSessionPort();
    this.#postMessage(this.#buildLegacyHandshake(), [remotePort]);
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
   * descriptor 集由 {@link createConnectorProviders} 按本页**实际**具备的能力装配：
   * 有 OPFS 才宣告 `files`，`database` 的 v2 操作尚未实现因此不宣告。声明服务不了的
   * operation 等于让面板据此点亮按钮。
   *
   * 端点只决定 legacy 握手**何时**出门，不知道 v1 传输层还要求这条握手**随附**本次会话的
   * 私有端口。所以端口在这里就建好，并按对象身份认出那唯一一条要携带它的出站消息——
   * 端点发的就是我们交给它的那个对象，`start()` 只发一次（见 negotiation-connector）。
   * 不能改成「凡 HANDSHAKE 都附端口」：`PING` 触发的重握手由 {@link #sendHandshake}
   * 另建新端口，两条路各自持有自己的那一对，混在一起会把上一次会话的端口再送出去一遍。
   */
  #startNegotiation(): void {
    const legacyHandshake = this.#buildLegacyHandshake();
    const remotePort = this.#createSessionPort();
    const providers = createConnectorProviders({
      getRootDirectory: resolveBrowserOpfsRoot(),
      saveToDisk: saveFileThroughPage,
      ...this.#databasePorts()
    });
    const endpoint = createDevToolsConnectorEndpoint({
      send: (message: DevToolsConnectorNegotiationMessage) =>
        message === legacyHandshake ? this.#postMessage(message, [remotePort]) : this.#postMessage(message),
      clock: createSystemClock(),
      capability: this.#options.capabilities,
      mutationPolicy: this.#options.mutationPolicy,
      providers,
      legacyHandshake
    });
    this.#providers = providers;
    this.#endpoint = endpoint;
    endpoint.start();
  }

  /**
   * `database` 领域的接入口——没有元数据就整个不接。
   *
   * @remarks
   * `emitEvent` 走 `this.#endpoint` 而不是捕获某个端点实例：装配发生在端点构造**之前**
   * （registry 是端点的构造入参），而重新握手会换掉端点。按调用时刻取，事件才总是发往
   * 当前那条链路，而不是上一次会话那条已经关掉的。
   *
   * @returns 可展开进 {@link createConnectorProviders} 入参的片段；不接时是空对象。
   */
  #databasePorts(): Pick<ConnectorProviderPorts, 'database'> {
    const getEntityMetadata = this.#getEntityMetadata;
    if (getEntityMetadata === null) return {};
    return {
      database: {
        getRxDB: () => this.#rxdbInstance ?? undefined,
        getEntityMetadata,
        emitEvent: (eventType, data) => this.#endpoint?.emitEvent(eventType, data)
      }
    };
  }

  #onHandshakeAck(): void {
    this.#connected = true;
    this.#flushBuffer();
  }

  #handleInspectDb(): void {
    const rxdb = this.#rxdbInstance;
    if (!rxdb || !this.#entityRegistry) {
      this.#postMessage(createMessage('DB_INFO', 'page-to-devtools', null, this.#sequence.next()));
      return;
    }

    const dbInfo = {
      version: rxdb.version,
      dbName: rxdb.config.dbName,
      capabilities: this.#options.capabilities,
      entities: this.#syncEntities().entityInfo.map(info => ({
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
    meta?: { encryptedFields?: string[]; errorCode?: DevToolsEntityErrorCode },
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
      this.#replyEntityData(
        payload.entityName,
        'RxDB 未初始化',
        [],
        { errorCode: 'RXDB_NOT_READY' },
        payload.namespace
      );
      return;
    }

    const { entityInfo, entityTypeMap, encryptedFieldsMap } = this.#syncEntities();
    const resolved = resolveEntityKey(entityInfo, payload.entityName, payload.namespace);
    if (resolved.ambiguous) {
      this.#replyEntityData(
        payload.entityName,
        `实体 ${payload.entityName} 在多个 namespace 下重名（ambiguous）；请在 QUERY_ENTITY 中指定 namespace`,
        [],
        { errorCode: 'ENTITY_AMBIGUOUS' },
        payload.namespace
      );
      return;
    }

    const entityType = resolved.key ? entityTypeMap.get(resolved.key) : undefined;
    if (!entityType) {
      this.#replyEntityData(
        payload.entityName,
        `实体 ${payload.entityName} 不存在`,
        [],
        { errorCode: 'ENTITY_NOT_FOUND' },
        payload.namespace
      );
      return;
    }

    const encryptedFields = [...(resolved.key ? (encryptedFieldsMap.get(resolved.key) ?? []) : [])];
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
            serializeDocument(document, value => maskEncryptedDocument(this.#maskContext(), value, encryptedFields))
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
    const { entityInfo, entityTypeMap } = this.#syncEntities();
    const branchKey = resolveEntityKey(entityInfo, BRANCH_ENTITY_NAME).key;
    const branchEntityType = branchKey ? entityTypeMap.get(branchKey) : undefined;
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
    const serialized = serialize(maskEncryptedEvent(this.#maskContext(), record), this.#sequence.next());
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
   * 身份判定走 {@link resolveEntityKey} 而不是硬编码 `namespace === 'rxdb'`：
   * 分支实体的注册身份来自 `rxdb.config.entities` 里那份元数据，
   * 上游改 namespace 时这里自动跟随；同时也支持事件不带 namespace 的场景
   * （只有一个 `RxDBBranch` 时可无歧义解析）。
   */
  #shouldRefreshBranches(event: EventRecord): boolean {
    if (event.type === 'SWITCH_BRANCH_COMMIT') return true;
    if (event.type !== 'ENTITY_LOCAL_REMOVE' && event.type !== 'ENTITY_REMOTE_REMOVE') return false;

    // 循环外只解一次：每条事件都可能带上百个实体，重算判定不该按实体数放大。
    const { entityInfo } = this.#syncEntities();
    const branchKey = resolveEntityKey(entityInfo, BRANCH_ENTITY_NAME).key;
    if (!branchKey) return false;

    const entities = event['entities'];
    if (!Array.isArray(entities)) return false;
    return entities.some(entity => {
      if (!isRecord(entity) || typeof entity['entity'] !== 'string') return false;
      const namespace = typeof entity['namespace'] === 'string' ? entity['namespace'] : undefined;
      return resolveEntityKey(entityInfo, entity['entity'], namespace).key === branchKey;
    });
  }

  #sendEvent(event: SerializedEvent): void {
    this.#postMessage(createMessage('EVENT', 'page-to-devtools', event, event.sequence));
  }

  /**
   * 发出一条出站消息：v1 消息握过手走私有端口，其余退回 `window` 总线。
   *
   * @param message - 要发出的消息
   * @param transfer - 需要移交所有权的对象；仅握手用它交出 `port2`
   *
   * @remarks
   * 私有端口是 **v1 命令面**的传输层，v2 帧不走它：入站的 v2 帧由 `window` 总线进来
   * （端口的 `onmessage` 只收 v1 命令，见 {@link #createSessionPort}），出站若改走端口
   * 就成了单向的——对端在总线上发 `PROTOCOL_HELLO`，却要去一个它可能压根没在读 v2 的
   * 信道里找回应，协商永远不会闭合。两个协议各自完整地待在自己的信道上。
   *
   * 走 `window` 总线时 `targetOrigin` 用 `location.origin` 而不是 `'*'`：
   * 载荷里带着实体名、加密字段清单、乃至查询结果的明文文档 —— `'*'` 意味着
   * 同页任何跨源 iframe（广告位、第三方挂件）都能原样收到整份数据。
   * 收发都在同一个文档内，精确 origin 完全够用。
   *
   * 唯一的例外是 opaque origin（`'null'`）：那里 `location.origin` 不是
   * 合法的 targetOrigin，只有显式设了 {@link DevToolsOptions.allowOpaqueOrigin}
   * 才退回 `'*'`，否则 {@link init} 早就把连接器停用了。端口路径没有这个问题 ——
   * 点对点信道不看 origin，这也正是握手之后要切过去的原因之一。
   */
  #postMessage(message: DevToolsConnectorNegotiationMessage, transfer?: Transferable[]): void {
    if (typeof window === 'undefined') return;
    try {
      if (this.#port && !transfer && isDevToolsMessage(message)) {
        this.#port.postMessage(message);
        return;
      }
      const targetOrigin = location.origin === OPAQUE_ORIGIN ? '*' : location.origin;
      window.postMessage(message, targetOrigin, transfer);
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
