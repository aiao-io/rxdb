/** 单个 Unicode 码点的解码结果。 */
interface CodePointResult {
  readonly codePoint: number;
  readonly width: number;
}

/** UTF-16 字符串中 `index` 位置的码点与宽度。 */
function codePointAt(value: string, index: number): CodePointResult {
  const first = value.charCodeAt(index);
  if (first >= 0xd800 && first <= 0xdbff) {
    const second = value.charCodeAt(index + 1);
    if (second >= 0xdc00 && second <= 0xdfff) {
      return { codePoint: 0x10000 + ((first - 0xd800) << 10) + second - 0xdc00, width: 2 };
    }
    return { codePoint: 0xfffd, width: 1 };
  }
  if (first >= 0xdc00 && first <= 0xdfff) return { codePoint: 0xfffd, width: 1 };
  return { codePoint: first, width: 1 };
}

/** 码点编码为 UTF-8 后的字节数。 */
function codePointByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/** 将码点写入 `output` 的 `offset` 处，返回写入字节数。 */
function writeCodePoint(codePoint: number, output: Uint8Array, offset: number): number {
  if (codePoint <= 0x7f) {
    output[offset] = codePoint;
    return 1;
  }
  if (codePoint <= 0x7ff) {
    output[offset] = 0xc0 | (codePoint >> 6);
    output[offset + 1] = 0x80 | (codePoint & 0x3f);
    return 2;
  }
  if (codePoint <= 0xffff) {
    output[offset] = 0xe0 | (codePoint >> 12);
    output[offset + 1] = 0x80 | ((codePoint >> 6) & 0x3f);
    output[offset + 2] = 0x80 | (codePoint & 0x3f);
    return 3;
  }
  output[offset] = 0xf0 | (codePoint >> 18);
  output[offset + 1] = 0x80 | ((codePoint >> 12) & 0x3f);
  output[offset + 2] = 0x80 | ((codePoint >> 6) & 0x3f);
  output[offset + 3] = 0x80 | (codePoint & 0x3f);
  return 4;
}

/** 微信小程序 TextEncoder polyfill，仅支持 UTF-8。 */
class MiniProgramTextEncoder {
  readonly encoding = 'utf-8';

  encode(input = ''): Uint8Array {
    const value = String(input);
    let length = 0;
    for (let index = 0; index < value.length;) {
      const point = codePointAt(value, index);
      length += codePointByteLength(point.codePoint);
      index += point.width;
    }
    const output = new Uint8Array(length);
    this.encodeInto(value, output);
    return output;
  }

  encodeInto(source: string, destination: Uint8Array): { read: number; written: number } {
    const value = String(source);
    let read = 0;
    let written = 0;
    while (read < value.length) {
      const point = codePointAt(value, read);
      const byteLength = codePointByteLength(point.codePoint);
      if (written + byteLength > destination.length) break;
      written += writeCodePoint(point.codePoint, destination, written);
      read += point.width;
    }
    return { read, written };
  }
}

