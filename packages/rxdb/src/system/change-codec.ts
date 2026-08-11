/**
 * @fileoverview RxDB 变更记录（RxDBChange）的字段编码工具
 *
 * 同步层在磁盘 / Supabase 上落地的 `patch` / `entityId` 字段并不是裸
 * JS 值 —— `bigint` 在 JSON 里会丢精度，`Uint8Array` 在结构化克隆里会被
 * 转成普通对象，字符串 ID 还得留出独立空间以防它与"前缀化后的编码 ID"
 * 撞键。本文件统一这些编/解码规则，让 `RxDBChange` 能在不同适配器之间
 * 一致地穿梭。
 *
 * 不变量：
 *
 * - `codecVersion` + `schemaVersion` 永远同行升级；任意一个对不上
 *   立刻抛 {@link UnsupportedRxDBChangeVersionError}，避免"读旧格式
 *   当成新格式"造成的静默错误。
 * - 字符串 ID 走原始值通道，非字符串 ID 用一个**无效 UTF-8 前缀**的字节
 *   序列包裹，让 AES-GCM 的 AAD 与身份键对它们有同样的安全强度。
 * - `PropertyType.encrypted === true` 的列**不**经过本编码（加密已经
 *   自带 envelope），重复编码会把加密后的密文再包一层，配置单元测试
 *   锁定这一点（`change-codec.spec.ts`）。
 */

import type { RxDBEntityId } from '../entity/entity.interface.js';
import { PropertyType } from '../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';

/**
 * 当前编/解码协议的版本号。
 *
 * 任何对外序列化结构（`{codecVersion, schemaVersion, type, value}`）都会带这两个版本，
 * 与 {@link RXDB_CHANGE_CODEC_VERSION} 不一致时一律视为不兼容、抛出
 * {@link UnsupportedRxDBChangeVersionError}。
 */
export const RXDB_CHANGE_CODEC_VERSION = 1 as const;
export const RXDB_CHANGE_SCHEMA_VERSION = 1 as const;
/** 编码后 entityId 的固定前缀，便于反序列化时判断"是不是已被编码"。 */
export const RXDB_CHANGE_ENTITY_ID_PREFIX = '__rxdb_change_id__:' as const;
/** patch 内某个字段是 `bigint` / `binary` 编码值时使用的 key。 */
export const RXDB_CHANGE_VALUE_ENVELOPE_KEY = '$rxdbChangeValue' as const;

const IDENTITY_MAGIC = Uint8Array.of(0xff, 0x52, 0x58);
const IDENTITY_VERSION = 1;
const IDENTITY_NUMBER = 0x6e;
const IDENTITY_BIGINT = 0x62;
const IDENTITY_KEY_PREFIX = 'rxid1:';

type EncodedChangeValue = Readonly<{
  codecVersion: number;
  schemaVersion: number;
  type: 'bigint' | 'binary';
  value: string;
}>;

type EncodedEntityId = Readonly<{
  codecVersion: number;
  schemaVersion: number;
  type: 'string' | 'number' | 'bigint';
  value: string;
}>;

/**
 * 解码时遇到的版本号与 {@link RXDB_CHANGE_CODEC_VERSION} /
 * {@link RXDB_CHANGE_SCHEMA_VERSION} 不一致时抛出。
 *
 * - `codecVersion`：编/解码协议升级时变动；
 * - `schemaVersion`：`patch` 字段的语义升级时变动。
 *
 * 入参收成 `unknown` 是因为数据可能来自任意来源（用户手工录入、外部系统导入），
 * 接住非 number 的输入比假装版本总是 number 更安全。
 */
export class UnsupportedRxDBChangeVersionError extends Error {
  override readonly name = 'UnsupportedRxDBChangeVersionError';

  constructor(codecVersion: unknown, schemaVersion: unknown) {
    super(
      `Unsupported RxDB change codec/schema version: codec=${String(codecVersion)}, schema=${String(schemaVersion)}`
    );
  }
}

