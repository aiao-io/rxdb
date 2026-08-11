import { describe, expect, it } from 'vitest';
import { scanForPlaintext } from '../test-helpers.js';

describe('scanForPlaintext', () => {
  it('returns empty when no sentinel matches', () => {
    const hits = scanForPlaintext({
      rawRows: [{ a: 'envelope:foo|bar', b: 42 }],
      sentinels: ['SECRET']
    });
    expect(hits).toEqual([]);
  });

  it('finds a string sentinel in a string column', () => {
    const hits = scanForPlaintext({
      rawRows: [{ ssn: '123-45-6789' }],
      sentinels: ['123-45-6789']
    });
    expect(hits).toEqual([{ rowIndex: 0, column: 'ssn', sentinel: '123-45-6789' }]);
  });

  it('scans Uint8Array column bytes as UTF-8', () => {
    const bytes = new TextEncoder().encode('Hello SECRET World');
    const hits = scanForPlaintext({
      rawRows: [{ blob: bytes }],
      sentinels: ['SECRET']
    });
    expect(hits).toEqual([{ rowIndex: 0, column: 'blob', sentinel: 'SECRET' }]);
  });

  it('JSON-stringifies object columns before searching', () => {
    const hits = scanForPlaintext({
      rawRows: [{ meta: { hidden: 'TOPSECRET' } }],
      sentinels: ['TOPSECRET']
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ rowIndex: 0, column: 'meta', sentinel: 'TOPSECRET' });
  });

  it('reports row index for each match across multiple rows', () => {
    const hits = scanForPlaintext({
      rawRows: [{ a: 'safe' }, { a: 'leak SECRET here' }, { a: 'SECRET twice here SECRET' }],
      sentinels: ['SECRET']
    });
    // 每个（row、column、sentinel）三元组只报告一次；第 2 行仍只报告一个命中，
    // 因为重复项不会重复计数。
    expect(hits.map(h => h.rowIndex)).toEqual([1, 2]);
  });

  it('handles chunk-boundary matches (sentinel split across rows)', () => {
    // 函数按行处理，因此跨两行拆分的 sentinel 不算单个命中；这是正确的，
    // 因为每一行都是独立的存储单元。这里断言不会产生误报。
    const hits = scanForPlaintext({
      rawRows: [{ a: 'SEC' }, { a: 'RET' }],
      sentinels: ['SECRET']
    });
    expect(hits).toEqual([]);
  });

  it('silently ignores non-string sentinels', () => {
    const hits = scanForPlaintext({
      rawRows: [{ a: 'hello' }],
      sentinels: ['', null as unknown as string, 'hello']
    });
    expect(hits).toEqual([{ rowIndex: 0, column: 'a', sentinel: 'hello' }]);
  });

  it('returns empty when sentinel list is empty', () => {
    expect(scanForPlaintext({ rawRows: [{ a: 'x' }], sentinels: [] })).toEqual([]);
  });

  it('scans ArrayBuffer column bytes as UTF-8', () => {
    const buf = new TextEncoder().encode('hello SECRET').buffer;
    const hits = scanForPlaintext({
      rawRows: [{ blob: buf }],
      sentinels: ['SECRET']
    });
    expect(hits).toHaveLength(1);
  });

  it('fails closed for columns whose JSON.stringify throws', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular['self'] = circular;
    expect(() =>
      scanForPlaintext({
        rawRows: [{ data: circular }],
        sentinels: ['anything']
      })
    ).toThrow(/cannot scan plaintext/i);
  });

  it.each([Symbol('secret'), () => 'secret'])('fails closed for unsupported value %s', value => {
    expect(() => scanForPlaintext({ rawRows: [{ data: value }], sentinels: ['secret'] })).toThrow(
      /cannot scan plaintext/i
    );
  });

  it('handles number, boolean, bigint, null, undefined values', () => {
    const hits = scanForPlaintext({
      rawRows: [{ n: 42, b: true, big: 9007199254740993n, nil: null, und: undefined }],
      sentinels: ['42', 'true', '9007199254740993']
    });
    expect(hits.map(h => h.column).sort()).toEqual(['b', 'big', 'n']);
  });

  // -- bytes 重载（T031）---------------------------------------------------

  it('bytes overload: returns empty when no sentinel found in raw file bytes', () => {
    const bytes = new TextEncoder().encode('SQLite format 3\u0000garbage');
    expect(scanForPlaintext({ bytes, sentinels: ['SENTINEL'] })).toEqual([]);
  });

  it('bytes overload: locates sentinel embedded anywhere in the byte stream', () => {
    const bytes = new TextEncoder().encode('header...SENTINEL_CC_4242...tail');
    const hits = scanForPlaintext({ bytes, sentinels: ['SENTINEL_CC_4242'] });
    expect(hits).toEqual([{ rowIndex: 0, column: '<bytes>', sentinel: 'SENTINEL_CC_4242' }]);
  });

  it('bytes overload: detects every distinct sentinel that appears', () => {
    const bytes = new TextEncoder().encode('foo S1 bar S2 baz');
    const hits = scanForPlaintext({ bytes, sentinels: ['S1', 'S2', 'S3'] });
    expect(hits.map(h => h.sentinel).sort()).toEqual(['S1', 'S2']);
  });

  it('bytes overload: scans past invalid UTF-8 bytes without decoding the file', () => {
    const head = new Uint8Array([0xff, 0xfe, 0xfd, 0x00, 0x01]); // 无效的 UTF-8
    const tail = new TextEncoder().encode('SENTINEL_TAIL_OK');
    const bytes = new Uint8Array(head.length + tail.length);
    bytes.set(head, 0);
    bytes.set(tail, head.length);
    const hits = scanForPlaintext({ bytes, sentinels: ['SENTINEL_TAIL_OK'] });
    expect(hits).toEqual([{ rowIndex: 0, column: '<bytes>', sentinel: 'SENTINEL_TAIL_OK' }]);
  });

  it('bytes overload: matches a multibyte UTF-8 sentinel byte-for-byte', () => {
    const sentinel = '明文探针-é';
    const bytes = new TextEncoder().encode(`prefix:${sentinel}:suffix`);
    expect(scanForPlaintext({ bytes, sentinels: [sentinel] })).toEqual([{ rowIndex: 0, column: '<bytes>', sentinel }]);
  });

  it('bytes overload: accepts ArrayBuffer in addition to Uint8Array', () => {
    const bytes = new TextEncoder().encode('hello SECRET world').buffer;
    const hits = scanForPlaintext({ bytes, sentinels: ['SECRET'] });
    expect(hits).toHaveLength(1);
  });

  it('bytes overload: empty sentinel list short-circuits', () => {
    const bytes = new TextEncoder().encode('anything');
    expect(scanForPlaintext({ bytes, sentinels: [] })).toEqual([]);
  });

  it('bytes overload: ignores empty / non-string sentinels', () => {
    const bytes = new TextEncoder().encode('ok TOKEN ok');
    const hits = scanForPlaintext({
      bytes,
      sentinels: ['', null as unknown as string, 'TOKEN']
    });
    expect(hits).toEqual([{ rowIndex: 0, column: '<bytes>', sentinel: 'TOKEN' }]);
  });
});
