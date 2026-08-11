/**
 * @fileoverview 多 tab 通信网关（RxDBTabsGateway）的消息契约
 *
 * RxDB 用 BroadcastChannel 在多个浏览器 tab 之间转发实体事件、握手与首连时间。
 * 本文件定义经线缆传输的**载荷形状**；实际序列化、leader election、hello 协议
 * 见 `./RxDBTabsGateway.ts`。
 *
 * 全部消息都带 `messageId`（`clientId:timestamp` 形式）—— BroadcastChannel
 * 在某些浏览器里对同一 tab 内的消息也会再投递一次，去重靠它。
 */

import { RxDBEvent } from '../rxdb-events.js';

/** 跨 tab 转发的实体事件载荷 */
export const GATEWAY_MESSAGE_ENTITY_EVENT = 'entity_event' as const;
/** 新 tab 上线广播的握手消息 */
export const GATEWAY_MESSAGE_HELLO = 'hello' as const;
/** 当前 leader 应答的"首连时间"消息 */
export const GATEWAY_MESSAGE_FIRST_CONNECTED_AT = 'first_connected_at' as const;

/**
 * 网关消息基础接口
 *
 * 全部消息类型都基于它扩展；`messageId` 用于接收端去重，
 * `clientId` 用于 leader 选举投票与"`origin: 'cross-tab'`"标记的回溯。
 */
interface GatewayMessageBase {
  /** 消息唯一标识（clientId:timestamp）用于去重 */
  messageId: string;
  /** 发送者的 clientId */
  clientId: string;
}

/**
 * 实体事件消息
 *
 * 载荷是完整 {@link RxDBEvent}（含 `entities` 与可选 `origin` 标记），
 * 接收端在转发给本 tab 的事件派发器之前会按 {@link isCrossTabEvent} 识别来源，
 * 避免本地刚刚写完的变更被自己的广播回声再次派发。
 */
export interface GatewayEntityEventMessage extends GatewayMessageBase {
  type: typeof GATEWAY_MESSAGE_ENTITY_EVENT;
  event: RxDBEvent;
}

/**
 * Hello 消息（新 tab 请求元数据）
 *
 * 新 tab 上线后会立即广播 hello，已在线的 leader 收到后回一条
 * {@link GatewayFirstConnectedAtMessage} 并把 hello 列表缓存，
 * 给后续的 leader 选举投票提供"我在场的最近证据"。
 */
export interface GatewayHelloMessage extends GatewayMessageBase {
  type: typeof GATEWAY_MESSAGE_HELLO;
}

/**
 * 首次连接时间响应消息
 *
 * 只由 leader 应答。`firstConnectedAt` 是 ISO 字符串，避免时区歧义；
 * 接收端用 `new Date(...)` 还原成 `Date` 实例。
 */
export interface GatewayFirstConnectedAtMessage extends GatewayMessageBase {
  type: typeof GATEWAY_MESSAGE_FIRST_CONNECTED_AT;
  /** ISO 时间字符串 */
  firstConnectedAt: string;
}

/**
 * 网关消息联合类型（Discriminated Union）
 *
 * 用 `type` 字段做判别（不是 `instanceof`）：BroadcastChannel 的结构化克隆
 * 会丢原型，跨 tab 收到的消息 `constructor` 都是 `Object`，所以只信 `type`。
 */
export type GatewayMessage = GatewayEntityEventMessage | GatewayHelloMessage | GatewayFirstConnectedAtMessage;
