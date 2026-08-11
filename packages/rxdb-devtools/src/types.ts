/** RxDB DevTools 消息来源标识符。 */
export const RXDB_DEVTOOLS_MESSAGE = '@aiao/rxdb-devtools' as const;

/** RxDB DevTools 消息方向。 */
export type MessageDirection = 'page-to-devtools' | 'devtools-to-page';

/** RxDB DevTools 消息类型。 */
export type MessageType =
  | 'HANDSHAKE'
  | 'HANDSHAKE_ACK'
  | 'EVENT'
  | 'DISCONNECT'
  | 'DISCONNECT_RXDB'
  | 'DISCONNECT_RXDB_RESULT'
  | 'CLEAR'
  | 'PING'
  | 'INSPECT_DB'
  | 'DB_INFO'
  | 'QUERY_ENTITY'
  | 'ENTITY_DATA'
  | 'GET_BRANCHES'
  | 'BRANCHES'
  | 'SWITCH_BRANCH'
  | 'CREATE_BRANCH'
  | 'DELETE_BRANCH';

/** RxDB 断开结果状态。 */
export type DisconnectStatus = 'graceful' | 'forced' | 'failed' | 'not-connected';

/** DevTools 页面协议版本，随不兼容的 envelope/载荷变更递增。 */
export const DEVTOOLS_PROTOCOL_VERSION = 1 as const;

/**
 * 页面授予 DevTools 的命令能力档位。
 *
 * @remarks
 * 页面与 DevTools 之间是 `window.postMessage`，**同源脚本可以伪造任何命令**
 * （见 {@link isDevToolsCommandMessage}：方向字段只是约定，不是权限）。
 * 分档的意义是让页面自己决定最坏情况的爆炸半径：
 *
 * - `'none'`：只放行连接生命周期命令（握手 / PING / CLEAR / DISCONNECT）。
 *   不泄漏任何库内数据，也不改变任何状态。
 * - `'readonly'`：额外放行只读遥测（INSPECT_DB / QUERY_ENTITY / GET_BRANCHES）。
 *   会把实体数据发到页面消息总线上，但不改变数据库状态。
 * - `'full'`：额外放行破坏性命令（DISCONNECT_RXDB / SWITCH_BRANCH /
 *   CREATE_BRANCH / DELETE_BRANCH）。
 *
 * 被拒绝的命令**静默丢弃**：回一条错误等于给伪造方一个存在性探针。
 * 合法 DevTools 从 HANDSHAKE 载荷里读到本页档位，据此禁用对应 UI。
 */
export type DevToolsCapability = 'none' | 'readonly' | 'full';

/**
 * 握手载荷：协议版本 + 本页授予的能力档。
 *
 * @remarks
 * 旧版本连接器发送 `payload: null`，{@link isDevToolsMessage} 仍然接受，
 * DevTools 侧读不到 capabilities 时按 `'full'` 理解（历史行为）。
 */
export interface HandshakePayload {
  /** 页面侧实现的协议版本。 */
  protocolVersion: typeof DEVTOOLS_PROTOCOL_VERSION;
  /** 本页授予 DevTools 的能力档。 */
  capabilities: DevToolsCapability;
}

/** 基础消息结构。 */
export interface DevToolsMessage<T = unknown> {
  source: typeof RXDB_DEVTOOLS_MESSAGE;
  direction: MessageDirection;
  type: MessageType;
  payload: T;
  timestamp: number;
  sequence: number;
  tabId?: number;
}

/**
 * 握手消息。
 *
 * @remarks
 * `null` 载荷是弃用窗口内的兼容形态（旧连接器产出）；新连接器一律发送
 * {@link HandshakePayload}。
 */
export interface HandshakeMessage extends DevToolsMessage<HandshakePayload | null> {
  type: 'HANDSHAKE';
  direction: 'page-to-devtools';
}

/** 握手确认消息。 */
export interface HandshakeAckMessage extends DevToolsMessage<null> {
  type: 'HANDSHAKE_ACK';
  direction: 'devtools-to-page';
}

/** 序列化后的 RxDB 事件。 */
export interface SerializedEvent {
  id: string;
  eventType: string;
  timestamp: number;
  sequence: number;
  data: Record<string, unknown>;
}

/** 事件消息。 */
export interface EventMessage extends DevToolsMessage<SerializedEvent> {
  type: 'EVENT';
  direction: 'page-to-devtools';
}

interface PageDisconnectMessage extends DevToolsMessage<null> {
  type: 'DISCONNECT';
  direction: 'page-to-devtools';
}

