/**
 * @fileoverview RxDB DevTools 集成包 —— 页面侧连接器与 `window.postMessage` 线协议。
 *
 * @remarks
 * 入口导出的是**协议的完整表面**：连接器 + 消息类型 + 类型守卫 + 消息工厂。
 * DevTools 扩展与本包共用这一套定义，任何一侧自己重写协议形状都会在版本漂移时
 * 静默失配（一侧多一个字段，另一侧的 guard 把整条消息判非法却不报错）。
 * 因此新增消息类型时，`types.ts` 与本文件必须一并更新。
 *
 * @module @aiao/rxdb-devtools
 */

export {
  /** 建浏览器传输（window 总线 + MessageChannel 私有端口）。 */
  createWindowConnectorTransport
} from './connector-transport.js';
export type {
  /** connector 传输层抽象；Tauri / 其它无共享 window 的宿主注入自己的实现。 */
  DevToolsConnectorTransport
} from './connector-transport.js';
export {
  /** 页面侧连接器：订阅 RxDB 事件、应答 DevTools 命令。 */
  DevToolsConnector,
  /** 连接器订阅的 RxDB 事件类型清单（已剔除会重复上报的事件）。 */
  RXDB_EVENT_TYPES,
  /** 获取或创建全局唯一连接器；同一页多次调用返回同一实例。 */
  getDevToolsConnector,
  /** 重置全局连接器（先断开旧实例）；仅用于测试与热重载。 */
  resetDevToolsConnector
} from './connector.js';
export type {
  /** 连接器读取的实体元数据形状；`@aiao/rxdb` 的 `EntityMetadata` 可直接赋值。 */
  DevToolsEntityMetadata,
  /** 连接器配置项。 */
  DevToolsOptions,
  /** 原生宿主的 provider 装配端口；随 {@link DevToolsOptions.providers} 注入。 */
  DevToolsProviderOptions,
  /** 连接器所需的 RxDB 能力子集；真实 `RxDB` 实例可直接传入 `init`。 */
  DevToolsRxDB,
  /** 实体元数据读取函数，通常直接传 `@aiao/rxdb` 的 `getEntityMetadata`。 */
  GetEntityMetadataFn
} from './connector.js';

