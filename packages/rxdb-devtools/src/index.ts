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
  /** 连接器所需的 RxDB 能力子集；真实 `RxDB` 实例可直接传入 `init`。 */
  DevToolsRxDB,
  /** 实体元数据读取函数，通常直接传 `@aiao/rxdb` 的 `getEntityMetadata`。 */
  GetEntityMetadataFn
} from './connector.js';

export {
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
  /** 握手载荷：协议版本 + 能力档。 */
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