interface DevToolsDisconnectMessage extends DevToolsMessage<null> {
  type: 'DISCONNECT';
  direction: 'devtools-to-page';
}

/** 页面或 DevTools 发起的通信断开消息。 */
export type DisconnectMessage = PageDisconnectMessage | DevToolsDisconnectMessage;

/** 请求断开 RxDB 实例。 */
export interface DisconnectRxdbMessage extends DevToolsMessage<{ requestId: string }> {
  type: 'DISCONNECT_RXDB';
  direction: 'devtools-to-page';
}

/**
 * 断开 RxDB 实例的结果载荷。
 *
 * @remarks
 * 三个字段不是独立的：`status` 决定 `success` 与 `error`。
 * `failed` ⇒ `success === false` 且 `error` 非空；其余状态 ⇒ `success === true` 且 `error === null`。
 * 这条矩阵由 {@link isDevToolsMessage} 在协议边界强制，见其 `DISCONNECT_RXDB_RESULT` 分支。
 */
export interface DisconnectRxdbResultPayload {
  /** 回显请求的 `requestId`，用于把结果对回发起方。 */
  requestId: string;
  /** 是否已确定不再持有该实例。 */
  success: boolean;
  /** 失败原因；成功时为 `null`。 */
  error: string | null;
  /** 断开走到了哪条路径。 */
  status: DisconnectStatus;
}

/** 断开 RxDB 实例的结果。 */
export interface DisconnectRxdbResultMessage extends DevToolsMessage<DisconnectRxdbResultPayload> {
  type: 'DISCONNECT_RXDB_RESULT';
  direction: 'page-to-devtools';
}

/** 清除 DevTools 事件消息。 */
export interface ClearMessage extends DevToolsMessage<null> {
  type: 'CLEAR';
  direction: 'devtools-to-page';
}

/** DevTools 状态探测消息。 */
export interface PingMessage extends DevToolsMessage<null> {
  type: 'PING';
  direction: 'devtools-to-page';
}

/** 数据库检查命令。 */
export interface InspectDbMessage extends DevToolsMessage<null> {
  type: 'INSPECT_DB';
  direction: 'devtools-to-page';
}

/** `DB_INFO` 中单个实体的摘要。 */
export interface DbInfoEntity {
  /** 实体名（不含 namespace）。 */
  name: string;
  /** 实体所属 namespace；未声明时为 `'public'`。 */
  namespace: string;
  /** 该实体被 metadata 标记为加密的顶层字段名；查询结果里这些字段已被遮罩。 */
  encryptedFields: string[];
}

/**
 * 数据库信息响应载荷。
 *
 * @remarks
 * `null` 表示连接器还没拿到实体元数据（`init` 时未传 `getEntityMetadata`），
 * 与「数据库为空」是两件事，不要合并处理。
 */
export interface DbInfoPayload {
  /** 被观测 RxDB 实例的版本号。 */
  version: string;
  /** 被观测数据库名。 */
  dbName: string;
  /** 本页授予 DevTools 的能力档；面板据此禁用越权按钮。 */
  capabilities: DevToolsCapability;
  /** 已注册且带可用元数据的实体列表。 */
  entities: DbInfoEntity[];
}

/** 数据库信息响应。 */
export interface DbInfoMessage extends DevToolsMessage<DbInfoPayload | null> {
  type: 'DB_INFO';
  direction: 'page-to-devtools';
}

/** 实体查询命令参数。 */
export interface QueryEntityPayload {
  entityName: string;
  /**
   * 实体所属 namespace。
   *
   * @remarks
   * 上游用 `namespace:name` 作实体身份，不同 namespace 下允许重名
   * （见 `SchemaManager`）。省略时若名称在全库唯一则按该实体处理；
   * 存在同名实体时返回结构化错误，**不会**随意挑一个 —— 挑错会查到别的库、
   * 并套用另一个 namespace 的加密字段集。
   *
   * 现阶段为可选字段以兼容旧扩展；后续破坏性版本再改为必填。
   */
  namespace?: string;
  limit?: number;
}

/** 实体查询命令。 */
export interface QueryEntityMessage extends DevToolsMessage<QueryEntityPayload> {
  type: 'QUERY_ENTITY';
  direction: 'devtools-to-page';
}