export {
  /** `ENTITY_DATA` 上会出现的全部结构化错误码。 */
  DEVTOOLS_ENTITY_ERROR_CODES,
  /** 线协议版本号，随握手一并告知 DevTools。 */
  DEVTOOLS_PROTOCOL_VERSION,
  /** 消息来源标识符，用于在同源 message 洪流中筛出本协议的消息。 */
  RXDB_DEVTOOLS_MESSAGE,
  /** 按 `type` 推导 `direction` / `payload` 的消息工厂。 */
  createMessage,
  /** 判断已校验消息是否为允许进入页面处理器的命令（**不是**权限检查）。 */
  isDevToolsCommandMessage,
  /** 严格校验 envelope、方向与各类型 payload 的类型守卫。 */
  isDevToolsMessage
} from './types.js';
export type {
  /** 所有合法消息的联合。 */
  AnyDevToolsMessage,
  /** 分支列表响应。 */
  BranchesMessage,
  /** 清空缓冲命令。 */
  ClearMessage,
  /** 创建分支命令。 */
  CreateBranchMessage,
  /** `DB_INFO` 中单个实体的摘要。 */
  DbInfoEntity,
  /** 数据库信息响应。 */
  DbInfoMessage,
  /** 数据库信息响应载荷。 */
  DbInfoPayload,
  /** 删除分支命令。 */
  DeleteBranchMessage,
  /** 页面授予 DevTools 的命令能力档。 */
  DevToolsCapability,
  /** 允许进入页面命令处理器的消息联合。 */
  DevToolsCommandMessage,
  /** `ENTITY_DATA` 的结构化错误码。 */
  DevToolsEntityErrorCode,
  /** 消息 envelope 基础结构。 */
  DevToolsMessage,
  /** 通信断开消息（页面与 DevTools 双向）。 */
  DisconnectMessage,
  /** 请求断开被观测的 RxDB 实例。 */
  DisconnectRxdbMessage,
  /** 断开 RxDB 实例的结果。 */
  DisconnectRxdbResultMessage,
  /** 断开 RxDB 实例的结果载荷。 */
  DisconnectRxdbResultPayload,
  /** 断开走到的路径。 */
  DisconnectStatus,
  /** 实体查询结果。 */
  EntityDataMessage,
  /** 实体查询结果载荷。 */
  EntityDataPayload,
  /** RxDB 事件消息。 */
  EventMessage,
  /** 获取分支列表命令。 */
  GetBranchesMessage,
  /** 握手确认消息。 */
  HandshakeAckMessage,
  /** 握手消息。 */
  HandshakeMessage,
  /** 握手载荷：协议版本 + 能力档（私有信道端口随消息 transfer，不在载荷里）。 */
  HandshakePayload,
  /** 数据库检查命令。 */
  InspectDbMessage,
  /** 消息方向。 */
  MessageDirection,
  /** 按 `type` 取出对应的消息定义。 */
  MessageOfType,
  /** 消息类型字面量联合。 */
  MessageType,
  /** 心跳请求。 */
  PingMessage,
  /** 实体查询命令。 */
  QueryEntityMessage,
  /** 实体查询命令参数。 */
  QueryEntityPayload,
  /** 序列化后的 RxDB 事件。 */
  SerializedEvent,
  /** 切换分支命令。 */
  SwitchBranchMessage
} from './types.js';

export {
  /** 事件缓冲区，未握手期间暂存事件，满时按 FIFO 丢弃最旧的。 */
  EventBuffer
} from './buffer.js';
export {
  /** 会话内单调递增的序号生成器。 */
  SequenceGenerator
} from './sequence.js';
export {
  /** wire 值信封的契约版本。 */
  DEVTOOLS_WIRE_VERSION,
  /** 把 RxDB 事件转成脱离原对象且 JSON 安全的 wire 事件。 */
  serialize,
  /** 把任意运行时值转成 JSON 安全的 wire 值。 */
  serializeDevToolsValue
} from './serializer.js';
export type {
  /** 精确 bigint 的 wire 表示。 */
  DevToolsBigIntValue,
  /** 二进制数据的 wire 表示。 */
  DevToolsBinaryValue,
  /** 非法 `Date` 的 wire 表示。 */
  DevToolsInvalidDateValue,
  /** 所有带版本的非 JSON wire 值。 */
  DevToolsWireValue
} from './serializer.js';

/*
 * ---------------------------------------------------------------------------
 * v2 协议表面（US-904 阶段 B）
 *
 * 这一整段是 v2 数值、状态机与错误联合的唯一真相源：US-904 阶段 C / D 与 US-905 只引用，
 * 不重定义。表面刻意做得宽——面板要构造 REQUEST payload、host 作者要实现 provider 接缝、
 * 中继要在不解析 payload 的前提下转发，任何一个类型不导出，下游就只能照抄一份，
 * 而照抄出来的副本不会随本包演进。
 *
 * 刻意**不导出**：`v2/session.ts`、`v2/transfer.ts` 的状态机与 tombstone 容器，
 * `internal/guards.ts` 的通用 guard。它们是端点的实现细节，下游要的是端点行为，
 * 不是自行驱动状态机的能力——导出即等于允许下游绕开端点复刻一套并行语义。
 * ---------------------------------------------------------------------------
 */

