import type { SerializedEvent } from './types.js';

let eventIdCounter = 0;

/** DevTools wire value 契约版本。 */
export const DEVTOOLS_WIRE_VERSION = 1 as const;

/** 仅供 DevTools wire protocol 使用的精确 bigint 表示。 */
export interface DevToolsBigIntValue {
  $rxdb: typeof DEVTOOLS_WIRE_VERSION;
  type: 'bigint';
  value: string;
}

/** 仅供 DevTools wire protocol 使用的二进制表示。 */
export interface DevToolsBinaryValue {
  $rxdb: typeof DEVTOOLS_WIRE_VERSION;
  type: 'binary';
  encoding: 'base64url';
  value: string;
  byteLength: number;
}

/** 仅供 DevTools wire protocol 使用的非法 Date 表示。 */
export interface DevToolsInvalidDateValue {
  $rxdb: typeof DEVTOOLS_WIRE_VERSION;
  type: 'invalid-date';
}

/** DevTools wire protocol 支持的带版本非 JSON 值。 */
export type DevToolsWireValue = DevToolsBigIntValue | DevToolsBinaryValue | DevToolsInvalidDateValue;

/** 生成唯一事件 ID */
function generateEventId(): string {
  return `evt_${Date.now()}_${++eventIdCounter}`;
}

/**
 * 加密信封判定。
 *
 * @remarks
 * **必须与 `@aiao/rxdb-adapter-encrypted` 的 `envelope.ts` 逐段一致。**
 * 这里刻意不 import 那个包：devtools 会被所有消费者装上，
 * 把加密适配器拖进依赖图不可接受。代价是有两份正则，
 * 因此 `serializer.envelope-contract.spec.ts` 用**真实 codec 产出的密文**
 * 和权威实现拒绝的相似串双向校对这份副本。
 *
 * 旧版本曾写成 `^[0-9]+\|[A-Z0-9]+\|…` 这种"六段 pipe 就算密文"的宽松式，
 * 于是 `1|A1|b|c||d` 这类普通业务字符串被替换成占位符 —— 调试工具吃掉了要调试的数据。
 * 段长与字面量都来自权威实现：版本 `[12]`（当前 2，解码器保留 1）、算法 `AGCM256`、
 * kid 11 字符、iv 16 字符、tag 22 字符（base64url 无填充）。
 *
 * 上游 `ENVELOPE_VERSION` 若继续递增，这里的 `[12]` 必须同步放宽，
 * 否则新版本密文会从"遮罩"退化成"明文广播"。跨包契约测试就是为了在那一刻变红。
 */
const ENVELOPE_REGEX = /^[12]\|AGCM256\|[A-Za-z0-9_-]{11}\|[A-Za-z0-9_-]{16}\|[A-Za-z0-9_-]*\|[A-Za-z0-9_-]{22}$/;

const MASKED_ENVELOPE = '[encrypted]' as const;

/** 将 metadata 声明的顶层加密字段替换为固定占位符。 */
export function maskEncryptedFields(value: unknown, encryptedFields: readonly string[]): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || encryptedFields.length === 0) {
    return value;
  }

  const source = value as Record<string, unknown>;
  const encrypted = new Set(encryptedFields);
  const masked: Record<string, unknown> = {};
  for (const field of Object.keys(source)) {
    if (!encrypted.has(field)) masked[field] = source[field];
  }
  for (const field of encryptedFields) {
    if (Object.hasOwn(source, field)) {
      masked[field] = MASKED_ENVELOPE;
    }
  }
  return masked;
}

/**
 * 安全序列化对象，处理循环引用和非序列化属性
 *
 * @remarks
 * `path` 记录的是**当前递归路径**而非「访问过的所有对象」。用后者判环是经典错误：
 * 同一个对象在树中并列出现两次（`patch` 与 `inversePatch` 引用同一嵌套对象、
 * 批量事件里同一实体出现在多条记录中）根本不构成环，却会被误判成 `[Circular]`。
 */