/** 判断字节是否为 UTF-8 续字节（10xxxxxx）。 */
function isContinuation(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

/** 由首字节推导多字节序列长度。首字节合法返回 2/3/4，非法返回 0。 */
function sequenceLength(first: number): number {
  if (first >= 0xc2 && first <= 0xdf) return 2;
  if (first >= 0xe0 && first <= 0xef) return 3;
  if (first >= 0xf0 && first <= 0xf4) return 4;
  return 0;
}

/** 第二个字节的下界：E0、F0 收窄，排除过长编码。 */
function secondByteLower(first: number): number {
  if (first === 0xe0) return 0xa0;
  if (first === 0xf0) return 0x90;
  return 0x80;
}

/** 第二个字节的上界：ED 收窄排除代理区，F4 收窄排除 U+10FFFF 以上的码点。 */
function secondByteUpper(first: number): number {
  if (first === 0xed) return 0x9f;
  if (first === 0xf4) return 0x8f;
  return 0xbf;
}

/** 首字节 `first` 之后第 `offset` 个字节是否落在允许的区间（WHATWG UTF-8 decoder 的 lower/upper boundary）。 */
function continuesSequence(first: number, offset: number, byte: number): boolean {
  if (offset > 1) return isContinuation(byte);
  return byte >= secondByteLower(first) && byte <= secondByteUpper(first);
}

/**
 * 从 `index` 起与首字节相符的最长前缀的字节数（含首字节），不超过 `width`；等于 `width` 即一个合法序列。
 *
 * 不足 `width` 时按 WHATWG 的「最大子部分」规则：这段前缀只记一个 U+FFFD，打断它的字节不算进来，
 * 留给下一轮重新判断。所以 `E0 80 80` 是三个 U+FFFD、截在末尾的 `E2 82` 是一个，`E4 41` 里的 `A` 不会被吞掉。
 */
function validPrefixLength(bytes: Uint8Array, index: number, width: number): number {
  let length = 1;
  while (
    length < width &&
    index + length < bytes.length &&
    continuesSequence(bytes[index], length, bytes[index + length])
  ) {
    length++;
  }
  return length;
}

/** 从合法多字节序列中解码码点。 */
function decodeCodePoint(bytes: Uint8Array, index: number, width: number): number {
  const first = bytes[index];
  if (width === 2) return ((first & 0x1f) << 6) | (bytes[index + 1] & 0x3f);
  if (width === 3) {
    return ((first & 0x0f) << 12) | ((bytes[index + 1] & 0x3f) << 6) | (bytes[index + 2] & 0x3f);
  }
  return (
    ((first & 0x07) << 18) |
    ((bytes[index + 1] & 0x3f) << 12) |
    ((bytes[index + 2] & 0x3f) << 6) |
    (bytes[index + 3] & 0x3f)
  );
}

/** 将 `decode()` 的输入标准化为 `Uint8Array`。 */
function inputBytes(input: unknown): Uint8Array {
  if (input === undefined) return new Uint8Array();
  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  throw new TypeError('TextDecoder.decode 需要 ArrayBuffer 或 ArrayBufferView');
}

type DecoderEncoding = 'utf-8' | 'utf-16le';

/** 标准化编码标签，仅支持 UTF-8 和 UTF-16LE。 */
function normalizeDecoderEncoding(label: string): DecoderEncoding {
  const normalized = String(label).trim().toLowerCase();
  if (normalized === 'utf-8' || normalized === 'utf8') return 'utf-8';
  if (normalized === 'utf-16le' || normalized === 'utf16le' || normalized === 'utf-16') return 'utf-16le';
  throw new RangeError(`不支持的 TextDecoder 编码: ${label}`);
}

/** 根据 fatal 标志返回替换字符 U+FFFD 或抛出异常。 */
function invalidCharacter(fatal: boolean, encoding: DecoderEncoding): string {
  if (fatal) throw new TypeError(`TextDecoder 遇到无效的 ${encoding.toUpperCase()} 字节序列`);
  return '\ufffd';
}

/** 将 UTF-16LE 字节序列解码为字符串。 */
function decodeUtf16LittleEndian(bytes: Uint8Array, fatal: boolean): string {
  const output: string[] = [];
  let index = 0;
  while (index + 1 < bytes.length) {
    const first = bytes[index] | (bytes[index + 1] << 8);
    index += 2;
    if (first < 0xd800 || first > 0xdfff) {
      output.push(String.fromCharCode(first));
      continue;
    }
    if (first > 0xdbff || index + 1 >= bytes.length) {
      output.push(invalidCharacter(fatal, 'utf-16le'));
      continue;
    }
    const second = bytes[index] | (bytes[index + 1] << 8);
    if (second < 0xdc00 || second > 0xdfff) {
      output.push(invalidCharacter(fatal, 'utf-16le'));
      continue;
    }
    output.push(String.fromCharCode(first, second));
    index += 2;
  }
  if (index < bytes.length) output.push(invalidCharacter(fatal, 'utf-16le'));
  return output.join('');
}

/** 将 UTF-8 字节序列解码为字符串。 */
function decodeUtf8(bytes: Uint8Array, fatal: boolean): string {
  const output: string[] = [];
  for (let index = 0; index < bytes.length;) {
    if (bytes[index] <= 0x7f) {
      output.push(String.fromCharCode(bytes[index]));
      index++;
      continue;
    }
    const width = sequenceLength(bytes[index]);
    const length = width > 0 ? validPrefixLength(bytes, index, width) : 1;
    if (length === width) {
      output.push(String.fromCodePoint(decodeCodePoint(bytes, index, width)));
      index += width;
      continue;
    }
    output.push(invalidCharacter(fatal, 'utf-8'));
    index += length;
  }
  return output.join('');
}

/** 微信小程序 TextDecoder polyfill，支持 UTF-8 和 UTF-16LE。 */
class MiniProgramTextDecoder {
  readonly encoding: DecoderEncoding;
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;

  constructor(label = 'utf-8', options: { fatal?: boolean; ignoreBOM?: boolean } = {}) {
    this.encoding = normalizeDecoderEncoding(label);
    this.fatal = options.fatal === true;
    this.ignoreBOM = options.ignoreBOM === true;
  }

  decode(input?: ArrayBuffer | ArrayBufferView): string {
    const bytes = inputBytes(input);
    const value =
      this.encoding === 'utf-8' ? decodeUtf8(bytes, this.fatal) : decodeUtf16LittleEndian(bytes, this.fatal);
    return !this.ignoreBOM && value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
  }
}

/** 微信小程序 TextEncoder polyfill（仅 UTF-8）。 */
export const textEncoderPolyfill = MiniProgramTextEncoder as unknown as typeof TextEncoder;
/** 微信小程序 TextDecoder polyfill（UTF-8 / UTF-16LE）。 */
export const textDecoderPolyfill = MiniProgramTextDecoder as unknown as typeof TextDecoder;