export {
  /** 浏览器 OPFS 传输上限，固定 50 MiB。 */
  DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES,
  /** 分页默认条数。 */
  DEVTOOLS_DEFAULT_PAGE_SIZE,
  /** 单块解码后字节上限，256 KiB。 */
  DEVTOOLS_MAX_CHUNK_BYTES,
  /** 标识符最大长度。 */
  DEVTOOLS_MAX_IDENTIFIER_LENGTH,
  /** 在途 request 上限。 */
  DEVTOOLS_MAX_INFLIGHT_REQUESTS,
  /** 在途 transfer 上限。 */
  DEVTOOLS_MAX_INFLIGHT_TRANSFERS,
  /** 分页最大条数。 */
  DEVTOOLS_MAX_PAGE_SIZE,
  /** 协议版本号上界。 */
  DEVTOOLS_MAX_PROTOCOL_VERSION,
  /** 终态 request ID 的有界墓碑容量。 */
  DEVTOOLS_MAX_REQUEST_TOMBSTONES,
  /** snapshot 规范记录字节上限，32 MiB。 */
  DEVTOOLS_MAX_SNAPSHOT_BYTES,
  /** snapshot 因 epoch 变更重试的次数上限。 */
  DEVTOOLS_MAX_SNAPSHOT_EPOCH_RETRIES,
  /** snapshot 条数上限。 */
  DEVTOOLS_MAX_SNAPSHOT_RECORDS,
  /** `supportedVersions` 的长度上限。 */
  DEVTOOLS_MAX_SUPPORTED_VERSIONS,
  /** `maxTransferBytes` 的取值上界，1 GiB。 */
  DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT,
  /** 终态 transfer ID 的有界墓碑容量。 */
  DEVTOOLS_MAX_TRANSFER_TOMBSTONES,
  /** 单块解码后字节下界。 */
  DEVTOOLS_MIN_CHUNK_BYTES,
  /** 协议版本号下界。 */
  DEVTOOLS_MIN_PROTOCOL_VERSION,
  /** 协商决策窗口，自首次暂存 legacy 握手起算。 */
  DEVTOOLS_NEGOTIATION_WINDOW_MS,
  /** v2 线协议版本号。 */
  DEVTOOLS_PROTOCOL_VERSION_V2,
  /** 非流式请求时限。 */
  DEVTOOLS_REQUEST_TIMEOUT_MS,
  /** snapshot cursor 的无活动过期时间。 */
  DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS,
  /** snapshot 整体时限。 */
  DEVTOOLS_SNAPSHOT_TIMEOUT_MS,
  /** transfer 的无活动时限；只被通过 guard 的帧刷新。 */
  DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS,
  /** transfer 的总时长上限。 */
  DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS
} from './v2/constants.js';

export {
  /** v2 各消息类型允许的方向。 */
  DEVTOOLS_V2_MESSAGE_DIRECTIONS,
  /** v2 消息类型清单。 */
  DEVTOOLS_V2_MESSAGE_TYPES,
  /** 按 `type` 推导方向与 payload 的 v2 消息工厂。 */
  createDevToolsV2Message,
  /** 宽判信封：只认 envelope 层，不看 payload；供中继在不解析 payload 时转发。 */
  isDevToolsV2Envelope,
  /** 严判整帧：envelope + 方向 + 各类型 payload 全部校验。 */
  isDevToolsV2Message
} from './v2/wire.js';
export type {
  /** ERROR 帧载荷。 */
  DevToolsErrorFramePayload,
  /** EVENT 帧载荷。 */
  DevToolsEventPayload,
  /** 握手中宣告的能力档与 provider 声明。 */
  DevToolsHandshakeCapabilities,
  /** PROTOCOL_HELLO 载荷。 */
  DevToolsProtocolHelloPayload,
  /** REQUEST 帧载荷。 */
  DevToolsRequestPayload,
  /** RESPONSE 帧载荷。 */
  DevToolsResponsePayload,
  /** TRANSFER_CHUNK 帧载荷。 */
  DevToolsTransferChunkPayload,
  /** 只带 transfer 标识的帧载荷（COMPLETE / CANCEL）。 */
  DevToolsTransferIdPayload,
  /** TRANSFER_START 帧载荷。 */
  DevToolsTransferStartPayload,
  /** v2 消息方向。 */
  DevToolsV2Direction,
  /** 按 `type` 收窄的 v2 信封。 */
  DevToolsV2Envelope,
  /** 信封的宽形状；payload 未收窄。 */
  DevToolsV2EnvelopeShape,
  /** v2 HANDSHAKE_ACK 载荷。 */
  DevToolsV2HandshakeAckPayload,
  /** v2 HANDSHAKE 载荷。 */
  DevToolsV2HandshakePayload,
  /** 全部 v2 消息的联合。 */
  DevToolsV2Message,
  /** 构造 v2 消息时的信封选项。 */
  DevToolsV2MessageOptions,
  /** v2 消息类型字面量联合。 */
  DevToolsV2MessageType,
  /** `type` 到 payload 的映射。 */
  DevToolsV2PayloadMap
} from './v2/wire.js';

