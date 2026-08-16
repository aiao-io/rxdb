/**
 * 线协议的 **JSON 传输编码**。
 *
 * @remarks
 * {@link ../desktop-host-protocol.js | 线协议} 本身只承诺结构化克隆可传，因此 Electron 的
 * `ipcRenderer.invoke` 不需要任何编解码。Tauri 不同：它的 IPC 是 JSON，`bigint`
 * 会抛 `TypeError`、`Uint8Array` 会退化成 `{"0":1,...}`、`Date` 会变成字符串——
 * 三者正是协议里最依赖原语类型 rowId（bigint）/ blob（Uint8Array）/ recordAt（Date）的对象。
 *
 * 于是给 JSON 这条管子单独加一层带标签的编码。它是**传输层**的事，不是协议变更：
 * `DESKTOP_HOST_PROTOCOL_VERSION` 保持不变，Electron 路径完全不经过本模块。
 *
 * 标签形状（每个标签对象**有且只有**一个键）：
 * - `{ "$bigint": "9007199254740993" }` —— 十进制字符串，不经过 `number` 中转
 * - `{ "$u8": "Zm9v" }` —— 标准 base64（`+/` 字母表、带 `=` 补位）
 * - `{ "$date": 1699999999999 }` —— epoch 毫秒
 * - `{ "$esc": { ... } }` —— 用户数据本身长得像标签时的转义
 *
 * Rust 侧的镜像实现在 `apps/dev-rxdb-tauri/src-tauri/src/rxdb/value.rs`，
 * 两边共用同一批 fixture（见 `__tests__/desktop-json-codec.spec.ts`）。
 *
 * @module desktop-json-codec
 */

import { RxDBAdapterDesktopError } from './desktop-error.js';

const BIGINT_TAG = '$bigint';
const BYTES_TAG = '$u8';
const DATE_TAG = '$date';
const ESCAPE_TAG = '$esc';