/**
 * 断言某个 envelope 上的版本字段对得上当前进程支持的版本。
 *
 * 一旦对不上立刻抛 {@link UnsupportedRxDBChangeVersionError}，
 * 而不是返回 boolean —— 因为 `false` 在外部往往被忽略，让旧格式
 * 静默通过解码路径会让数据后续 crash 在更远的地方。
 */
const assertSupportedVersion = (value: { codecVersion?: unknown; schemaVersion?: unknown }): void => {
  if (value.codecVersion !== RXDB_CHANGE_CODEC_VERSION || value.schemaVersion !== RXDB_CHANGE_SCHEMA_VERSION) {
    throw new UnsupportedRxDBChangeVersionError(value.codecVersion, value.schemaVersion);
  }
};

/**
 * 把 `Uint8Array` 转成小写 hex 字符串。
 *
 * @remarks
 * 走手写循环 + 两位补零而非 `Array.from(bytes).map(b => b.toString(16)).join('')`：
 * 后者会先产生一个长度等于字节数的临时数组，再做 7 次字符串拼接，
 * 对几 KB 的 binary patch 来说不必要。同步编码的热点也在这条路径上。
 */
const bytesToHex = (bytes: Uint8Array): string => {
  let result = '';
  for (const byte of bytes) result += byte.toString(16).padStart(2, '0');
  return result;
};

/**
 * hex 字符串还原为 `Uint8Array`，格式不合法时抛错（不返回部分结果）。
 *
 * 长度必须为偶数、字符必须全在 `[0-9a-f]` 内 —— 不允许空白或 `0x` 前缀。
 * 这是 {@link bytesToHex} 的逆运算，外部不是用 `bytesToHex` 写入的数据
 * 不应该走这条路径（应当走 `decodeSpecialValue` 的 legacy 分支）。
 */
const hexToBytes = (value: string): Uint8Array => {
  if (value.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(value)) {
    throw new TypeError('Invalid RxDB binary change value');
  }
  const result = new Uint8Array(value.length / 2);
  for (let i = 0; i < result.length; i++) result[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return result;
};

/**
 * 把任意二进制来源（`Uint8Array` / `ArrayBuffer` / `ArrayBufferView`）深拷贝
 * 成独立 `Uint8Array`。
 *
 * @remarks
 * **深拷贝是必要的**：直接保留入参的 buffer 引用会让上层写出"修改 patch
 * 顺便改了实体"的隐患 —— 同一个 `ArrayBuffer` 被传给后续编码步骤时，
 * 原数组的写入会污染已编码好的字节。`slice()` 是显式重新分配字节。
 *
 * `ArrayBuffer.isView` 包含 `Uint8Array`，所以必须放在 `Uint8Array` 分支之后
 * —— 三条分支顺序倒过来会让 `Uint8Array` 也走 view 路径，丢掉 `Uint8Array`
 * 自身的 type 校验信息（虽然结果一样，但语义不清晰）。
 */
const copyBinary = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  throw new TypeError('Invalid RxDB binary change value');
};

type ChangeSpecialPropertyType = typeof PropertyType.bigint | typeof PropertyType.binary;

type RxDBChangeEntityMetadataResolver = (entity: string, namespace: string) => EntityMetadata | undefined;

const isChangeSpecialPropertyType = (type: unknown): type is ChangeSpecialPropertyType =>
  type === PropertyType.bigint || type === PropertyType.binary;

const getChangePropertyMetadata = (
  metadata: EntityMetadata,
  key: string,
  resolveEntityMetadata?: RxDBChangeEntityMetadataResolver
) => {
  const property = metadata.propertyMap.get(key);
  if (property || !resolveEntityMetadata) return property;
  const relation = metadata.foreignKeyRelationMap?.get(key);
  if (!relation) return undefined;
  return resolveEntityMetadata(relation.mappedEntity, relation.mappedNamespace ?? metadata.namespace)?.propertyMap.get(
    'id'
  );
};