export {
  /** 控制面错误码清单；与 provider 联合互不相交。 */
  DEVTOOLS_CONTROL_PLANE_ERROR_CODES,
  /** 错误消息的脱敏长度上限。 */
  DEVTOOLS_MAX_ERROR_MESSAGE_LENGTH,
  /** provider 错误码清单；与控制面联合互不相交。 */
  DEVTOOLS_PROVIDER_ERROR_CODES,
  /** 构造脱敏后的错误载荷。 */
  createDevToolsError,
  /** 判断是否为控制面错误码。 */
  isControlPlaneErrorCode,
  /** 判断是否为合法错误载荷。 */
  isDevToolsErrorPayload,
  /** 判断是否为 provider 错误码。 */
  isProviderErrorCode,
  /** 判断消息是否已脱敏（不含路径、长度受限）。 */
  isRedactedErrorMessage
} from './v2/errors.js';
export type {
  /** 控制面错误码。 */
  DevToolsControlPlaneErrorCode,
  /** 两个联合合并后的全部错误码。 */
  DevToolsErrorCode,
  /** 构造错误载荷的可选项。 */
  DevToolsErrorOptions,
  /** wire 上的错误载荷。 */
  DevToolsErrorPayload,
  /** provider 错误码。 */
  DevToolsProviderErrorCode
} from './v2/errors.js';

export {
  /** 各来源在映射时读取的错误字段；host 作者据此填充异常。 */
  DEVTOOLS_PLATFORM_ERROR_KEYS,
  /** 每个 provider 错误码是否可重试。 */
  DEVTOOLS_PROVIDER_ERROR_RETRYABLE,
  /** 由错误码直接构造 provider 错误载荷。 */
  createProviderError,
  /** 把 DOMException / Node error / Rust error 映射到 provider 联合并脱敏。 */
  mapPlatformError
} from './v2/error-mapping.js';
export type {
  /** 平台错误来源。 */
  DevToolsErrorOrigin
} from './v2/error-mapping.js';

export {
  /** 能力档清单。 */
  DEVTOOLS_CAPABILITIES,
  /** 判断是否为合法能力档。 */
  isDevToolsCapability,
  /** 判断实际档位是否满足所需档位。 */
  satisfiesCapability
} from './v2/capability.js';

export {
  /** 各 v2 消息类型所需的最低档位。 */
  DEVTOOLS_MESSAGE_REQUIRED_CAPABILITY,
  /** 各 provider 操作所需的最低档位。 */
  DEVTOOLS_OPERATION_REQUIRED_CAPABILITY,
  /** 档位是否允许某类型入站；拒绝一律静默。 */
  authorizeMessage,
  /** 三层授权 join：档位 × descriptor × 写入开关。 */
  authorizeOperation,
  /** 判断某操作是否属于写入操作。 */
  isMutatingOperation
} from './v2/authorization.js';
export type {
  /** 授权判定结果。 */
  DevToolsAuthorization,
  /** 授权判定输入。 */
  DevToolsAuthorizationInput,
  /** owner 本地配置的写入开关。 */
  DevToolsMutationPolicy
} from './v2/authorization.js';

