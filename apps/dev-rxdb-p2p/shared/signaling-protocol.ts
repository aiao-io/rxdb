/**
 * 信令协议：浏览器与信令 Durable Object 之间的 WebSocket 消息。
 *
 * @remarks
 * 第一条消息必须是 `hello`，带 Supabase access token 与本机登记的设备；认证通过后服务端回 `welcome`，
 * 此后在线设备变化以整表 `presence` 推送。`connect` 请求服务端为一条新连接分配 `connectionId`，
 * 并给两端各发一张绑定它的票据；SDP / ICE 经 `signal` 按实例键转发，服务端不解析内容。
 * 两端解析对方的消息都按白名单校验，形状不对的整条丢弃。浏览器发来的字段另有长度上限：
 * 实例键原样进每一条 presence，不设上限时一个用户就能让全房间每次收到他塞进来的整段字符串。
 */

/** 单条 SDP / ICE 负载的字符数上限。 */
export const MAX_SIGNAL_PAYLOAD_LENGTH = 64 * 1024;

/** access token 的字符数上限：Supabase 的 JWT 一般一两千字符，留出自定义声明的余量。 */
export const MAX_ACCESS_TOKEN_LENGTH = 16 * 1024;

/** 设备、实例与连接标识的字符数上限：本项目里都是 36 字符的 UUID；与会话层实例标识的上限一致。 */
export const MAX_SIGNALING_ID_LENGTH = 128;

/**
 * 浏览器发来的一条原始消息的字符数上限，解析 JSON 之前先挡。
 *
 * @remarks
 * 负载本身是一段 JSON 文本，整条消息再编码一次时其中的引号与反斜杠都要转义，最坏翻倍；另留 1 KiB 给其余字段。
 */
export const MAX_CLIENT_MESSAGE_LENGTH = 2 * MAX_SIGNAL_PAYLOAD_LENGTH + 1024;

/** 信令里的一台在线设备（一个运行实例）。 */
export interface SignalingPeer {
  /** 实例键：运行实例标识，presence 与转发都按它寻址。 */
  readonly key: string;
  /** 认证主体（Supabase `auth.uid()`）。 */
  readonly principal: string;
  /** 用户的展示名（登录邮箱）。 */
  readonly userName: string;
  /** 设备标识（`p2p.devices.id`）。 */
  readonly deviceId: string;
  /** 设备名，取自设备登记。 */
  readonly deviceName: string;
}

/** 转发的 WebRTC 协商负载类型。 */
export type SignalKind = 'offer' | 'answer' | 'ice';

/** 建连时本端的角色：发起方创建 DataChannel 与 offer。 */
export type SignalingRole = 'initiator' | 'responder';

/** 服务端报告的错误；`unauthorized` 与 `server_error`（认证宿主不可达、在线设备已满）之后服务端关闭连接。 */
export type SignalingErrorCode = 'unauthorized' | 'bad_request' | 'peer_unavailable' | 'server_error';

/** 浏览器发给信令服务的消息。 */
export type ClientMessage =
  | {
      readonly type: 'hello';
      readonly accessToken: string;
      readonly deviceId: string;
      readonly instanceId: string;
    }
  | { readonly type: 'connect'; readonly to: string }
  | {
      readonly type: 'signal';
      readonly to: string;
      readonly connectionId: string;
      readonly kind: SignalKind;
      readonly payload: string;
    };

/** 信令服务发给浏览器的消息。 */
export type ServerMessage =
  | {
      readonly type: 'welcome';
      readonly self: SignalingPeer;
      readonly peers: readonly SignalingPeer[];
      /** 验票公钥（Ed25519 JWK）。 */
      readonly ticketKey: JsonWebKey;
    }
  | { readonly type: 'presence'; readonly peers: readonly SignalingPeer[] }
  | {
      readonly type: 'connection';
      readonly connectionId: string;
      readonly role: SignalingRole;
      readonly peer: SignalingPeer;
      /** 本端的连接票据，作为会话 hello 的凭据。 */
      readonly ticket: string;
    }
  | {
      readonly type: 'signal';
      readonly from: string;
      readonly connectionId: string;
      readonly kind: SignalKind;
      readonly payload: string;
    }
  | { readonly type: 'error'; readonly code: SignalingErrorCode; readonly message: string };

type Fields = Record<string, unknown>;
type Validator = (message: Fields) => boolean;

const SIGNAL_KINDS: ReadonlySet<unknown> = new Set<SignalKind>(['offer', 'answer', 'ice']);
const ROLES: ReadonlySet<unknown> = new Set<SignalingRole>(['initiator', 'responder']);
const ERROR_CODES: ReadonlySet<unknown> = new Set<SignalingErrorCode>([
  'unauthorized',
  'bad_request',
  'peer_unavailable',
  'server_error'
]);

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isToken = (value: unknown): boolean => isText(value) && value.length <= MAX_ACCESS_TOKEN_LENGTH;
const isId = (value: unknown): boolean => isText(value) && value.length <= MAX_SIGNALING_ID_LENGTH;
const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isPayload = (value: unknown): boolean => typeof value === 'string' && value.length <= MAX_SIGNAL_PAYLOAD_LENGTH;

const PEER_FIELDS = ['key', 'principal', 'userName', 'deviceId', 'deviceName'] as const;

const isPeer = (value: unknown): value is SignalingPeer =>
  isFields(value) && PEER_FIELDS.every(field => isText(value[field]));
const isPeerList = (value: unknown): boolean => Array.isArray(value) && value.every(isPeer);

const CLIENT_RULES: Readonly<Record<string, Validator>> = {
  hello: message => isToken(message['accessToken']) && isId(message['deviceId']) && isId(message['instanceId']),
  connect: message => isId(message['to']),
  signal: message =>
    isId(message['to']) &&
    isId(message['connectionId']) &&
    SIGNAL_KINDS.has(message['kind']) &&
    isPayload(message['payload'])
};

const SERVER_RULES: Readonly<Record<string, Validator>> = {
  welcome: message => isPeer(message['self']) && isPeerList(message['peers']) && isFields(message['ticketKey']),
  presence: message => isPeerList(message['peers']),
  connection: message =>
    isText(message['connectionId']) &&
    ROLES.has(message['role']) &&
    isPeer(message['peer']) &&
    isText(message['ticket']),
  signal: message =>
    isText(message['from']) &&
    isText(message['connectionId']) &&
    SIGNAL_KINDS.has(message['kind']) &&
    isPayload(message['payload']),
  error: message => ERROR_CODES.has(message['code']) && typeof message['message'] === 'string'
};

const parseWith = (raw: string, rules: Readonly<Record<string, Validator>>): Fields | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isFields(value) || typeof value['type'] !== 'string') return null;
  const rule = Object.hasOwn(rules, value['type']) ? rules[value['type']] : undefined;
  return rule?.(value) ? value : null;
};

/** 解析浏览器发来的消息；超长、不在白名单内或字段不合法返回 null。 */
export const parseClientMessage = (raw: string): ClientMessage | null =>
  raw.length > MAX_CLIENT_MESSAGE_LENGTH ? null : (parseWith(raw, CLIENT_RULES) as ClientMessage | null);

/** 解析信令服务发来的消息；不在白名单内或字段不合法返回 null。 */
export const parseServerMessage = (raw: string): ServerMessage | null =>
  parseWith(raw, SERVER_RULES) as ServerMessage | null;