const encodeSpecialValue = (type: ChangeSpecialPropertyType, value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  let encoded: EncodedChangeValue;
  if (type === PropertyType.bigint) {
    if (typeof value !== 'bigint') throw new TypeError('RxDB bigint change value must be a bigint');
    encoded = {
      codecVersion: RXDB_CHANGE_CODEC_VERSION,
      schemaVersion: RXDB_CHANGE_SCHEMA_VERSION,
      type: 'bigint',
      value: value.toString()
    };
  } else {
    encoded = {
      codecVersion: RXDB_CHANGE_CODEC_VERSION,
      schemaVersion: RXDB_CHANGE_SCHEMA_VERSION,
      type: 'binary',
      value: bytesToHex(copyBinary(value))
    };
  }
  return { [RXDB_CHANGE_VALUE_ENVELOPE_KEY]: encoded };
};

const getEncodedChangeValue = (value: unknown): EncodedChangeValue | undefined => {
  if (typeof value !== 'object' || value === null || !(RXDB_CHANGE_VALUE_ENVELOPE_KEY in value)) return undefined;
  const encoded = Reflect.get(value, RXDB_CHANGE_VALUE_ENVELOPE_KEY);
  if (typeof encoded !== 'object' || encoded === null) throw new TypeError('Invalid RxDB change value envelope');
  assertSupportedVersion(encoded as { codecVersion?: unknown; schemaVersion?: unknown });
  const type = Reflect.get(encoded, 'type');
  const payload = Reflect.get(encoded, 'value');
  if ((type !== 'bigint' && type !== 'binary') || typeof payload !== 'string') {
    throw new TypeError('Invalid RxDB change value envelope');
  }
  return encoded as EncodedChangeValue;
};

const decodeSpecialValue = (type: ChangeSpecialPropertyType, value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  const encoded = getEncodedChangeValue(value);
  if (!encoded) {
    if (type === PropertyType.bigint) {
      if (typeof value === 'bigint') return value;
      if (typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))) return BigInt(value);
      throw new TypeError('Invalid legacy RxDB bigint change value');
    }
    return copyBinary(value);
  }
  if (encoded.type !== type) {
    throw new TypeError(`RxDB change value type mismatch: expected ${type}, received ${encoded.type}`);
  }
  return encoded.type === 'bigint' ? BigInt(encoded.value) : hexToBytes(encoded.value);
};

/**
 * 把实体的字段变更包（`patch`）按列类型重新编码，让它在落盘 / 跨网络时仍是合法 JSON。
 *
 * @param metadata - 实体元数据，用来查每个 key 的实际类型
 * @param patch - 字段级变更；`null` / `undefined` 直接透传为 `null`
 * @param resolveEntityMetadata - 当 `key` 是外键且元数据上没声明映射时，用它
 *   反向查对端实体的 `id` 字段类型（比如多对多中间表只声明本侧外键）
 *
 * @remarks
 * 只对 `bigint` / `binary` 类型做编码，**加密列（`encrypted: true`）一律跳过**
 * —— 加密包内已经是一段 `ArrayBuffer`，再包一层 envelope 会让接收方把它当
 * 编码值再解一次，结果还是一坨字节流。
 *
 * 返回值是 `patch` 的浅拷贝，原对象不会被改动，方便在事务上下文里继续使用入参。
 */
export const encodeRxDBChangePatch = (
  metadata: EntityMetadata,
  patch: Readonly<Record<string, unknown>> | null | undefined,
  resolveEntityMetadata?: RxDBChangeEntityMetadataResolver
): Record<string, unknown> | null => {
  if (patch == null) return null;
  const result: Record<string, unknown> = { ...patch };
  for (const [key, value] of Object.entries(result)) {
    const property = getChangePropertyMetadata(metadata, key, resolveEntityMetadata);
    if (property?.encrypted !== true && isChangeSpecialPropertyType(property?.type)) {
      result[key] = encodeSpecialValue(property.type, value);
    }
  }
  return result;
};

/**
 * {@link encodeRxDBChangePatch} 的逆运算；语义、列过滤规则完全对称。
 *
 * 不存在的 envelope 走"legacy"分支：老 RxDB 把 `bigint` / `binary` 直接落 JSON，
 * 读端按 JS 类型反射还原。
 */