export {
  /** 基于 `Date.now` 与 `setTimeout` 的时钟实现。 */
  createSystemClock
} from './v2/clock.js';
export type {
  /** 取消一个已排期的定时器。 */
  DevToolsCancelTimer,
  /** 全部时限的唯一注入点。 */
  DevToolsClock
} from './v2/clock.js';

export {
  /** 解码并做重编码往返比较；非规范输入一律拒绝。 */
  decodeCanonicalBase64,
  /** 按 RFC 4648 标准字母表与规范填充编码。 */
  encodeCanonicalBase64
} from './v2/base64.js';
export {
  /** 判断是否为合法 `pageSize`。 */
  isPageSize,
  /** 判断是否为合法 `supportedVersions`（非空、降序、去重、有界）。 */
  isSupportedVersionList
} from './v2/guards.js';
export {
  /** 用 `getRandomValues` 铸造 UUID v4；非安全上下文同样可用。 */
  createSessionId,
  /** 判断是否为规范 UUID v4 文本。 */
  isCanonicalUuidV4,
  /** 判断是否为合法 `requestId` / `transferId`。 */
  isDevToolsIdentifier
} from './v2/ids.js';

export {
  /** connector 侧协商机：eager legacy 握手、逐次响应 HELLO、铸造 session。 */
  createConnectorNegotiation
} from './v2/negotiation-connector.js';
export type {
  /** connector 协商机。 */
  DevToolsConnectorNegotiation,
  /** connector 协商机会发出的消息联合（含 v1 legacy 握手）。 */
  DevToolsConnectorNegotiationMessage,
  /** connector 协商机的构造端口。 */
  DevToolsConnectorNegotiationPorts,
  /** connector 协商机状态。 */
  DevToolsConnectorNegotiationState
} from './v2/negotiation-connector.js';
export {
  /** panel 侧协商机：暂存、补发 HELLO、决策窗口、ACK 所有权、降级标记。 */
  createPanelNegotiation
} from './v2/negotiation-panel.js';
export type {
  /** panel 协商机。 */
  DevToolsPanelNegotiation,
  /** panel 协商机会发出的消息联合。 */
  DevToolsPanelNegotiationMessage,
  /** panel 协商机的构造端口。 */
  DevToolsPanelNegotiationPorts,
  /** panel 协商机状态。 */
  DevToolsPanelNegotiationState
} from './v2/negotiation-panel.js';

export {
  /** panel 侧 v2 数据面客户端：协商 + 请求额度 + 事件订阅 + 上传驱动的组合根。 */
  createDevToolsPanelEndpoint
} from './v2/panel-endpoint.js';
export type {
  /** 一次下载调用的入参。 */
  DevToolsPanelDownloadRequest,
  /** 一次下载的结果；`'delivered-at-source'` 表示字节由源侧自行交付，没有走 wire。 */
  DevToolsPanelDownloadResult,
  /** panel 数据面客户端。 */
  DevToolsPanelEndpoint,
  /** panel 数据面客户端的构造端口。 */
  DevToolsPanelEndpointPorts,
  /** 一次 provider 调用的结果；永不 reject。 */
  DevToolsPanelRequestResult,
  /** 一次上传调用的入参。 */
  DevToolsPanelUploadRequest,
  /** 一次上传的结果；`'sent'` 只表示字节已发出，不表示已提交。 */
  DevToolsPanelUploadResult,
  /** 上传的按需字节来源。 */
  DevToolsPanelUploadSource
} from './v2/panel-endpoint.js';

