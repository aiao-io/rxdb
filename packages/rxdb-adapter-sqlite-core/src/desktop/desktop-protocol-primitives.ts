/**
 * 桌面线协议解析的共用零件：尺寸上限与最基础的几个读取器。
 *
 * @remarks
 * 本模块**不进任何公开入口**，它只是 {@link module:desktop-host-protocol} 与
 * {@link module:desktop-pglite-protocol} 之间的私有共享层。抽出来的理由只有一条：
 * 两套协议都要判 `sessionId` 是不是 host 签发的 UUID，而这个判据一旦分成两份，
 * 其中一份放宽（比如某天为了兼容某个 host 改成只判非空字符串）不会有任何信号——
 * 两套协议各自的测试都还是绿的，直到某条伪造的 sessionId 从松的那一侧进到 host 里。
 *
 * 尺寸上限跟着一起搬，是因为 `readSql` 要用它们；把常量留在原处会让本模块反向
 * 依赖 `desktop-host-protocol.js`，而那边又要 import 本模块，形成循环。
 * 公开名字不变：`desktop-host-protocol.ts` 原样再导出，桶文件一行都不用改。
 *
 * @module desktop-protocol-primitives
 */

import { RxDBAdapterDesktopError } from './desktop-error.js';

/** 单条 SQL 文本的长度上限。 */
export const DESKTOP_HOST_MAX_SQL_LENGTH = 1_000_000;

/** 单条请求允许的绑定参数个数上限。 */
export const DESKTOP_HOST_MAX_BINDINGS = 100_000;

/** 单个 blob 绑定参数的字节上限。 */
export const DESKTOP_HOST_MAX_BLOB_BYTES = 64 * 1024 * 1024;

/**
 * host 签发的标识符形状：小写或大写十六进制的 UUID。
 *
 * @remarks
 * 会话、写入令牌、锁、事务 ID 全用同一个形状，因此它们在任何一条协议上都不可能
 * 被一个「看起来像 id 的字符串」蒙混过去。renderer 只可能从 host 的应答里得到这类值，
 * 它自己造不出通过校验又确实存在的那一个。
 */
const HOST_ISSUED_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 构造一个协议违规错误。
 *
 * @param message - 面向开发者的描述，不含错误码前缀
 * @returns code 为 `protocol_violation` 的错误
 */
export const violation = (message: string): RxDBAdapterDesktopError =>
  new RxDBAdapterDesktopError('protocol_violation', message);

/**
 * 把未校验的入参收窄成普通对象。
 *
 * @param value - 未校验的 IPC 入参
 * @returns 同一个值，类型收窄为字符串索引的记录
 * @throws 不是普通对象时抛 `protocol_violation`
 */
export const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw violation('request must be a plain object');
  }
  return value as Record<string, unknown>;
};

/**
 * 读取一个 host 签发的 UUID 字段。
 *
 * @param record - 已收窄的请求对象
 * @param key - 字段名，出现在错误消息里
 * @returns 校验通过的 UUID
 * @throws 缺失或形状不符时抛 `protocol_violation`
 */
export const readUuid = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  if (typeof value !== 'string' || !HOST_ISSUED_ID_PATTERN.test(value)) {
    throw violation(`${key} must be a UUID string issued by the host`);
  }
  return value;
};

/**
 * 读取一个可省略的 host 签发 UUID 字段。
 *
 * @remarks
 * 只有「整个字段缺席」算省略。显式传 `null` 会被当成违规而不是当成省略：
 * 那两者在调用方那里含义不同（一个是「没有事务」，一个多半是某个变量忘了赋值），
 * 把它们并成一路会让后者静默降级成「不在事务里执行」——一条本该进事务的写入
 * 于是独立提交了，而调用方收到的是成功。
 *
 * @param record - 已收窄的请求对象
 * @param key - 字段名
 * @returns 校验通过的 UUID；字段缺席时为 `undefined`
 * @throws 存在但形状不符时抛 `protocol_violation`
 */
export const readOptionalUuid = (record: Record<string, unknown>, key: string): string | undefined =>
  record[key] === undefined ? undefined : readUuid(record, key);

/**
 * 读取会话 ID。
 *
 * @param record - 已收窄的请求对象
 * @returns 校验通过的会话 ID
 * @throws 缺失或形状不符时抛 `protocol_violation`
 */
export const readSessionId = (record: Record<string, unknown>): string => readUuid(record, 'sessionId');

/**
 * 读取 SQL 文本。
 *
 * @param record - 已收窄的请求对象
 * @returns 校验通过的 SQL
 * @throws 不是字符串或超长时抛 `protocol_violation`
 */
export const readSql = (record: Record<string, unknown>): string => {
  const sql = record['sql'];
  if (typeof sql !== 'string') throw violation('sql must be a string');
  if (sql.length > DESKTOP_HOST_MAX_SQL_LENGTH) {
    throw violation(`sql exceeds ${DESKTOP_HOST_MAX_SQL_LENGTH} characters`);
  }
  return sql;
};