/** 实体查询结果载荷。 */
export interface EntityDataPayload {
  /** 回显请求的实体名，便于面板把响应对回请求。 */
  entityName: string;
  /** 回显请求中的 namespace；旧客户端未传时省略。 */
  namespace?: string;
  /** 查询失败时的可读描述；成功为 `null`。 */
  error: string | null;
  /** 已序列化且已遮罩的文档列表；失败时为空数组。 */
  data: unknown[];
  /** 附加诊断信息，仅在有内容时出现。 */
  _meta?: {
    /** 本次结果中被遮罩的字段名。 */
    encryptedFields?: string[];
    /** 结构化错误码，供面板做分支处理而不必匹配文案。 */
    errorCode?: string;
  };
}

/** 实体查询结果。 */
export interface EntityDataMessage extends DevToolsMessage<EntityDataPayload> {
  type: 'ENTITY_DATA';
  direction: 'page-to-devtools';
}

/** 获取分支列表命令。 */
export interface GetBranchesMessage extends DevToolsMessage<null> {
  type: 'GET_BRANCHES';
  direction: 'devtools-to-page';
}

/** 分支列表响应。 */
export interface BranchesMessage extends DevToolsMessage<unknown[]> {
  type: 'BRANCHES';
  direction: 'page-to-devtools';
}

/** 切换分支命令。 */
export interface SwitchBranchMessage extends DevToolsMessage<string> {
  type: 'SWITCH_BRANCH';
  direction: 'devtools-to-page';
}

/** 创建分支命令。 */
export interface CreateBranchMessage extends DevToolsMessage<string> {
  type: 'CREATE_BRANCH';
  direction: 'devtools-to-page';
}

/** 删除分支命令。 */
export interface DeleteBranchMessage extends DevToolsMessage<string> {
  type: 'DELETE_BRANCH';
  direction: 'devtools-to-page';
}

/** 所有合法 RxDB DevTools 消息。 */
export type AnyDevToolsMessage =
  | HandshakeMessage
  | HandshakeAckMessage
  | EventMessage
  | DisconnectMessage
  | DisconnectRxdbMessage
  | DisconnectRxdbResultMessage
  | ClearMessage
  | PingMessage
  | InspectDbMessage
  | DbInfoMessage
  | QueryEntityMessage
  | EntityDataMessage
  | GetBranchesMessage
  | BranchesMessage
  | SwitchBranchMessage
  | CreateBranchMessage
  | DeleteBranchMessage;

/** 所有允许进入页面命令处理器的消息。 */
export type DevToolsCommandMessage =
  | HandshakeAckMessage
  | DevToolsDisconnectMessage
  | DisconnectRxdbMessage
  | ClearMessage
  | PingMessage
  | InspectDbMessage
  | QueryEntityMessage
  | GetBranchesMessage
  | SwitchBranchMessage
  | CreateBranchMessage
  | DeleteBranchMessage;

const REQUIRED_ENVELOPE_KEYS = ['source', 'direction', 'type', 'payload', 'timestamp', 'sequence'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): boolean {
  const allowedKeys = [...requiredKeys, ...optionalKeys];
  return (
    requiredKeys.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => allowedKeys.includes(key))
  );
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDisconnectRequestPayload(value: unknown): value is { requestId: string } {
  return isRecord(value) && hasExactKeys(value, ['requestId']) && isNonEmptyString(value['requestId']);
}

function isQueryEntityPayload(value: unknown): value is QueryEntityPayload {
  // `namespace` 为可选字段：实体身份是 `namespace:name`，不同 namespace 下允许重名。
  // 旧扩展不带该字段，仍然合法（名称唯一时按该实体处理，有歧义则返回结构化错误）。
  if (!isRecord(value) || !hasExactKeys(value, ['entityName'], ['limit', 'namespace'])) return false;
  if (!isNonEmptyString(value['entityName'])) return false;
  if (Object.hasOwn(value, 'namespace') && !isNonEmptyString(value['namespace'])) return false;
  if (!Object.hasOwn(value, 'limit')) return true;
  return isPositiveSafeInteger(value['limit']) && value['limit'] <= 1000;
}

function isSerializedEvent(value: unknown): value is SerializedEvent {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['id', 'eventType', 'timestamp', 'sequence', 'data']) &&
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['eventType']) &&
    isNonNegativeSafeInteger(value['timestamp']) &&
    isNonNegativeSafeInteger(value['sequence']) &&
    isRecord(value['data'])
  );
}

function isDisconnectStatus(value: unknown): value is DisconnectStatus {
  return value === 'graceful' || value === 'forced' || value === 'failed' || value === 'not-connected';
}

