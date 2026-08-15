/**
 * JSON 传输编码的契约测试（US-210 AC#2 / AC#3）。
 *
 * @remarks
 * 这些 fixture 同时被 Rust 侧的 `src-tauri/src/rxdb/value.rs` 单测逐字复刻。
 * 两边只要有一处走形，Tauri 传输就会在 rowId 或 blob 上悄悄丢数据——
 * 因此这里断言的是**编码后的 JSON 文本**，而不只是往返相等。
 */

import { describe, expect, it } from 'vitest';
import { RxDBAdapterDesktopError } from '../desktop-error.js';
import { decodeDesktopJsonPayload, encodeDesktopJsonPayload } from '../desktop-json-codec.js';

const roundTrip = (value: unknown): unknown =>
  decodeDesktopJsonPayload(JSON.parse(JSON.stringify(encodeDesktopJsonPayload(value))));

describe('desktop json codec', () => {
  it('leaves JSON native values untouched', () => {
    const value = { a: 1, b: 'two', c: true, d: null, e: [1, 'x', false, null], f: 1.5, g: -0.25 };
    expect(encodeDesktopJsonPayload(value)).toEqual(value);
    expect(roundTrip(value)).toEqual(value);
  });

  it('tags bigint as a decimal string so 2^53 boundaries survive JSON', () => {
    const huge = 9_007_199_254_740_993n;
    expect(encodeDesktopJsonPayload(huge)).toEqual({ $bigint: '9007199254740993' });
    expect(roundTrip(huge)).toBe(huge);
    expect(roundTrip(-1n)).toBe(-1n);
    expect(roundTrip(0n)).toBe(0n);
  });

  it('tags Uint8Array as standard padded base64', () => {
    expect(encodeDesktopJsonPayload(new Uint8Array([]))).toEqual({ $u8: '' });
    expect(encodeDesktopJsonPayload(new Uint8Array([102]))).toEqual({ $u8: 'Zg==' });
    expect(encodeDesktopJsonPayload(new Uint8Array([102, 111]))).toEqual({ $u8: 'Zm8=' });
    expect(encodeDesktopJsonPayload(new Uint8Array([102, 111, 111]))).toEqual({ $u8: 'Zm9v' });
    expect(encodeDesktopJsonPayload(new Uint8Array([251, 255, 190]))).toEqual({ $u8: '+/++' });
  });

  it('round trips every byte value through base64', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    const decoded = roundTrip(bytes);
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect([...(decoded as Uint8Array)]).toEqual([...bytes]);
  });

  it('tags Date as epoch milliseconds', () => {
    const recordAt = new Date('2026-08-15T01:02:03.456Z');
    expect(encodeDesktopJsonPayload(recordAt)).toEqual({ $date: recordAt.getTime() });
    const decoded = roundTrip(recordAt);
    expect(decoded).toBeInstanceOf(Date);
    expect((decoded as Date).toISOString()).toBe(recordAt.toISOString());
  });

  it('encodes a change event payload end to end', () => {
    const event = {
      kind: 'change',
      sessionId: 'a',
      event: { type: 18, dbName: 'main', tableName: 't', rowIds: [1n, 2n], recordAt: new Date(7) }
    };
    expect(encodeDesktopJsonPayload(event)).toEqual({
      kind: 'change',
      sessionId: 'a',
      event: {
        type: 18,
        dbName: 'main',
        tableName: 't',
        rowIds: [{ $bigint: '1' }, { $bigint: '2' }],
        recordAt: { $date: 7 }
      }
    });
    expect(roundTrip(event)).toEqual(event);
  });

  it('escapes user objects that happen to look like a tag', () => {
    const value = { $bigint: 5 };
    expect(encodeDesktopJsonPayload(value)).toEqual({ $esc: { $bigint: 5 } });
    expect(roundTrip(value)).toEqual(value);
    expect(roundTrip({ $esc: { $u8: 'not base64' } })).toEqual({ $esc: { $u8: 'not base64' } });
    // 两个键就不是标签形状，无需转义。
    expect(encodeDesktopJsonPayload({ $bigint: 5, other: 1 })).toEqual({ $bigint: 5, other: 1 });
  });

  it('drops undefined properties and normalizes undefined array slots to null', () => {
    expect(encodeDesktopJsonPayload({ a: 1, b: undefined })).toEqual({ a: 1 });
    expect(encodeDesktopJsonPayload([1, undefined])).toEqual([1, null]);
  });

  it('rejects malformed tags instead of guessing', () => {
    expect(() => decodeDesktopJsonPayload({ $bigint: 5 })).toThrow(RxDBAdapterDesktopError);
    expect(() => decodeDesktopJsonPayload({ $bigint: 'not a number' })).toThrow(RxDBAdapterDesktopError);
    expect(() => decodeDesktopJsonPayload({ $date: 'yesterday' })).toThrow(RxDBAdapterDesktopError);
    expect(() => decodeDesktopJsonPayload({ $u8: '!!!!' })).toThrow(RxDBAdapterDesktopError);
    // 4n+1 个有效字符解不出整字节数：载荷被截断了。
    expect(() => decodeDesktopJsonPayload({ $u8: 'Zm9vZ' })).toThrow(RxDBAdapterDesktopError);
    expect(() => decodeDesktopJsonPayload({ $esc: 5 })).toThrow(RxDBAdapterDesktopError);
    expect(() => decodeDesktopJsonPayload({ $esc: [1] })).toThrow(RxDBAdapterDesktopError);
  });

  /**
   * `$u8` 载荷是用户的 blob。宽松解码会把截断当成一条更短的 blob 安静地收下，
   * 等到它被读出来解析失败时现场早已不在——所以只认规范形式。
   */
  it('only accepts canonical base64, so a truncated blob cannot pass as a shorter one', () => {
    // "Zm9vYmFy" 掉两个字符：宽松解码会还原成 4 字节，规范化后长度对不齐 4，直接拒。
    expect(() => decodeDesktopJsonPayload({ $u8: 'Zm9vYm' })).toThrow(/multiple of 4/);
    expect(() => decodeDesktopJsonPayload({ $u8: 'Zg=' })).toThrow(/multiple of 4/);
    expect(() => decodeDesktopJsonPayload({ $u8: 'Zg===' })).toThrow(/multiple of 4/);
    expect(() => decodeDesktopJsonPayload({ $u8: '====' })).toThrow(/more than two padding/);
    // `Zm9=` 与 `Zm8=` 解出同一串字节，只有后者是编码器会产出的写法。
    expect(() => decodeDesktopJsonPayload({ $u8: 'Zm9=' })).toThrow(/not canonical/);
    expect(() => decodeDesktopJsonPayload({ $u8: 'Zh==' })).toThrow(/not canonical/);
  });

  it('keeps accepting every canonical padding shape', () => {
    expect(decodeDesktopJsonPayload({ $u8: '' })).toEqual(new Uint8Array([]));
    expect(decodeDesktopJsonPayload({ $u8: 'Zg==' })).toEqual(new Uint8Array([102]));
    expect(decodeDesktopJsonPayload({ $u8: 'Zm8=' })).toEqual(new Uint8Array([102, 111]));
    expect(decodeDesktopJsonPayload({ $u8: 'Zm9v' })).toEqual(new Uint8Array([102, 111, 111]));
    expect(decodeDesktopJsonPayload({ $u8: 'Zm9vYmFy' })).toEqual(new Uint8Array([102, 111, 111, 98, 97, 114]));
  });

  it('reports protocol_violation for malformed tags', () => {
    try {
      decodeDesktopJsonPayload({ $u8: '!!!!' });
      expect.unreachable('malformed base64 must throw');
    } catch (error) {
      expect((error as RxDBAdapterDesktopError).code).toBe('protocol_violation');
    }
  });
});
