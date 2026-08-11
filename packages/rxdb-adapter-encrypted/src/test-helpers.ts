/**
 * @fileoverview 测试助手 —— 仅供契约测试套件使用。
 *
 * `scanForPlaintext` 直接遍历从底层存储拉到的原始行（绕过
 * `getEntityObjectFromResult`），查找已知的哨兵子串。契约测试套件在常规 CRUD
 * 一轮往返之后，断言每个加密列的返回列表都**为空**。
 */

export interface ScanHit {
  rowIndex: number;
  column: string;
  sentinel: string;
}

/**
 * 每命中一个 (row, column, sentinel) 三元组返回一条记录——哨兵子串
 * 在该列的序列化表示里被找到。
 *
 * 两种调用形态：
 * - `{ rawRows, sentinels }` —— 按列扫描 SQL `SELECT *` 返回的行。
 *   每条命中会报告所在行的索引与列名。
 * - `{ bytes, sentinels }` —— 对 OPFS / IDB / Node FS dump 做逐字节冒烟扫描。
 *   命中会报告 `rowIndex: 0` 与 `column: '<bytes>'`。
 *
 * 按行规则（rawRows 形态）：
 * - `string` 列：直接用 `String#includes`。
 * - `Uint8Array` / `ArrayBuffer` 列：扫描解码后的 UTF-8 字节。
 * - 其他类型：先 `JSON.stringify` 再查找。
 *
 * 不支持或无法序列化的行值会抛错，避免用漏扫结果证明零明文。字节重载不解析
 * SQLite 页面、WAL 或空闲链表，不能单独作为“静态零明文”的完整证明。
 *
 * 非字符串哨兵会被静默跳过。
 */
export function scanForPlaintext(args: {
  rawRows: ReadonlyArray<Record<string, unknown>>;
  sentinels: ReadonlyArray<string>;
}): Array<ScanHit>;
export function scanForPlaintext(args: {
  bytes: Uint8Array | ArrayBuffer;
  sentinels: ReadonlyArray<string>;
}): Array<ScanHit>;
export function scanForPlaintext(
  args:
    | { rawRows: ReadonlyArray<Record<string, unknown>>; sentinels: ReadonlyArray<string> }
    | { bytes: Uint8Array | ArrayBuffer; sentinels: ReadonlyArray<string> }
): Array<ScanHit> {
  const sentinels = args.sentinels.filter(s => typeof s === 'string' && s.length > 0);
  if (sentinels.length === 0) return [];
  if ('bytes' in args) return scanBytes(args.bytes, sentinels);
  return scanRows(args.rawRows, sentinels);
}

function scanRows(rawRows: ReadonlyArray<Record<string, unknown>>, sentinels: ReadonlyArray<string>): Array<ScanHit> {
  const hits: ScanHit[] = [];
  for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex++) {
    const row = rawRows[rowIndex];
    for (const [column, value] of Object.entries(row)) {
      const text = stringify(value);
      if (text === null) continue;
      for (const sentinel of sentinels) {
        if (text.includes(sentinel)) {
          hits.push({ rowIndex, column, sentinel });
        }
      }
    }
  }
  return hits;
}

function scanBytes(bytes: Uint8Array | ArrayBuffer, sentinels: ReadonlyArray<string>): Array<ScanHit> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const hits: ScanHit[] = [];
  for (const sentinel of sentinels) {
    if (includesBytes(view, new TextEncoder().encode(sentinel))) {
      hits.push({ rowIndex: 0, column: '<bytes>', sentinel });
    }
  }
  return hits;
}

function includesBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  const lastStart = haystack.length - needle.length;
  for (let start = 0; start <= lastStart; start += 1) {
    let offset = 0;
    while (offset < needle.length && haystack[start + offset] === needle[offset]) offset += 1;
    if (offset === needle.length) return true;
  }
  return false;
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Uint8Array) return new TextDecoder('utf-8', { fatal: false }).decode(value);
  if (value instanceof ArrayBuffer) {
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(value));
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    throw new TypeError('Cannot scan plaintext: value is not JSON-serializable', { cause: error });
  }
  if (serialized === undefined) throw new TypeError('Cannot scan plaintext: unsupported value type');
  return serialized;
}