export const decodeRxDBChangePatch = (
  metadata: EntityMetadata,
  patch: Readonly<Record<string, unknown>> | null | undefined,
  resolveEntityMetadata?: RxDBChangeEntityMetadataResolver
): Record<string, unknown> | null => {
  if (patch == null) return null;
  const result: Record<string, unknown> = { ...patch };
  for (const [key, value] of Object.entries(result)) {
    const property = getChangePropertyMetadata(metadata, key, resolveEntityMetadata);
    if (property?.encrypted !== true && isChangeSpecialPropertyType(property?.type)) {
      result[key] = decodeSpecialValue(property.type, value);
    }
  }
  return result;
};

/**
 * 把 `RxDBEntityId` 包成带有版本号的字符串。字符串 ID 走原始通道；
 * 数值 / bigint ID 会带上前缀与类型 tag，方便反序列化时区分。
 *
 * 加上前缀 {@link RXDB_CHANGE_ENTITY_ID_PREFIX} 是为了**防止碰撞**：
 * `1` 和 `'1'` 在某些 NoSQL 存储里会合并成同一个 JSON key，
 * 加上前缀后两个都会被独立编码。
 */
export const encodeRxDBChangeEntityId = (id: RxDBEntityId): string => {
  const encoded: EncodedEntityId = {
    codecVersion: RXDB_CHANGE_CODEC_VERSION,
    schemaVersion: RXDB_CHANGE_SCHEMA_VERSION,
    type:
      typeof id === 'string' ? 'string'
      : typeof id === 'number' ? 'number'
      : 'bigint',
    value: String(id)
  };
  return RXDB_CHANGE_ENTITY_ID_PREFIX + JSON.stringify(encoded);
};

/**
 * 把一组 ID 拆成"用于 SQL `IN (...)` 列表"的字符串集合。
 *
 * 字符串 ID 同时放入原始值和带前缀的编码形式 —— 列里可能存的是任意一种
 * （历史数据只有原值，新写入则是编码形式），IN 列表需要兼容两者
 * 否则会漏掉新格式的记录。
 */
export const getRxDBChangeEntityIdQueryValues = (ids: readonly RxDBEntityId[]): string[] => {
  const values = new Set<string>();
  for (const id of ids) {
    if (typeof id === 'string') values.add(id);
    values.add(encodeRxDBChangeEntityId(id));
  }
  return [...values];
};

/**
 * {@link encodeRxDBChangeEntityId} 的反序列化。无前缀视为"未被编码过"，
 * 直接返回原值（兼容老 RxDB 数据）。
 */
export const decodeRxDBChangeEntityId = (value: unknown): RxDBEntityId => {
  if (typeof value === 'number' || typeof value === 'bigint') return value;
  if (typeof value !== 'string') throw new TypeError('Invalid RxDB change entityId');
  if (!value.startsWith(RXDB_CHANGE_ENTITY_ID_PREFIX)) return value;
  let encoded: unknown;
  try {
    encoded = JSON.parse(value.slice(RXDB_CHANGE_ENTITY_ID_PREFIX.length));
  } catch (cause) {
    throw new TypeError('Invalid RxDB change entityId envelope', { cause });
  }
  if (typeof encoded !== 'object' || encoded === null) throw new TypeError('Invalid RxDB change entityId envelope');
  assertSupportedVersion(encoded as { codecVersion?: unknown; schemaVersion?: unknown });
  const type = Reflect.get(encoded, 'type');
  const payload = Reflect.get(encoded, 'value');
  if (typeof payload !== 'string') throw new TypeError('Invalid RxDB change entityId envelope');
  if (type === 'string') return payload;
  if (type === 'bigint') return BigInt(payload);
  if (type === 'number') {
    const result = Number(payload);
    if (!Number.isFinite(result)) throw new TypeError('Invalid numeric RxDB change entityId');
    return result;
  }
  throw new TypeError('Invalid RxDB change entityId envelope');
};