export {
  /** connector 侧 v2 端点：协商 + session 预算 + 授权 + 传输状态机的组合根。 */
  createDevToolsConnectorEndpoint
} from './v2/endpoint.js';
export type {
  /** connector 侧 v2 端点。 */
  DevToolsConnectorEndpoint,
  /** 端点的构造端口。 */
  DevToolsConnectorEndpointPorts,
  /** 端点访问 provider 的全部接缝。 */
  DevToolsProviderRegistry
} from './v2/endpoint.js';

export {
  /** provider 领域清单。 */
  DEVTOOLS_PROVIDER_DOMAINS,
  /** 各领域的语义 kind 清单。 */
  DEVTOOLS_PROVIDER_KINDS,
  /** 各领域的操作清单。 */
  DEVTOOLS_PROVIDER_OPERATIONS,
  /** provider 运行时清单。 */
  DEVTOOLS_PROVIDER_RUNTIMES,
  /** 领域不可用的原因清单。 */
  DEVTOOLS_UNAVAILABLE_REASONS,
  /** 精确校验单个 descriptor。 */
  isDevToolsProviderDescriptor,
  /** 校验 descriptor 集合：领域唯一、逐个合规。 */
  isDevToolsProviderDescriptorSet,
  /** 判断是否为合法领域。 */
  isDevToolsProviderDomain
} from './provider/descriptor.js';
export type {
  /** 单个领域的 provider 声明。 */
  DevToolsProviderDescriptor,
  /** 领域。 */
  DevToolsProviderDomain,
  /** 按领域收窄的语义 kind。 */
  DevToolsProviderKind,
  /** descriptor 中的数值上限。 */
  DevToolsProviderLimits,
  /** 按领域收窄的操作名。 */
  DevToolsProviderOperation,
  /** 运行时。 */
  DevToolsProviderRuntime,
  /** 领域不可用的原因。 */
  DevToolsUnavailableReason
} from './provider/descriptor.js';

export {
  /** 判断是否为合法 `maxTransferBytes`。 */
  isMaxTransferBytes,
  /** 判断总字节数是否在协商后的上限内。 */
  isWithinTransferLimit,
  /** 在 panel / connector / provider 三方声明中取最小值。 */
  resolveNegotiatedTransferLimit
} from './provider/limits.js';

export {
  /** 判断单个路径段是否合法（非空、无分隔符、不是相对路径记号）。 */
  isValidPathSegment,
  /** 把已校验的段拼回逻辑路径。 */
  joinLogicalPath,
  /** 把 wire 上的路径切成已校验的段；任何一段非法即整条非法。 */
  parseLogicalPath,
  /** 把路径拆成「父目录段 + 末段」；指向根时为 `undefined`。 */
  splitLogicalPath
} from './provider/logical-path.js';

export type {
  /** 分块落盘接收器；只有合法 COMPLETE 会 commit。 */
  DevToolsChunkSink,
  /** 按需读取的分块字节来源；出站传输用它，避免整文件驻留。 */
  DevToolsChunkSource,
  /** 一个领域的 provider 实现。 */
  DevToolsProvider,
  /** provider 操作的结果联合。 */
  DevToolsProviderResult,
  /** 一次 snapshot 采集的结果联合。 */
  DevToolsSnapshotCaptureResult,
  /** 规范 snapshot 记录 tuple。 */
  DevToolsSnapshotRecord,
  /** snapshot 记录来源。 */
  DevToolsSnapshotSide,
  /** snapshot 数据源接缝（904d / 905 实现）。 */
  DevToolsSnapshotSource
} from './provider/types.js';