const TAG_KEYS: ReadonlySet<string> = new Set([BIGINT_TAG, BYTES_TAG, DATE_TAG, ESCAPE_TAG]);

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 反查表；`0xff` 表示该字符不在字母表内。 */
const BASE64_SEXTETS = ((): Uint8Array => {
  const table = new Uint8Array(128).fill(0xff);
  for (let index = 0; index < BASE64_ALPHABET.length; index++) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

const violation = (message: string): RxDBAdapterDesktopError =>
  new RxDBAdapterDesktopError('protocol_violation', message);

const encodeBase64Tail = (bytes: Uint8Array, offset: number): string => {
  const remaining = bytes.length - offset;
  if (remaining === 0) return '';
  const bits = (bytes[offset] << 16) | (remaining > 1 ? bytes[offset + 1] << 8 : 0);
  const head = BASE64_ALPHABET[(bits >> 18) & 63] + BASE64_ALPHABET[(bits >> 12) & 63];
  return remaining === 1 ? `${head}==` : `${head}${BASE64_ALPHABET[(bits >> 6) & 63]}=`;
};

const encodeBase64 = (bytes: Uint8Array): string => {
  let text = '';
  let offset = 0;
  for (; offset + 3 <= bytes.length; offset += 3) {
    const bits = (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
    text +=
      BASE64_ALPHABET[(bits >> 18) & 63] +
      BASE64_ALPHABET[(bits >> 12) & 63] +
      BASE64_ALPHABET[(bits >> 6) & 63] +
      BASE64_ALPHABET[bits & 63];
  }
  return text + encodeBase64Tail(bytes, offset);
};

const sextetAt = (text: string, index: number): number => {
  const code = text.charCodeAt(index);
  const sextet = code < BASE64_SEXTETS.length ? BASE64_SEXTETS[code] : 0xff;
  if (sextet === 0xff) throw violation(`${BYTES_TAG} contains a character that is not standard base64`);
  return sextet;
};

/**
 * 严格按**规范形式**解码：长度必须是 4 的倍数、补位不超过两个、尾部丢弃的位必须为 0。
 *
 * @remarks
 * 宽松解码在这里是数据完整性问题而不是风格问题：`$u8` 载荷就是用户的 blob。少掉两个字符的
 * `"Zm9vYmFy"` 在宽松解码下会安静地还原成 4 字节而不是 6 字节——一条被截断的 blob 就这样
 * 落进了库里，等到它被读出来解析失败时，现场早已不在。要求长度对齐 4 就能挡住所有
 * 非 4 倍数的截断；要求丢弃位为 0 则让编码是单射的，同一串字节只有一种合法写法。
 *
 * 与 Rust 侧 `value.rs` 的 `decode_base64` 逐条对应。两边的编码器都只产出规范形式，
 * 因此收严只影响手写或被篡改的载荷。
 */
const decodeBase64 = (text: string): Uint8Array => {
  if (text.length % 4 !== 0) throw violation(`${BYTES_TAG} must be padded to a multiple of 4 characters`);
  let end = text.length;
  while (end > 0 && text[end - 1] === '=') end--;
  if (text.length - end > 2) throw violation(`${BYTES_TAG} has more than two padding characters`);
  const bytes = new Uint8Array(Math.floor((end * 6) / 8));
  let bits = 0;
  let bitCount = 0;
  let written = 0;
  for (let index = 0; index < end; index++) {
    bits = ((bits << 6) | sextetAt(text, index)) & 0xfff;
    bitCount += 6;
    if (bitCount < 8) continue;
    bitCount -= 8;
    bytes[written++] = (bits >> bitCount) & 0xff;
  }
  if (bits & ((1 << bitCount) - 1)) {
    throw violation(`${BYTES_TAG} has non-zero bits past the last whole byte, so it is not canonical base64`);
  }
  return bytes;
};

const isTagShaped = (value: Record<string, unknown>): boolean => {
  const keys = Object.keys(value);
  return keys.length === 1 && TAG_KEYS.has(keys[0]);
};

const encodeEntries = (value: Record<string, unknown>): Record<string, unknown> => {
  const encoded: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    // 丢掉 undefined 属性，与 `JSON.stringify` 一致；协议里的可选字段（batchTimeout）
    // 本来就按「缺席」解读，编成 null 反而会撞上 readBatchTimeout 的整数校验。
    if (item !== undefined) encoded[key] = encodeDesktopJsonPayload(item);
  }
  return encoded;
};

/**
 * 把协议负载编码成纯 JSON 可序列化的形状。
 *
 * @remarks
 * `undefined` 的处理与 `JSON.stringify` 对齐：对象属性直接省略，数组空位归一成 `null`
 * ——后者正是协议对绑定参数的既定语义（见 `desktop-host-protocol.ts` 的 `normalizeBinding`）。
 *
 * @param value - 协议请求、应答或变更事件
 * @returns 只含 JSON 原生类型与标签对象的等价负载
 */
export function encodeDesktopJsonPayload(value: unknown): unknown {
  if (typeof value === 'bigint') return { [BIGINT_TAG]: value.toString() };
  if (value instanceof Uint8Array) return { [BYTES_TAG]: encodeBase64(value) };
  if (value instanceof Date) return { [DATE_TAG]: value.getTime() };
  if (Array.isArray(value)) {
    return value.map(item => (item === undefined ? null : encodeDesktopJsonPayload(item)));
  }
  if (typeof value !== 'object' || value === null) return value;
  const encoded = encodeEntries(value as Record<string, unknown>);
  // 用户数据可以长成 `{ $bigint: 5 }`。不转义的话解码方会把它当标签读，
  // 于是一个普通对象被还原成了 bigint —— 转义把这条路堵死。
  return isTagShaped(encoded) ? { [ESCAPE_TAG]: encoded } : encoded;
}

const decodeEntries = (value: Record<string, unknown>): Record<string, unknown> => {
  const decoded: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) decoded[key] = decodeDesktopJsonPayload(item);
  return decoded;
};

const decodeTag = (tag: string, payload: unknown): unknown => {
  if (tag === BIGINT_TAG) {
    if (typeof payload !== 'string') throw violation(`${BIGINT_TAG} must carry a decimal string`);
    try {
      return BigInt(payload);
    } catch {
      throw violation(`${BIGINT_TAG} carried ${JSON.stringify(payload)}, which is not a decimal integer`);
    }
  }
  if (tag === BYTES_TAG) {
    if (typeof payload !== 'string') throw violation(`${BYTES_TAG} must carry a base64 string`);
    return decodeBase64(payload);
  }
  if (tag === DATE_TAG) {
    if (typeof payload !== 'number' || !Number.isFinite(payload)) {
      throw violation(`${DATE_TAG} must carry finite epoch milliseconds`);
    }
    return new Date(payload);
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw violation(`${ESCAPE_TAG} must carry a plain object`);
  }
  return decodeEntries(payload as Record<string, unknown>);
};

/**
 * 把 JSON 负载还原成协议使用的运行时类型。
 *
 * @remarks
 * 标签形状不合法时**抛错而不是原样返回**：一个畸形的 `$bigint` 悄悄当成普通对象往上走，
 * 最终会以「rowIds 不是 bigint 数组」的形式在离现场很远的地方炸掉。
 *
 * @param value - `JSON.parse` 之后的负载
 * @returns 含 `bigint` / `Uint8Array` / `Date` 的协议负载
 * @throws {@link RxDBAdapterDesktopError} 标签形状非法时抛 `protocol_violation`
 */
export function decodeDesktopJsonPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => decodeDesktopJsonPayload(item));
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  if (!isTagShaped(record)) return decodeEntries(record);
  const [tag] = Object.keys(record);
  return decodeTag(tag, record[tag]);
}
