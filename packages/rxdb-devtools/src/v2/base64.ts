/**
 * @fileoverview v2 transfer 的 base64 编解码：RFC 4648 标准字母表 + 规范 padding。
 *
 * @remarks
 * **不能直接用平台 `atob`/`btoa` 当判据。** 实测浏览器与 happy-dom 的 `atob`：
 *
 * | 输入      | 形态         | atob | 协议要求 |
 * | --------- | ------------ | ---- | -------- |
 * | `"SGk="`  | 规范         | 接受 | 接受     |
 * | `"SGk"`   | 未填充       | 接受 | **拒绝** |
 * | `"SG k="` | 内嵌空白     | 接受 | **拒绝** |
 * | `"SGl="`  | 尾比特非零   | 接受 | **拒绝** |
 * | `"SGk=="` | 过填充       | 拒绝 | 拒绝     |
 * | `"-_8="`  | URL-safe     | 拒绝 | 拒绝     |
 *
 * 前三类若照 `atob` 是否抛异常来判，会静默通过——也就是说「非规范 padding 返回
 * `payload_encoding_invalid`」这条验收会假绿。所以这里自己解码，并按故事要求做
 * **解码 → 重新编码 → 逐字节等于原串**的往返比较，把「同一份内容有多个合法 wire 表示」
 * 这条歧义整体堵死。
 *
 * 注意本模块与 `src/serializer.ts` 的 **base64url 无填充**编码是两套东西：后者是 US-903
 * 冻结的实体值编码，不能合并。
 *
 * @module @aiao/rxdb-devtools/v2/base64
 */

/** RFC 4648 standard alphabet。 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 只允许标准字母表，且 padding 只能出现在末尾、最多两个。 */
const CANONICAL_SHAPE = /^[A-Za-z0-9+/]*={0,2}$/u;

/** charCode → 六位值的反查表；非字母表字符为 -1。 */
const SEXTET_BY_CHAR_CODE = buildSextetTable();

function buildSextetTable(): Int8Array {
  const table = new Int8Array(128).fill(-1);
  for (let index = 0; index < ALPHABET.length; index++) {
    table[ALPHABET.charCodeAt(index)] = index;
  }
  return table;
}

/** padding 字符 `=` 在解码时贡献 0 位；字符集已由 {@link CANONICAL_SHAPE} 保证。 */
function sextetAt(value: string, index: number): number {
  const sextet = SEXTET_BY_CHAR_CODE[value.charCodeAt(index)];
  return sextet < 0 ? 0 : sextet;
}

function paddingLength(value: string): number {
  if (value.endsWith('==')) return 2;
  if (value.endsWith('=')) return 1;
  return 0;
}

/**
 * 把字节序列编码为 RFC 4648 标准 base64（带规范 padding）。
 *
 * @param bytes - 待编码字节。
 * @returns 规范 base64 字符串；空输入返回空串。
 */
export function encodeCanonicalBase64(bytes: Uint8Array): string {
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const remaining = bytes.length - index;
    const word =
      (bytes[index] << 16) | ((remaining > 1 ? bytes[index + 1] : 0) << 8) | (remaining > 2 ? bytes[index + 2] : 0);
    encoded += ALPHABET.charAt((word >>> 18) & 0x3f) + ALPHABET.charAt((word >>> 12) & 0x3f);
    encoded += remaining > 1 ? ALPHABET.charAt((word >>> 6) & 0x3f) : '=';
    encoded += remaining > 2 ? ALPHABET.charAt(word & 0x3f) : '=';
  }
  return encoded;
}

/**
 * 解码 RFC 4648 标准 base64，并要求输入是该字节序列的**规范**编码。
 *
 * @remarks
 * 返回 `undefined` 而不是抛异常：调用方（transfer 状态机）要把它翻译成
 * `payload_encoding_invalid` 并**在刷新 idle deadline 之前**返回，异常路径会让这个顺序更难保证。
 *
 * @param value - 待解码值；非字符串一律视为非法。
 * @returns 解码后的字节；输入非规范时为 `undefined`。
 */
export function decodeCanonicalBase64(value: unknown): Uint8Array | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length % 4 !== 0) return undefined;
  if (!CANONICAL_SHAPE.test(value)) return undefined;

  const bytes = decodeValidatedShape(value);
  // 往返比较是「尾比特必须为零」这条规范性要求的唯一执行点：`"SGl="` 与 `"SGk="`
  // 解码到同一对字节，但只有后者是规范编码。放行前者等于给同一份内容留两个合法表示。
  return encodeCanonicalBase64(bytes) === value ? bytes : undefined;
}

/** 输入已通过长度与字符集校验，这里只做位拼装。 */
function decodeValidatedShape(value: string): Uint8Array {
  const byteLength = (value.length / 4) * 3 - paddingLength(value);
  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  for (let index = 0; index < value.length; index += 4) {
    const word =
      (sextetAt(value, index) << 18) |
      (sextetAt(value, index + 1) << 12) |
      (sextetAt(value, index + 2) << 6) |
      sextetAt(value, index + 3);
    if (offset < byteLength) bytes[offset++] = (word >>> 16) & 0xff;
    if (offset < byteLength) bytes[offset++] = (word >>> 8) & 0xff;
    if (offset < byteLength) bytes[offset++] = word & 0xff;
  }
  return bytes;
}