/**
 * 把两段字节拼接成新的 `Uint8Array`，结果与入参解耦。
 *
 * 与 `Uint8Array.set` 不同的是，这里**总是**分配新 buffer，
 * 避免调用方拿到的字节被两个引用同时持有时一方修改污染另一方。
 */
const concatBytes = (prefix: Uint8Array, payload: Uint8Array): Uint8Array => {
  const result = new Uint8Array(prefix.byteLength + payload.byteLength);
  result.set(prefix);
  result.set(payload, prefix.byteLength);
  return result;
};

/**
 * 为 AAD（Additional Authenticated Data）和身份键编码实体标识。
 *
 * - **字符串 ID**：直接用 UTF-8 字节，校验"是不是合法 UTF-8"留给反序列化；
 * - **数值 / bigint ID**：在字节流前面塞入 `0xFF 0x52 0x58` 魔数 + 版本号 + 类型字节。
 *   起始 `0xFF` 在 UTF-8 里永远是**非法首字节**，所以反序列化能仅凭前缀安全地区分两类 ID，
 *   而不需要外部 schema 提示。
 *
 * 用例：
 * 1. 加密 adapter 把这段字节作为 AES-GCM 的 AAD，参与完整性校验；
 * 2. {@link getRxDBEntityIdentityKey} 再把它 hex 化，得到稳定的"身份键"字符串。
 */
export const encodeRxDBEntityIdentity = (id: RxDBEntityId): Uint8Array => {
  if (typeof id === 'string') return new TextEncoder().encode(id);
  if (typeof id === 'number' && !Number.isFinite(id)) throw new TypeError('RxDB entity number id must be finite');
  const type = typeof id === 'number' ? IDENTITY_NUMBER : IDENTITY_BIGINT;
  const value = typeof id === 'number' && Object.is(id, -0) ? '-0' : String(id);
  return concatBytes(Uint8Array.of(...IDENTITY_MAGIC, IDENTITY_VERSION, type), new TextEncoder().encode(value));
};

export const decodeRxDBEntityIdentity = (encoded: Uint8Array): RxDBEntityId => {
  const isTyped = encoded.byteLength >= 5 && IDENTITY_MAGIC.every((byte, index) => encoded[index] === byte);
  if (!isTyped) return new TextDecoder('utf-8', { fatal: true }).decode(encoded);
  const version = encoded[3];
  if (version !== IDENTITY_VERSION) throw new UnsupportedRxDBChangeVersionError(version, RXDB_CHANGE_SCHEMA_VERSION);
  const payload = new TextDecoder('utf-8', { fatal: true }).decode(encoded.subarray(5));
  if (encoded[4] === IDENTITY_BIGINT) return BigInt(payload);
  if (encoded[4] === IDENTITY_NUMBER) {
    const value = Number(payload);
    if (!Number.isFinite(value)) throw new TypeError('Invalid numeric RxDB entity identity');
    return value;
  }
  throw new TypeError('Invalid RxDB entity identity type');
};

/**
 * 计算一个稳定可索引的"身份键"字符串：`rxid1:` + 编码字节的 hex。
 *
 * 用作加密 adapter 的目录分桶主键（`Map<identityKey, encryptedData>`）。
 * 不会与原始 ID 撞键 —— 前缀是固定的非空字符串，绝不可能出现在合法 ID 里。
 */
export const getRxDBEntityIdentityKey = (id: RxDBEntityId): string =>
  IDENTITY_KEY_PREFIX + bytesToHex(encodeRxDBEntityIdentity(id));

/**
 * {@link getRxDBEntityIdentityKey} 的逆运算；不带前缀时视为"非身份键"，
 * 原样返回 —— 这样 `parseRxDBEntityIdentityKey(decodeRxDBEntityIdentityKey(x)) === x`
 * 对任意字符串 `x` 都不抛错，调用方可以无条件来回转。
 */
export const parseRxDBEntityIdentityKey = (key: string): RxDBEntityId => {
  if (!key.startsWith(IDENTITY_KEY_PREFIX)) return key;
  return decodeRxDBEntityIdentity(hexToBytes(key.slice(IDENTITY_KEY_PREFIX.length)));
};