/**
 * 校验断开结果载荷，含 status / success / error 三元语义矩阵。
 *
 * @remarks
 * 只查字段类型是不够的：`{ status: 'graceful', success: false, error: null }`
 * 三个字段各自合法，合起来却自相矛盾 —— UI 要么按 status 显示"已优雅断开"、
 * 要么按 success 显示"失败"，取决于它先读哪个。矩阵在协议边界就把这种消息拒掉。
 *
 * - `graceful` / `forced` / `not-connected`：`success === true` 且 `error === null`
 * - `failed`：`success === false` 且 `error` 为非空字符串
 */
function isDisconnectResultPayload(value: unknown): value is DisconnectRxdbResultMessage['payload'] {
  if (!isRecord(value) || !hasExactKeys(value, ['requestId', 'success', 'error', 'status'])) return false;
  if (!isNonEmptyString(value['requestId']) || typeof value['success'] !== 'boolean') return false;
  if (!isDisconnectStatus(value['status'])) return false;
  if (value['status'] === 'failed') return value['success'] === false && isNonEmptyString(value['error']);
  return value['success'] === true && value['error'] === null;
}

function isDevToolsCapability(value: unknown): value is DevToolsCapability {
  return value === 'none' || value === 'readonly' || value === 'full';
}

function isHandshakePayload(value: unknown): value is HandshakePayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['protocolVersion', 'capabilities']) &&
    value['protocolVersion'] === DEVTOOLS_PROTOCOL_VERSION &&
    isDevToolsCapability(value['capabilities'])
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isDbInfoEntity(value: unknown): value is DbInfoEntity {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['name', 'namespace', 'encryptedFields']) &&
    isNonEmptyString(value['name']) &&
    isNonEmptyString(value['namespace']) &&
    isStringArray(value['encryptedFields'])
  );
}

function isDbInfoPayload(value: unknown): value is DbInfoPayload {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['version', 'dbName', 'capabilities', 'entities']) &&
    typeof value['version'] === 'string' &&
    typeof value['dbName'] === 'string' &&
    isDevToolsCapability(value['capabilities']) &&
    Array.isArray(value['entities']) &&
    value['entities'].every(isDbInfoEntity)
  );
}

/**
 * 校验实体查询结果载荷，含 error / data 的语义矩阵。
 *
 * @remarks
 * `{ error: '实体不存在', data: [ … ] }` 两个字段各自合法、合起来自相矛盾：
 * 面板要么显示错误、要么渲染这些行，取决于它先读哪个。失败必须是空结果。
 */
function isEntityDataPayload(value: unknown): value is EntityDataPayload {
  if (!isRecord(value) || !hasExactKeys(value, ['entityName', 'error', 'data'], ['_meta', 'namespace'])) return false;
  if (!isNonEmptyString(value['entityName']) || !Array.isArray(value['data'])) return false;
  if (Object.hasOwn(value, 'namespace') && !isNonEmptyString(value['namespace'])) return false;
  if (value['error'] !== null && !isNonEmptyString(value['error'])) return false;
  if (value['error'] !== null && value['data'].length > 0) return false;
  if (!Object.hasOwn(value, '_meta')) return true;

  const meta = value['_meta'];
  if (!isRecord(meta) || !hasExactKeys(meta, [], ['encryptedFields', 'errorCode'])) return false;
  if (Object.hasOwn(meta, 'encryptedFields') && !isStringArray(meta['encryptedFields'])) return false;
  return !Object.hasOwn(meta, 'errorCode') || isNonEmptyString(meta['errorCode']);
}

function hasValidEnvelope(value: Record<string, unknown>): boolean {
  if (!hasExactKeys(value, REQUIRED_ENVELOPE_KEYS, ['tabId'])) return false;
  if (value['source'] !== RXDB_DEVTOOLS_MESSAGE) return false;
  if (value['direction'] !== 'page-to-devtools' && value['direction'] !== 'devtools-to-page') return false;
  if (!isNonNegativeSafeInteger(value['timestamp']) || !isNonNegativeSafeInteger(value['sequence'])) return false;
  if (Object.hasOwn(value, 'tabId') && !isPositiveSafeInteger(value['tabId'])) return false;
  return true;
}