export {
  /** 建浏览器 OPFS 的 `files` provider。 */
  createDevToolsOpfsFilesProvider
} from './browser/opfs-files-provider.js';
export type {
  /** OPFS 目录项。 */
  DevToolsOpfsEntry,
  /** OPFS `files` provider。 */
  DevToolsOpfsFilesProvider,
  /** OPFS provider 的构造端口。 */
  DevToolsOpfsFilesProviderPorts
} from './browser/opfs-files-provider.js';
export {
  /** 浏览器 settings provider 的 descriptor。 */
  DEVTOOLS_BROWSER_SETTINGS_DESCRIPTOR,
  /** 建浏览器 `settings` provider（`export` 恒回 `export_unsupported`）。 */
  createDevToolsBrowserSettingsProvider
} from './browser/settings-provider.js';
export {
  /** 页内 connector 的默认写入开关。 */
  CONNECTOR_MUTATION_POLICY,
  /** 按本页实际能力装配 provider 接缝。 */
  createConnectorProviders,
  /** 探测本页 OPFS 根目录入口。 */
  resolveBrowserOpfsRoot,
  /** 用页面自己的下载路径保存文件。 */
  saveFileThroughPage
} from './connector-providers.js';
export type {
  /** `database` 领域的接入口；三项缺一不可。 */
  ConnectorDatabasePorts,
  /** provider 接缝的装配输入。 */
  ConnectorProviderPorts,
  /** 页内装配出来的 registry；比裸 registry 多一个订阅回收入口。 */
  ConnectorProviderRegistry
} from './connector-providers.js';
export {
  /** 建原生文件后端的 `files` provider。 */
  createDevToolsNativeFilesProvider
} from './native/native-files-provider.js';
export type {
  /** 同时具备出站字节源与入站落盘口的 `files` provider。 */
  DevToolsFilesProviderWithSource,
  /** 原生目录项。 */
  DevToolsNativeEntry,
  /** 原生 provider 的构造端口。 */
  DevToolsNativeFilesProviderPorts,
  /** provider 需要宿主提供的最小文件能力。 */
  DevToolsNativeFilesystem
} from './native/native-files-provider.js';
export {
  /** 建原生宿主的诊断快照物化来源。 */
  createDevToolsNativeSnapshotSource
} from './native/native-snapshot-source.js';
export type {
  /** 原生快照来源的构造端口。 */
  DevToolsNativeSnapshotPorts,
  /** 快照的一条原始条目。 */
  DevToolsSnapshotEntry,
  /** storage 全局独占锁。 */
  DevToolsSnapshotLock,
  /** 一次锁内任务的结果。 */
  DevToolsSnapshotLockResult
} from './native/native-snapshot-source.js';
export {
  /** Electron settings provider 的 descriptor。 */
  DEVTOOLS_ELECTRON_SETTINGS_DESCRIPTOR,
  /** 建 Electron `settings` provider（`export` 恒回 `export_unsupported`）。 */
  createDevToolsElectronSettingsProvider
} from './native/settings-provider.js';
export {
  /** 建 snapshot 存储：物化、分页、cursor 过期、epoch 重试。 */
  createDevToolsSnapshotStore,
  /** 单条记录的规范字节数。 */
  snapshotRecordBytes,
  /** 记录集合的规范字节总数。 */
  totalSnapshotBytes
} from './provider/snapshot.js';
export type {
  /** 分页游标。 */
  DevToolsSnapshotCursor,
  /** 一页 snapshot 记录。 */
  DevToolsSnapshotPage,
  /** snapshot 存储的构造端口。 */
  DevToolsSnapshotPorts,
  /** snapshot 操作的结果联合。 */
  DevToolsSnapshotResult,
  /** snapshot 存储。 */
  DevToolsSnapshotStore
} from './provider/snapshot.js';
export {
  /** 建 RxDB 的 `database` provider（查询、事件、分支）。 */
  createDevToolsRxdbDatabaseProvider
} from './rxdb/database-provider.js';
export type {
  /** RxDB `database` provider。 */
  DevToolsRxdbDatabaseProvider,
  /** RxDB `database` provider 的构造端口。 */
  DevToolsRxdbDatabaseProviderPorts
} from './rxdb/database-provider.js';