function safeSerialize(obj: unknown, path = new Set<object>()): unknown {
  if (obj === null || obj === undefined) return obj;

  const type = typeof obj;

  if (type === 'string') {
    return ENVELOPE_REGEX.test(obj as string) ? MASKED_ENVELOPE : obj;
  }

  if (type === 'number' || type === 'boolean') {
    return obj;
  }

  if (type === 'bigint') {
    return {
      $rxdb: DEVTOOLS_WIRE_VERSION,
      type: 'bigint',
      value: String(obj)
    } satisfies DevToolsBigIntValue;
  }

  if (type === 'function' || type === 'symbol') {
    return undefined;
  }

  if (obj instanceof Date) {
    // `new Date('x').toISOString()` 抛 RangeError。序列化跑在 RxDB 的 event listener 里，
    // 抛出去会打断整条事件派发 —— 一个坏时间戳让整个事件到不了 DevTools。
    // 非法时间给一个确定的、可诊断的表示，不抛。
    if (Number.isNaN(obj.getTime())) {
      return { $rxdb: DEVTOOLS_WIRE_VERSION, type: 'invalid-date' } satisfies DevToolsInvalidDateValue;
    }
    return obj.toISOString();
  }

  if (obj instanceof Uint8Array) {
    const bytes = new Uint8Array(obj);
    return {
      $rxdb: DEVTOOLS_WIRE_VERSION,
      type: 'binary',
      encoding: 'base64url',
      value: toBase64Url(bytes),
      byteLength: bytes.byteLength
    } satisfies DevToolsBinaryValue;
  }

  if (type !== 'object') {
    return undefined;
  }

  if (path.has(obj as object)) {
    return '[Circular]';
  }
  path.add(obj as object);
  try {
    return serializeObject(obj, path);
  } finally {
    // 出栈即移除：只有仍在当前路径上的对象才算环
    path.delete(obj as object);
  }
}

function toBase64Url(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 8192)));
  }
  return globalThis.btoa(chunks.join('')).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** 序列化 object 分支：数组、已知内建类型与普通对象。 */
function serializeObject(obj: unknown, path: Set<object>): unknown {
  if (Array.isArray(obj)) {
    return obj.map(item => safeSerialize(item, path)).filter(item => item !== undefined);
  }
  // message / stack 是不可枚举的自有属性，Object.keys 拿不到；同步失败事件里
  // error 是唯一有价值的字段，退化成 {} 等于调试工具在最关键的路径上什么都不说。
  //
  // `cause` 同理且更关键：适配器把底层驱动异常包成 RxDBError 时，最接近根因的诊断
  // 全在 cause 链上。走同一个 safeSerialize + 同一条 path，成环的 cause
  // （`a.cause = b; b.cause = a`）会降级为 '[Circular]' 而不是爆栈。
  if (obj instanceof Error) {
    const serialized: Record<string, unknown> = { name: obj.name, message: obj.message, stack: obj.stack };
    if (obj.cause !== undefined) serialized['cause'] = safeSerialize(obj.cause, path);
    return serialized;
  }
  // Map / Set 的内容根本不在自有属性里
  if (obj instanceof Map) {
    return {
      _type: 'Map',
      entries: Array.from(obj, ([key, value]) => [safeSerialize(key, path), safeSerialize(value, path)])
    };
  }
  if (obj instanceof Set) {
    return { _type: 'Set', values: Array.from(obj, value => safeSerialize(value, path)) };
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj as object)) {
    const value = (obj as Record<string, unknown>)[key];
    const serialized = safeSerialize(value, path);
    if (serialized !== undefined) {
      result[key] = serialized;
    }
  }
  return result;
}

/**
 * 将运行时值转换为脱离原对象且 JSON 安全的 DevTools wire 值。
 *
 * @param value - 作为只读诊断信息公开的运行时值。
 * @returns JSON 安全的数据；bigint 和二进制叶节点使用带版本的信封。
 */
export function serializeDevToolsValue(value: unknown): unknown {
  return safeSerialize(value);
}

/**
 * 序列化 RxDB 事件
 */
export function serialize(event: { type: string } & Record<string, unknown>, sequence: number): SerializedEvent {
  const eventObj = event as Record<string, unknown>;
  const { type, ...rest } = eventObj;

  return {
    id: generateEventId(),
    eventType: type as string,
    timestamp: Date.now(),
    sequence,
    data: serializeDevToolsValue(rest) as Record<string, unknown>
  };
}

/** 重置事件 ID 计数器（用于测试） */
export function resetEventIdCounter(): void {
  eventIdCounter = 0;
}