/** 严格校验消息 envelope、方向、已知类型和命令 payload。 */
export function isDevToolsMessage(data: unknown): data is AnyDevToolsMessage {
  if (!isRecord(data) || !hasValidEnvelope(data)) return false;

  const direction = data['direction'];
  const payload = data['payload'];
  switch (data['type']) {
    case 'HANDSHAKE':
      // `null` 是弃用窗口内的旧连接器形态，新连接器发 HandshakePayload
      return direction === 'page-to-devtools' && (payload === null || isHandshakePayload(payload));
    case 'HANDSHAKE_ACK':
    case 'CLEAR':
    case 'PING':
    case 'INSPECT_DB':
    case 'GET_BRANCHES':
      return direction === 'devtools-to-page' && payload === null;
    case 'EVENT':
      return direction === 'page-to-devtools' && isSerializedEvent(payload);
    case 'DISCONNECT':
      return payload === null;
    case 'DISCONNECT_RXDB':
      return direction === 'devtools-to-page' && isDisconnectRequestPayload(payload);
    case 'DISCONNECT_RXDB_RESULT':
      return direction === 'page-to-devtools' && isDisconnectResultPayload(payload);
    case 'DB_INFO':
      // null` = 连接器没有实体元数据，与「实体列表为空」是两件事
      return direction === 'page-to-devtools' && (payload === null || isDbInfoPayload(payload));
    case 'QUERY_ENTITY':
      return direction === 'devtools-to-page' && isQueryEntityPayload(payload);
    case 'ENTITY_DATA':
      return direction === 'page-to-devtools' && isEntityDataPayload(payload);
    case 'BRANCHES':
      return direction === 'page-to-devtools' && Array.isArray(payload);
    case 'SWITCH_BRANCH':
    case 'CREATE_BRANCH':
    case 'DELETE_BRANCH':
      return direction === 'devtools-to-page' && isNonEmptyString(payload);
    default:
      return false;
  }
}

/**
 * 判断合法消息是否为允许进入页面处理器的命令。
 *
 * @remarks
 * **这不是权限检查。** `direction` 只是发送方自述的字段，同源脚本可以随便填。
 * 真正的权限边界是 {@link DevToolsCapability}。
 */
export function isDevToolsCommandMessage(message: AnyDevToolsMessage): message is DevToolsCommandMessage {
  return message.direction === 'devtools-to-page';
}

/**
 * 按消息类型取出对应的消息定义。
 *
 * @remarks
 * 用 `Extract` 而不是 `{ [M in AnyDevToolsMessage as M['type']]: M }`：后者遇到
 * `DISCONNECT`（page→devtools 与 devtools→page 各一条）会因键重复只保留其中一条，
 * 悄悄把另一个合法方向判成非法。
 */
export type MessageOfType<T extends MessageType> = Extract<AnyDevToolsMessage, { type: T }>;

/**
 * 创建 RxDB DevTools 消息。
 *
 * @param type - 消息类型；它同时决定了 `direction` 与 `payload` 的合法取值
 * @param direction - 该类型允许的方向
 * @param payload - 该类型定义的载荷
 * @param sequence - 单调递增的会话内序号，必须是非负安全整数
 * @returns 与 `type` 精确对应的消息对象
 * @throws RangeError 当 `sequence` 不是非负安全整数时
 *
 * @remarks
 * 出站侧的唯一真相源是 {@link AnyDevToolsMessage}：工厂的 `direction`/`payload`
 * 由 `type` 推导而来，**本包自己的 {@link isDevToolsMessage} 会接受本工厂的任何产出**。
 * 在此之前四个形参彼此独立，`createMessage('DELETE_BRANCH', 'page-to-devtools', 123, -1)`
 * 能编译通过却会被自家 guard 判为非法。
 *
 * `sequence` 无法在类型层排除负数，因此在运行时 fail-fast —— 让它流出去只会
 * 变成一条被接收端静默丢弃的消息，现场与病因完全对不上。
 */
export function createMessage<T extends MessageType>(
  type: T,
  direction: MessageOfType<T>['direction'],
  payload: MessageOfType<T>['payload'],
  sequence: number
): MessageOfType<T> {
  if (!isNonNegativeSafeInteger(sequence)) {
    throw new RangeError(`DevTools message sequence must be a non-negative safe integer, received: ${sequence}`);
  }
  // 泛型 T 下 TS 无法把字面量对象收窄到 Extract<...> 的具体成员；
  // 形参签名已经保证了 type/direction/payload 三者互相匹配，这里只是把结论说给编译器听。
  return {
    source: RXDB_DEVTOOLS_MESSAGE,
    direction,
    type,
    payload,
    timestamp: Date.now(),
    sequence
  } as MessageOfType<T>;
}
